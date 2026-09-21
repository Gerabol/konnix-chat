package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.admin.dto.ApiTokenCreateRequest;
import br.gov.pb.cge.konnix.api.admin.dto.ApiTokenResponse;
import br.gov.pb.cge.konnix.api.exception.ApiException;
import br.gov.pb.cge.konnix.domain.session.Session;
import br.gov.pb.cge.konnix.domain.session.SessionRepository;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.security.TokenService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ApiTokenServiceTest {

    @Mock
    private SessionRepository sessionRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private TokenService tokenService;

    @Mock
    private PasswordEncoder passwordEncoder;

    private ApiTokenService apiTokenService;

    @BeforeEach
    void setUp() {
        apiTokenService = new ApiTokenService(sessionRepository, userRepository, tokenService, passwordEncoder);
    }

    @Test
    void listApiTokensReturnsMappedResponses() {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setUsername("bot");

        Session session = new Session();
        session.setId(UUID.randomUUID());
        session.setUser(user);
        session.setApiToken(true);
        session.setCreatedAt(Instant.now());
        session.setExpiresAt(Instant.now().plus(Duration.ofDays(30)));

        when(sessionRepository.findByApiTokenTrueOrderByCreatedAtDesc()).thenReturn(List.of(session));

        List<ApiTokenResponse> responses = apiTokenService.listApiTokens();

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).id()).isEqualTo(session.getId());
    }

    @Test
    void createApiTokenValidCredentialsIssuesToken() {
        UUID creatorId = UUID.randomUUID();
        User target = new User();
        target.setId(UUID.randomUUID());
        target.setUsername("bot");
        target.setPasswordHash("hashed-pw");

        User creator = new User();
        creator.setId(creatorId);
        creator.setUsername("admin");

        String futureDate = LocalDate.now().plusDays(30).toString();
        ApiTokenCreateRequest request = new ApiTokenCreateRequest("bot", "secret123", futureDate);

        Session issuedSession = new Session();
        issuedSession.setId(UUID.randomUUID());
        issuedSession.setUser(target);
        issuedSession.setApiToken(true);
        issuedSession.setCreatedAt(Instant.now());
        issuedSession.setExpiresAt(Instant.now().plus(Duration.ofDays(30)));

        when(userRepository.findByUsername("bot")).thenReturn(Optional.of(target));
        when(passwordEncoder.matches("secret123", "hashed-pw")).thenReturn(true);
        when(userRepository.findById(creatorId)).thenReturn(Optional.of(creator));
        when(tokenService.issueApiToken(eq(target), eq(creator), any(Duration.class)))
                .thenReturn(new TokenService.IssuedToken("raw-api-token-xyz", issuedSession));

        Map<String, Object> result = apiTokenService.createApiToken(request, creatorId);

        assertThat(result.get("token")).isEqualTo("raw-api-token-xyz");
        assertThat(result.get("metadata")).isNotNull();
    }

    @Test
    void createApiTokenInvalidPasswordThrows() {
        User target = new User();
        target.setUsername("bot");
        target.setPasswordHash("hashed-pw");

        ApiTokenCreateRequest request = new ApiTokenCreateRequest("bot", "wrong-pw", "2026-12-31");

        when(userRepository.findByUsername("bot")).thenReturn(Optional.of(target));
        when(passwordEncoder.matches("wrong-pw", "hashed-pw")).thenReturn(false);

        assertThatThrownBy(() -> apiTokenService.createApiToken(request, UUID.randomUUID()))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void revokeApiTokenSetsRevokedAt() {
        UUID sessionId = UUID.randomUUID();
        Session session = new Session();
        session.setId(sessionId);
        session.setApiToken(true);

        when(sessionRepository.findById(sessionId)).thenReturn(Optional.of(session));

        apiTokenService.revokeApiToken(sessionId);

        assertThat(session.getRevokedAt()).isNotNull();
        verify(sessionRepository).save(session);
    }

    @Test
    void revokeNonApiTokenThrowsNotFound() {
        UUID sessionId = UUID.randomUUID();
        Session session = new Session();
        session.setId(sessionId);
        session.setApiToken(false);

        when(sessionRepository.findById(sessionId)).thenReturn(Optional.of(session));

        assertThatThrownBy(() -> apiTokenService.revokeApiToken(sessionId))
                .isInstanceOf(ApiException.class);
    }
}
