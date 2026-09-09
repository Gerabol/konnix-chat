package br.gov.pb.cge.konnix.websocket;

import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ChatWebSocketHandlerTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private ChatEventPublisher eventPublisher;

    @Mock
    private WebSocketSession session;

    private ChatWebSocketSessionRegistry sessionRegistry;
    private ChatWebSocketHandler handler;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        sessionRegistry = new ChatWebSocketSessionRegistry();
        objectMapper = new ObjectMapper();
        handler = new ChatWebSocketHandler(sessionRegistry, userRepository, eventPublisher, objectMapper);
    }

    @Test
    void conectarUsuarioOfflineAlteraStatusParaOnlineEPublica() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        user.setUsername("fulano");
        user.setPresenceStatus("offline");

        Map<String, Object> attributes = new HashMap<>();
        attributes.put("authenticatedUser", user);
        when(session.getAttributes()).thenReturn(attributes);
        when(session.getId()).thenReturn("session-1");
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        handler.afterConnectionEstablished(session);

        assertThat(user.getPresenceStatus()).isEqualTo("online");
        verify(userRepository).save(user);
        verify(eventPublisher).publishPresence(userId, "fulano", "online");
        assertThat(sessionRegistry.sessionsOf(userId)).contains(session);
    }

    @Test
    void conectarPrimeiraSessaoComStatusJaOnlineReforcaPublicacao() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        user.setUsername("beltrano");
        user.setPresenceStatus("online");

        Map<String, Object> attributes = new HashMap<>();
        attributes.put("authenticatedUser", user);
        when(session.getAttributes()).thenReturn(attributes);
        when(session.getId()).thenReturn("session-1");
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        handler.afterConnectionEstablished(session);

        verify(userRepository, never()).save(user);
        verify(eventPublisher).publishPresence(userId, "beltrano", "online");
        assertThat(sessionRegistry.sessionsOf(userId)).contains(session);
    }

    @Test
    void conectarSegundaSessaoDeUsuarioJaOnlineNaoDuplicaPublicacao() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        user.setUsername("sicrano");
        user.setPresenceStatus("online");

        WebSocketSession session1 = mock(WebSocketSession.class);
        sessionRegistry.register(userId, session1);

        Map<String, Object> attributes = new HashMap<>();
        attributes.put("authenticatedUser", user);
        when(session.getAttributes()).thenReturn(attributes);
        when(session.getId()).thenReturn("session-2");
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        handler.afterConnectionEstablished(session);

        verify(eventPublisher, never()).publishPresence(any(), any(), any());
        assertThat(sessionRegistry.sessionsOf(userId)).hasSize(2);
    }

    @Test
    void fecharUltimaSessaoAlteraStatusParaOfflineEPublica() {
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        user.setUsername("fulano");
        user.setPresenceStatus("online");

        sessionRegistry.register(userId, session);

        Map<String, Object> attributes = new HashMap<>();
        attributes.put("authenticatedUser", user);
        when(session.getAttributes()).thenReturn(attributes);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        handler.afterConnectionClosed(session, CloseStatus.NORMAL);

        assertThat(user.getPresenceStatus()).isEqualTo("offline");
        verify(userRepository).save(user);
        verify(eventPublisher).publishPresence(userId, "fulano", "offline");
        assertThat(sessionRegistry.sessionsOf(userId)).isEmpty();
    }

    @Test
    void fecharUmaDeMultiplasSessoesMantemOnline() {
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        user.setUsername("fulano");
        user.setPresenceStatus("online");

        WebSocketSession session2 = mock(WebSocketSession.class);
        sessionRegistry.register(userId, session);
        sessionRegistry.register(userId, session2);

        Map<String, Object> attributes = new HashMap<>();
        attributes.put("authenticatedUser", user);
        when(session.getAttributes()).thenReturn(attributes);

        handler.afterConnectionClosed(session, CloseStatus.NORMAL);

        verify(userRepository, never()).save(any());
        verify(eventPublisher, never()).publishPresence(any(), any(), any());
        assertThat(sessionRegistry.sessionsOf(userId)).containsExactly(session2);
    }
}
