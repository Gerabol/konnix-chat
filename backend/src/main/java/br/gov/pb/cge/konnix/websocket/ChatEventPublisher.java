package br.gov.pb.cge.konnix.websocket;

import br.gov.pb.cge.konnix.api.message.dto.MessageResponse;
import br.gov.pb.cge.konnix.api.room.dto.RoomResponse;
import br.gov.pb.cge.konnix.domain.room.RoomMemberRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Component
public class ChatEventPublisher {

    private static final Logger log = LoggerFactory.getLogger(ChatEventPublisher.class);

    private final ChatWebSocketSessionRegistry sessionRegistry;
    private final RoomMemberRepository roomMemberRepository;
    private final ObjectMapper objectMapper;

    public ChatEventPublisher(ChatWebSocketSessionRegistry sessionRegistry,
                              RoomMemberRepository roomMemberRepository,
                              ObjectMapper objectMapper) {
        this.sessionRegistry = sessionRegistry;
        this.roomMemberRepository = roomMemberRepository;
        this.objectMapper = objectMapper;
    }

    public void publish(UUID roomId, String eventType, MessageResponse message) {
        publishPayload(roomId, eventType, message);
    }

    public void publishPinnedMessage(UUID roomId, MessageResponse message) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("roomId", roomId);
        data.put("pinnedMessage", message);
        publishPayload(roomId, "room.pinned_message", data);
    }

    public void publishReadReceipt(UUID roomId, UUID messageId, UUID ownerId,
                                   br.gov.pb.cge.konnix.api.message.dto.ReadReceiptResponse receipt) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("messageId", messageId);
        data.put("userId", receipt.userId());
        data.put("username", receipt.username());
        data.put("name", receipt.name());
        data.put("readAt", receipt.readAt());
        publishToUser(ownerId, "message.read", roomId, data);
    }

    public void publishPresence(UUID userId, String username, String status) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("userId", userId);
        data.put("username", username);
        data.put("status", status);
        publishToAll("presence.updated", data);
    }

    public void publishRoomAdded(UUID userId, RoomResponse room) {
        publishToUser(userId, "room.added", room.id(), room);
    }

    public void publishRoomRemoved(UUID userId, UUID roomId) {
        publishToUser(userId, "room.removed", roomId, Map.of("roomId", roomId));
    }

    public void publishReaction(UUID roomId, br.gov.pb.cge.konnix.api.message.dto.MessageReactionResponse reaction,
                                boolean removed) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", reaction.id());
        data.put("messageId", reaction.messageId());
        data.put("userId", reaction.userId());
        data.put("username", reaction.username());
        data.put("emoji", reaction.emoji());
        data.put("createdAt", reaction.createdAt());
        data.put("removed", removed);
        publishPayload(roomId, "message.reaction", data);
    }

    private void publishToAll(String eventType, Object data) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", eventType);
        payload.put("data", data);
        try {
            String json = objectMapper.writeValueAsString(payload);
            sessionRegistry.allSessions().forEach(session -> send(session, json));
        } catch (JsonProcessingException e) {
            log.error("Falha ao serializar evento WebSocket {}", eventType, e);
        }
    }

    private void publishToUser(UUID userId, String eventType, UUID roomId, Object data) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", eventType);
        payload.put("roomId", roomId);
        payload.put("data", data);
        try {
            String json = objectMapper.writeValueAsString(payload);
            sessionRegistry.sessionsOf(userId).forEach(session -> send(session, json));
        } catch (JsonProcessingException e) {
            log.error("Falha ao serializar evento WebSocket {}", eventType, e);
        }
    }

    private void publishPayload(UUID roomId, String eventType, Object data) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", eventType);
        payload.put("roomId", roomId);
        payload.put("data", data);

        String json;
        try {
            json = objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            log.error("Falha ao serializar evento WebSocket {}", eventType, e);
            return;
        }

        roomMemberRepository.findByRoomId(roomId).stream()
                .map(member -> member.getUser().getId())
                .distinct()
                .forEach(userId -> sessionRegistry.sessionsOf(userId).forEach(session -> send(session, json)));
    }

    private void send(WebSocketSession session, String json) {
        if (!session.isOpen()) {
            return;
        }
        try {
            session.sendMessage(new TextMessage(json));
        } catch (IOException e) {
            log.debug("Falha ao enviar evento WebSocket para sessão {}", session.getId(), e);
        }
    }
}
