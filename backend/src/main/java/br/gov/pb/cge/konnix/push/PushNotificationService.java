package br.gov.pb.cge.konnix.push;

import br.gov.pb.cge.konnix.api.message.dto.MessageResponse;
import br.gov.pb.cge.konnix.domain.push.PushSubscription;
import br.gov.pb.cge.konnix.domain.push.PushSubscriptionRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.http.client.HttpResponseException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class PushNotificationService {

    private static final Logger log = LoggerFactory.getLogger(PushNotificationService.class);

    private final PushSubscriptionRepository subscriptionRepository;
    private final PushSender pushSender;
    private final ObjectMapper objectMapper;

    public PushNotificationService(PushSubscriptionRepository subscriptionRepository,
                                   PushSender pushSender,
                                   ObjectMapper objectMapper) {
        this.subscriptionRepository = subscriptionRepository;
        this.pushSender = pushSender;
        this.objectMapper = objectMapper;
    }

    public void notifyNewMessage(UUID roomId, MessageResponse message, String roomDisplayName) {
        UUID senderId = message.userId();
        if (senderId == null || message.id() == null) {
            return;
        }
        String author = message.username() == null || message.username().isBlank() ? "Alguém" : message.username();
        for (PushSubscription subscription : subscriptionRepository.findByRoomId(roomId)) {
            if (senderId.equals(subscription.getUser().getId())) {
                continue;
            }
            if (Set.of("busy", "vacation").contains(subscription.getUser().getPresenceStatus())) {
                continue;
            }
            String payload = buildPayload(message.id(), roomId, roomDisplayName, author);
            try {
                pushSender.send(subscription, payload);
            } catch (HttpResponseException e) {
                if (e.getStatusCode() == 404 || e.getStatusCode() == 410) {
                    log.info("Subscription inválida/expirada removida: {}", subscription.getEndpoint());
                    subscriptionRepository.delete(subscription);
                } else {
                    log.warn("Push recusado (status {}) para {}", e.getStatusCode(), subscription.getEndpoint());
                }
            } catch (Exception e) {
                log.warn("Falha ao enviar push para {}", subscription.getEndpoint(), e);
            }
        }
    }

    public String buildPayload(UUID messageId, UUID roomId, String roomDisplayName, String author) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("url", "/room/" + roomId);
        data.put("roomId", roomId);
        data.put("messageId", messageId);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("title", "Konnix Chat");
        payload.put("body", "Nova mensagem de " + author + " em " + roomDisplayName);
        payload.put("data", data);
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Falha ao serializar payload de notificação", e);
        }
    }
}
