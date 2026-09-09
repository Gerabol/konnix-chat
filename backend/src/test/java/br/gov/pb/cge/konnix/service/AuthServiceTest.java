package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.dto.LoginRequest;
import br.gov.pb.cge.konnix.api.dto.LoginResponse;
import br.gov.pb.cge.konnix.domain.audit.AuditService;
import br.gov.pb.cge.konnix.domain.session.Session;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.security.LoginAttemptService;
import br.gov.pb.cge.konnix.security.TokenService;
import br.gov.pb.cge.konnix.websocket.ChatEventPublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private TokenService tokenService;

    @Mock
    private AuditService auditService;

    @Mock
    private LoginAttemptService loginAttemptService;

    @Mock
    private UserService userService;

    @Mock
    private ChatEventPublisher eventPublisher;

    private AuthService authService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(
                userRepository,
                passwordEncoder,
                tokenService,
                auditService,
                loginAttemptService,
                userService,
                eventPublisher
        );
    }

    @Test
    void loginComSucessoAlteraPresencaParaOnlineEPublicaEvento() {
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        user.setUsername("joao");
        user.setName("João Silva");
        user.setPasswordHash("hash123");
        user.setPresenceStatus("offline");

        when(loginAttemptService.isBlocked("joao")).thenReturn(false);
        when(userRepository.findByUsername("joao")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("senha123", "hash123")).thenReturn(true);
        when(tokenService.issue(user)).thenReturn(new TokenService.IssuedToken("knx_dummy_token", new Session()));

        LoginResponse response = authService.login(new LoginRequest("joao", "senha123"), "127.0.0.1");

        assertThat(response).isNotNull();
        assertThat(response.token()).isEqualTo("knx_dummy_token");
        assertThat(response.user().presenceStatus()).isEqualTo("online");

        assertThat(user.getPresenceStatus()).isEqualTo("online");
        verify(userRepository).save(user);
        verify(eventPublisher).publishPresence(userId, "joao", "online");
        verify(loginAttemptService).clear("joao");
    }

    @Test
    void meComUsuarioOfflineAlteraPresencaParaOnlineEPublicaEvento() {
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        user.setUsername("maria");
        user.setName("Maria Silva");
        user.setPresenceStatus("offline");

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        br.gov.pb.cge.konnix.security.AuthenticatedUser principal =
                new br.gov.pb.cge.konnix.security.AuthenticatedUser(userId, "maria", "Maria Silva", java.util.Set.of("USER"));

        var response = authService.me(principal);

        assertThat(response).isNotNull();
        assertThat(response.presenceStatus()).isEqualTo("online");
        assertThat(user.getPresenceStatus()).isEqualTo("online");
        verify(userRepository).save(user);
        verify(eventPublisher).publishPresence(userId, "maria", "online");
    }

    @Test
    void meComUsuarioOcupadoMantemStatusOcupado() {
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        user.setUsername("maria");
        user.setName("Maria Silva");
        user.setPresenceStatus("busy");

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        br.gov.pb.cge.konnix.security.AuthenticatedUser principal =
                new br.gov.pb.cge.konnix.security.AuthenticatedUser(userId, "maria", "Maria Silva", java.util.Set.of("USER"));

        var response = authService.me(principal);

        assertThat(response).isNotNull();
        assertThat(response.presenceStatus()).isEqualTo("busy");
        assertThat(user.getPresenceStatus()).isEqualTo("busy");
        verify(userRepository, never()).save(user);
        verify(eventPublisher, never()).publishPresence(any(), any(), any());
    }
}
