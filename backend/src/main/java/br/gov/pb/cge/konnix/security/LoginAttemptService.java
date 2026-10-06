package br.gov.pb.cge.konnix.security;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Limitador simples em memória (instância única) para tentativas de login falhas por usuário.
 */
@Service
public class LoginAttemptService {

    static final int MAX_ATTEMPTS = 5;
    static final long WINDOW_SECONDS = 300;
    static final int PURGE_THRESHOLD = 10_000;

    private static final class Attempts {
        int count;
        Instant first;
    }

    private final ConcurrentHashMap<String, Attempts> attempts = new ConcurrentHashMap<>();

    public boolean isBlocked(String username) {
        String key = normalize(username);
        Attempts a = attempts.get(key);
        if (a == null) {
            return false;
        }
        if (isExpired(a)) {
            attempts.remove(key);
            return false;
        }
        return a.count >= MAX_ATTEMPTS;
    }

    public void registerFailure(String username) {
        if (attempts.size() > PURGE_THRESHOLD) {
            attempts.values().removeIf(this::isExpired);
        }
        attempts.compute(normalize(username), (k, a) -> {
            if (a == null) {
                a = new Attempts();
                a.first = Instant.now();
            } else if (isExpired(a)) {
                a.count = 0;
                a.first = Instant.now();
            }
            a.count++;
            return a;
        });
    }

    public void clear(String username) {
        attempts.remove(normalize(username));
    }

    private boolean isExpired(Attempts a) {
        return a.first.plusSeconds(WINDOW_SECONDS).isBefore(Instant.now());
    }

    private String normalize(String username) {
        return username == null ? "" : username.trim().toLowerCase();
    }
}
