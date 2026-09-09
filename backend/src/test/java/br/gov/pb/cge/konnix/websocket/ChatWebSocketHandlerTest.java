package br.gov.pb.cge.konnix.websocket;

import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

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

    @Mock
    private ScheduledExecutorService scheduler;

    @Mock
    private ScheduledFuture scheduledFuture;

    private ChatWebSocketSessionRegistry sessionRegistry;
    private ChatWebSocketHandler handler;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        sessionRegistry = new ChatWebSocketSessionRegistry();
        objectMapper = new ObjectMapper();
        handler = new ChatWebSocketHandler(sessionRegistry, userRepository, eventPublisher, objectMapper, scheduler);
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
    void fecharUltimaSessaoNaoAlteraImediatamenteParaOffline() {
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        user.setUsername("fulano");
        user.setPresenceStatus("online");

        sessionRegistry.register(userId, session);

        Map<String, Object> attributes = new HashMap<>();
        attributes.put("authenticatedUser", user);
        when(session.getAttributes()).thenReturn(attributes);
        doReturn(scheduledFuture).when(scheduler).schedule(any(Runnable.class), eq(ChatWebSocketHandler.DISCONNECT_GRACE_PERIOD_SECONDS), eq(TimeUnit.SECONDS));

        handler.afterConnectionClosed(session, CloseStatus.NORMAL);

        // Não deve alterar para offline imediatamente (evita falso offline no refresh)
        assertThat(user.getPresenceStatus()).isEqualTo("online");
        verify(userRepository, never()).save(any());
        verify(eventPublisher, never()).publishPresence(any(), any(), any());
        assertThat(sessionRegistry.sessionsOf(userId)).isEmpty();
        verify(scheduler).schedule(any(Runnable.class), eq(ChatWebSocketHandler.DISCONNECT_GRACE_PERIOD_SECONDS), eq(TimeUnit.SECONDS));
    }

    @Test
    void aposPeriodoDeCarenciaSemReconexaoAlteraParaOffline() {
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

        ArgumentCaptor<Runnable> runnableCaptor = ArgumentCaptor.forClass(Runnable.class);
        doReturn(scheduledFuture).when(scheduler).schedule(runnableCaptor.capture(), eq(ChatWebSocketHandler.DISCONNECT_GRACE_PERIOD_SECONDS), eq(TimeUnit.SECONDS));

        handler.afterConnectionClosed(session, CloseStatus.NORMAL);

        // Dispara a tarefa agendada simulando o fim do período de carência (4s) sem reconexão
        runnableCaptor.getValue().run();

        assertThat(user.getPresenceStatus()).isEqualTo("offline");
        verify(userRepository).save(user);
        verify(eventPublisher).publishPresence(userId, "fulano", "offline");
    }

    @Test
    void reconectarDentroDoPeriodoDeCarenciaCancelaDesconexao() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        user.setUsername("fulano");
        user.setPresenceStatus("online");

        sessionRegistry.register(userId, session);

        Map<String, Object> attributes = new HashMap<>();
        attributes.put("authenticatedUser", user);
        when(session.getAttributes()).thenReturn(attributes);

        ArgumentCaptor<Runnable> runnableCaptor = ArgumentCaptor.forClass(Runnable.class);
        doReturn(scheduledFuture).when(scheduler).schedule(runnableCaptor.capture(), eq(ChatWebSocketHandler.DISCONNECT_GRACE_PERIOD_SECONDS), eq(TimeUnit.SECONDS));

        // 1. Fecha sessão antiga (refresh da página iniciado)
        handler.afterConnectionClosed(session, CloseStatus.NORMAL);
        assertThat(sessionRegistry.sessionsOf(userId)).isEmpty();
        verify(scheduledFuture, never()).cancel(anyBoolean());

        // 2. Nova sessão conecta dentro do período de carência (refresh concluído)
        WebSocketSession newSession = mock(WebSocketSession.class);
        when(newSession.getAttributes()).thenReturn(attributes);
        when(newSession.getId()).thenReturn("session-new");
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        handler.afterConnectionEstablished(newSession);

        // A desconexão agendada deve ter sido cancelada imediatamente
        verify(scheduledFuture).cancel(false);

        // Se a tarefa do timer for executada posteriormente, não deve alterar para offline
        runnableCaptor.getValue().run();
        assertThat(user.getPresenceStatus()).isEqualTo("online");
        verify(userRepository, never()).save(any());
        verify(eventPublisher, never()).publishPresence(userId, "fulano", "offline");
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

        verify(scheduler, never()).schedule(any(Runnable.class), anyLong(), any());
        verify(userRepository, never()).save(any());
        verify(eventPublisher, never()).publishPresence(any(), any(), any());
        assertThat(sessionRegistry.sessionsOf(userId)).containsExactly(session2);
    }
}
