package br.gov.pb.cge.konnix.websocket;

import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class ChatWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(ChatWebSocketHandler.class);

    private final ChatWebSocketSessionRegistry sessionRegistry;
    private final UserRepository userRepository;
    private final ChatEventPublisher eventPublisher;

    public ChatWebSocketHandler(ChatWebSocketSessionRegistry sessionRegistry,
                                UserRepository userRepository,
                                ChatEventPublisher eventPublisher) {
        this.sessionRegistry = sessionRegistry;
        this.userRepository = userRepository;
        this.eventPublisher = eventPublisher;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void clearStaleOnlineUsers() {
        userRepository.markOnlineUsersOffline();
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        User user = AuthHandshakeInterceptor.authenticatedUser(session.getAttributes());
        if (user == null) {
            session.close(CloseStatus.NOT_ACCEPTABLE.withReason("Autenticação necessária"));
            return;
        }
        sessionRegistry.register(user.getId(), session);
        userRepository.findById(user.getId()).ifPresent(current -> {
            if (!"online".equals(current.getPresenceStatus())) {
                current.setPresenceStatus("online");
                userRepository.save(current);
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
                userRepository.findById(user.getId()).ifPresent(current -> {
                    if (!"offline".equals(current.getPresenceStatus())) {
                        current.setPresenceStatus("offline");
                        userRepository.save(current);
                        eventPublisher.publishPresence(current.getId(), current.getUsername(), "offline");
                    }
                });
            }
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        // Eventos são enviados apenas pelo servidor (server push); sem echo.
    }
}
