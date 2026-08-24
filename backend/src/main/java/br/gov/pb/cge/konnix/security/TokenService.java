package br.gov.pb.cge.konnix.security;

import br.gov.pb.cge.konnix.domain.session.Session;
import br.gov.pb.cge.konnix.domain.session.SessionRepository;
import br.gov.pb.cge.konnix.domain.user.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

@Service
public class TokenService {

    public static final Duration SESSION_TTL = Duration.ofDays(7);

    private final SessionRepository sessionRepository;
    private final SecureRandom secureRandom = new SecureRandom();

    public TokenService(SessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository;
    }

    public record IssuedToken(String rawToken, Session session) {
    }

    @Transactional
    public IssuedToken issue(User user) {
        return issue(user, null, false, SESSION_TTL);
    }

    public IssuedToken issueApiToken(User user, User creator, Duration ttl) {
        return issue(user, creator, true, ttl);
    }

    private IssuedToken issue(User user, User creator, boolean apiToken, Duration ttl) {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        String rawToken = "knx_" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        Session session = new Session();
        session.setUser(user);
        session.setTokenHash(hash(rawToken));
        session.setExpiresAt(Instant.now().plus(ttl));
        session.setApiToken(apiToken);
        session.setCreatedBy(creator);
        session.setTokenPreview(rawToken.substring(0, Math.min(16, rawToken.length())) + "...");
        sessionRepository.save(session);

        return new IssuedToken(rawToken, session);
    }

    @Transactional(readOnly = true)
    public Optional<User> validate(String rawToken) {
        String tokenHash = hash(rawToken);
        return sessionRepository.findByTokenHash(tokenHash)
                .filter(s -> s.getRevokedAt() == null)
                .filter(s -> s.getExpiresAt().isAfter(Instant.now()))
                .map(Session::getUser)
                .filter(user -> !user.isDisabled());
    }

    @Transactional
    public Optional<User> revoke(String rawToken) {
        return sessionRepository.findByTokenHash(hash(rawToken))
                .filter(s -> s.getRevokedAt() == null)
                .map(s -> {
                    s.setRevokedAt(Instant.now());
                    sessionRepository.save(s);
                    return s.getUser();
                });
    }

    public static String hash(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hashed);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 indisponível", e);
        }
    }
}
