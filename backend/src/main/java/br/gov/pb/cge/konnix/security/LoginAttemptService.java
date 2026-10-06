package br.gov.pb.cge.konnix.security;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Limitador simples em memória (instância única) para tentativas de login falhas,
 * por usuário e por IP de origem.
 */
@Service
public class LoginAttemptService {

    static final int MAX_ATTEMPTS = 5;
    static final int MAX_ATTEMPTS_PER_IP = 20;
    static final long WINDOW_SECONDS = 900;
    static final int PURGE_THRESHOLD = 10_000;

    private static final class Attempts {
        int count;
        Instant first;
    }

    private final ConcurrentHashMap<String, Attempts> attempts = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Attempts> ipAttempts = new ConcurrentHashMap<>();

    public boolean isBlocked(String username) {
        return isOverLimit(attempts, normalize(username), MAX_ATTEMPTS);
    }

    public void registerFailure(String username) {
        register(attempts, normalize(username));
    }

    public void clear(String username) {
        attempts.remove(normalize(username));
    }

    public boolean isIpBlocked(String ipAddress) {
        return isOverLimit(ipAttempts, normalize(ipAddress), MAX_ATTEMPTS_PER_IP);
    }

    public void registerIpFailure(String ipAddress) {
        register(ipAttempts, normalize(ipAddress));
    }

    private boolean isOverLimit(ConcurrentHashMap<String, Attempts> store, String key, int max) {
        Attempts a = store.get(key);
        if (a == null) {
            return false;
        }
        if (isExpired(a)) {
            store.remove(key);
            return false;
        }
        return a.count >= max;
    }

    private void register(ConcurrentHashMap<String, Attempts> store, String key) {
        if (store.size() > PURGE_THRESHOLD) {
            store.values().removeIf(this::isExpired);
        }
        store.compute(key, (k, a) -> {
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

    private boolean isExpired(Attempts a) {
        return a.first.plusSeconds(WINDOW_SECONDS).isBefore(Instant.now());
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }
}
