package br.gov.pb.cge.konnix.security;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class LoginAttemptService {

    static final int MAX_ATTEMPTS = 5;
    static final long WINDOW_SECONDS = 900;

    private static final class Attempts {
        int count;
        Instant first;
    }

    private final ConcurrentHashMap<String, Attempts> attempts = new ConcurrentHashMap<>();

    public boolean isBlocked(String username) {
        Attempts a = attempts.get(normalize(username));
        if (a == null) {
            return false;
        }
        if (a.first.plusSeconds(WINDOW_SECONDS).isBefore(Instant.now())) {
            attempts.remove(normalize(username));
            return false;
        }
        return a.count >= MAX_ATTEMPTS;
    }

    public void registerFailure(String username) {
        String key = normalize(username);
        attempts.compute(key, (k, a) -> {
            if (a == null) {
                a = new Attempts();
                a.first = Instant.now();
            } else if (a.first.plusSeconds(WINDOW_SECONDS).isBefore(Instant.now())) {
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

    private String normalize(String username) {
        return username == null ? "" : username.trim().toLowerCase();
    }
}
