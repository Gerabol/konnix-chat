package br.gov.pb.cge.konnix.push;

import br.gov.pb.cge.konnix.api.message.dto.MessageResponse;
import br.gov.pb.cge.konnix.domain.message.MessageRepository;
import br.gov.pb.cge.konnix.domain.push.PushSubscription;
import br.gov.pb.cge.konnix.domain.push.PushSubscriptionRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.http.client.HttpResponseException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.ForkJoinPool;

@Service
public class PushNotificationService {

    private static final Logger log = LoggerFactory.getLogger(PushNotificationService.class);

    private final PushSubscriptionRepository subscriptionRepository;
    private final PushSender pushSender;
    private final ObjectMapper objectMapper;
    private final MessageRepository messageRepository;
    private final Executor executor;

    @Autowired
    public PushNotificationService(PushSubscriptionRepository subscriptionRepository,
                                   PushSender pushSender,
                                   ObjectMapper objectMapper,
                                   @Autowired(required = false) MessageRepository messageRepository) {
        this(subscriptionRepository, pushSender, objectMapper, messageRepository, ForkJoinPool.commonPool());
    }

    public PushNotificationService(PushSubscriptionRepository subscriptionRepository,
                                   PushSender pushSender,
                                   ObjectMapper objectMapper,
                                   MessageRepository messageRepository,
                                   Executor executor) {
        this.subscriptionRepository = subscriptionRepository;
        this.pushSender = pushSender;
        this.objectMapper = objectMapper;
        this.messageRepository = messageRepository;
        this.executor = executor != null ? executor : ForkJoinPool.commonPool();
    }

    public void notifyNewMessage(UUID roomId, MessageResponse message, String roomDisplayName) {
        UUID senderId = message.userId();
        if (senderId == null || message.id() == null) {
            return;
        }
        String author = message.username() == null || message.username().isBlank() ? "Alguém" : message.username();
        executor.execute(() -> {
            try {
                var subscriptions = subscriptionRepository.findByRoomId(roomId);
                log.info("Processando envio de Web Push para sala {} ({} subscrições encontradas)", roomId, subscriptions.size());

                int sent = 0;
                int skipped = 0;

                for (PushSubscription subscription : subscriptions) {
                    if (senderId.equals(subscription.getUser().getId())) {
                        skipped++;
                        continue;
                    }
                    String presence = subscription.getUser().getPresenceStatus();
                    if (presence != null && Set.of("busy", "vacation").contains(presence)) {
                        skipped++;
                        continue;
                    }

                    long unreadCount = 1L;
                    if (messageRepository != null) {
                        try {
                            long total = messageRepository.countTotalUnreadByUserId(subscription.getUser().getId());
                            unreadCount = total > 0 ? total : 1L;
                        } catch (Exception e) {
                            log.debug("Não foi possível calcular unreadCount para o usuário {}", subscription.getUser().getId(), e);
                        }
                    }

                    String payload = buildPayload(message.id(), roomId, roomDisplayName, author, unreadCount);
                    String maskedEndpoint = maskEndpoint(subscription.getEndpoint());
                    try {
                        pushSender.send(subscription, payload);
                        sent++;
                        log.info("Push entregue ao gateway com sucesso para {}", maskedEndpoint);
                    } catch (HttpResponseException e) {
                        if (e.getStatusCode() == 404 || e.getStatusCode() == 410) {
                            log.info("Subscription expirada/inválida removida do banco (HTTP {}): {}", e.getStatusCode(), maskedEndpoint);
                            subscriptionRepository.delete(subscription);
                        } else {
                            log.warn("Push recusado pelo gateway (status {}) para {}", e.getStatusCode(), maskedEndpoint);
                        }
                    } catch (Exception e) {
                        log.warn("Falha ao enviar push para {}: {}", maskedEndpoint, e.getMessage());
                    }
                }
                log.info("Concluído envio de Web Push da sala {}: {} enviados, {} ignorados", roomId, sent, skipped);
            } catch (Exception e) {
                log.warn("Falha ao processar notificações push da sala {}", roomId, e);
            }
        });
    }

    private static String maskEndpoint(String endpoint) {
        if (endpoint == null) return "null";
        if (endpoint.length() <= 40) return endpoint;
        return endpoint.substring(0, 30) + "..." + endpoint.substring(endpoint.length() - 8);
    }

    public String buildPayload(UUID messageId, UUID roomId, String roomDisplayName, String author) {
        return buildPayload(messageId, roomId, roomDisplayName, author, 1L);
    }

    public String buildPayload(UUID messageId, UUID roomId, String roomDisplayName, String author, long unreadCount) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("url", "/room/" + roomId);
        data.put("roomId", roomId);
        data.put("messageId", messageId);
        data.put("unreadCount", unreadCount);

        String bodyText;
        if (roomDisplayName == null || roomDisplayName.isBlank() || roomDisplayName.equalsIgnoreCase(author)) {
            bodyText = "Nova mensagem de " + author;
        } else {
            bodyText = "Nova mensagem de " + author + " em " + roomDisplayName;
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("title", "Konnix Chat");
        payload.put("body", bodyText);
        payload.put("unreadCount", unreadCount);
        payload.put("data", data);
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Falha ao serializar payload de notificação", e);
        }
    }
}
