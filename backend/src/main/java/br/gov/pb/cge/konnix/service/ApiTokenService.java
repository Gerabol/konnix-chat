package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.admin.dto.ApiTokenCreateRequest;
import br.gov.pb.cge.konnix.api.admin.dto.ApiTokenResponse;
import br.gov.pb.cge.konnix.api.exception.ApiExceptions;
import br.gov.pb.cge.konnix.domain.session.Session;
import br.gov.pb.cge.konnix.domain.session.SessionRepository;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.security.TokenService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ApiTokenService {

    private final SessionRepository sessionRepository;
    private final UserRepository userRepository;
    private final TokenService tokenService;
    private final PasswordEncoder passwordEncoder;

    public ApiTokenService(SessionRepository sessionRepository,
                           UserRepository userRepository,
                           TokenService tokenService,
                           PasswordEncoder passwordEncoder) {
        this.sessionRepository = sessionRepository;
        this.userRepository = userRepository;
        this.tokenService = tokenService;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public List<ApiTokenResponse> listApiTokens() {
        return sessionRepository.findByApiTokenTrueOrderByCreatedAtDesc().stream()
                .map(ApiTokenResponse::from)
                .toList();
    }

    @Transactional
    public Map<String, Object> createApiToken(ApiTokenCreateRequest request, UUID creatorUserId) {
        User target = userRepository.findByUsername(request.username().trim())
                .orElseThrow(ApiExceptions::invalidCredentials);
        if (!passwordEncoder.matches(request.password(), target.getPasswordHash())) {
            throw ApiExceptions.invalidCredentials();
        }
        LocalDate expirationDate;
        try {
            expirationDate = LocalDate.parse(request.expirationDate());
        } catch (RuntimeException error) {
            throw ApiExceptions.conflict("TOKEN_EXPIRATION_INVALID", "Data de expiração inválida");
        }
        Instant expiresAt = expirationDate.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        if (!expiresAt.isAfter(Instant.now())) {
            throw ApiExceptions.conflict("TOKEN_EXPIRATION_INVALID", "A data de expiração deve estar no futuro");
        }
        Duration ttl = Duration.between(Instant.now(), expiresAt);
        User creator = userRepository.findById(creatorUserId).orElseThrow(ApiExceptions::invalidCredentials);
        TokenService.IssuedToken issued = tokenService.issueApiToken(target, creator, ttl);
        return Map.of("token", issued.rawToken(), "metadata", ApiTokenResponse.from(issued.session()));
    }

    @Transactional
    public void revokeApiToken(UUID id) {
        Session session = sessionRepository.findById(id).orElseThrow(() -> ApiExceptions.notFound("api-token/" + id));
        if (!session.isApiToken()) {
            throw ApiExceptions.notFound("api-token/" + id);
        }
        session.setRevokedAt(Instant.now());
        sessionRepository.save(session);
    }
}
