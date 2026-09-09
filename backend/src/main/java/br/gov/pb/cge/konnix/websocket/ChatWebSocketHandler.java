package br.gov.pb.cge.konnix.websocket;

import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Component
public class ChatWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(ChatWebSocketHandler.class);
    private static final long DISCONNECT_GRACE_PERIOD_SECONDS = 4;

    private final ChatWebSocketSessionRegistry sessionRegistry;
    private final UserRepository userRepository;
    private final ChatEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;
    private final ScheduledExecutorService scheduler;
    private final Map<UUID, ScheduledFuture<?>> pendingDisconnects = new ConcurrentHashMap<>();

    @Autowired
    public ChatWebSocketHandler(ChatWebSocketSessionRegistry sessionRegistry,
                                UserRepository userRepository,
                                ChatEventPublisher eventPublisher,
                                ObjectMapper objectMapper) {
        this(sessionRegistry, userRepository, eventPublisher, objectMapper, Executors.newSingleThreadScheduledExecutor());
    }

    public ChatWebSocketHandler(ChatWebSocketSessionRegistry sessionRegistry,
                                UserRepository userRepository,
                                ChatEventPublisher eventPublisher,
                                ObjectMapper objectMapper,
                                ScheduledExecutorService scheduler) {
        this.sessionRegistry = sessionRegistry;
        this.userRepository = userRepository;
        this.eventPublisher = eventPublisher;
        this.objectMapper = objectMapper;
        this.scheduler = scheduler;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void clearStaleOnlineUsers() {
        userRepository.markOnlineUsersOffline();
    }

    @PreDestroy
    public void destroy() {
        scheduler.shutdownNow();
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        User user = AuthHandshakeInterceptor.authenticatedUser(session.getAttributes());
        if (user == null) {
            session.close(CloseStatus.NOT_ACCEPTABLE.withReason("Autenticação necessária"));
            return;
        }

        ScheduledFuture<?> pending = pendingDisconnects.remove(user.getId());
        if (pending != null) {
            pending.cancel(false);
            log.debug("Desconexão pendente cancelada para usuário {} (reconexão rápida/refresh)", user.getUsername());
        }

        sessionRegistry.register(user.getId(), session);
        userRepository.findById(user.getId()).ifPresent(current -> {
            boolean wasNotOnline = !"online".equals(current.getPresenceStatus());
            if (wasNotOnline) {
                current.setPresenceStatus("online");
                userRepository.save(current);
                eventPublisher.publishPresence(current.getId(), current.getUsername(), "online");
            } else if (sessionRegistry.sessionsOf(user.getId()).size() == 1) {
                eventPublisher.publishPresence(current.getId(), current.getUsername(), "online");
            }
        });
        log.debug("WebSocket conectado: usuário {} sessão {}", user.getUsername(), session.getId());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        User user = AuthHandshakeInterceptor.authenticatedUser(session.getAttributes());
        if (user != null) {
            sessionRegistry.unregister(user.getId(), session);
            if (sessionRegistry.sessionsOf(user.getId()).isEmpty()) {
                ScheduledFuture<?> existing = pendingDisconnects.get(user.getId());
                if (existing != null) {
                    existing.cancel(false);
                }
                ScheduledFuture<?> future = scheduler.schedule(() -> {
                    pendingDisconnects.remove(user.getId());
                    if (sessionRegistry.sessionsOf(user.getId()).isEmpty()) {
                        userRepository.findById(user.getId()).ifPresent(current -> {
                            if (!"offline".equals(current.getPresenceStatus())) {
                                current.setPresenceStatus("offline");
                                userRepository.save(current);
                                eventPublisher.publishPresence(current.getId(), current.getUsername(), "offline");
                                log.debug("Usuário {} marcado como offline após período de carência", current.getUsername());
                            }
                        });
                    }
                }, DISCONNECT_GRACE_PERIOD_SECONDS, TimeUnit.SECONDS);
                pendingDisconnects.put(user.getId(), future);
            }
        }
    }

    public void markUserOfflineImmediately(UUID userId) {
        ScheduledFuture<?> pending = pendingDisconnects.remove(userId);
        if (pending != null) {
            pending.cancel(false);
        }
        if (sessionRegistry.sessionsOf(userId).isEmpty()) {
            userRepository.findById(userId).ifPresent(current -> {
                if (!"offline".equals(current.getPresenceStatus())) {
                    current.setPresenceStatus("offline");
                    userRepository.save(current);
                    eventPublisher.publishPresence(current.getId(), current.getUsername(), "offline");
                }
            });
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        User user = AuthHandshakeInterceptor.authenticatedUser(session.getAttributes());
        if (user == null) return;
        try {
            JsonNode node = objectMapper.readTree(message.getPayload());
            String type = node.path("type").asText();
            if ("chat.typing".equals(type)) {
                String roomIdStr = node.path("roomId").asText();
                boolean isTyping = node.path("isTyping").asBoolean(true);
                if (roomIdStr != null && !roomIdStr.isBlank()) {
                    UUID roomId = UUID.fromString(roomIdStr);
                    eventPublisher.publishTyping(roomId, user.getId(), user.getUsername(), user.getName(), isTyping);
                }
            }
        } catch (Exception e) {
            log.debug("Frame WebSocket ignorado: {}", e.getMessage());
        }
    }
}
