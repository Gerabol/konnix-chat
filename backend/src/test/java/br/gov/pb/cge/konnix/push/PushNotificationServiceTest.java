package br.gov.pb.cge.konnix.push;

import br.gov.pb.cge.konnix.api.message.dto.MessageResponse;
import br.gov.pb.cge.konnix.domain.push.PushSubscription;
import br.gov.pb.cge.konnix.domain.push.PushSubscriptionRepository;
import br.gov.pb.cge.konnix.domain.user.User;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.http.client.HttpResponseException;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PushNotificationServiceTest {

    private final PushSubscriptionRepository repository = mock(PushSubscriptionRepository.class);
    private final PushSender sender = mock(PushSender.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final PushNotificationService service =
            new PushNotificationService(repository, sender, objectMapper);

    @Test
    void naoNotificaAutor() throws Exception {
        UUID authorId = UUID.randomUUID();
        UUID otherId = UUID.randomUUID();
        PushSubscription authorSub = subscription(authorId, "https://push.example.com/a");
        PushSubscription otherSub = subscription(otherId, "https://push.example.com/b");
        when(repository.findByRoomId(any())).thenReturn(List.of(authorSub, otherSub));

        service.notifyNewMessage(UUID.randomUUID(), message(authorId, "admin", "conteúdo sigiloso"), "Grupo Financeiro");

        verify(sender, times(1)).send(eq(otherSub), anyString());
        verify(sender, never()).send(eq(authorSub), anyString());
    }

    @Test
    void payloadSemConteudoSensivel() throws Exception {
        UUID roomId = UUID.randomUUID();
        UUID messageId = UUID.randomUUID();

        String payload = service.buildPayload(messageId, roomId, "Grupo Financeiro", "joao");

        JsonNode node = objectMapper.readTree(payload);
        assertThat(node.path("title").asText()).isEqualTo("Konnix Chat");
        assertThat(node.path("body").asText()).isEqualTo("Nova mensagem de joao em Grupo Financeiro");
        assertThat(node.path("data").path("url").asText()).isEqualTo("/room/" + roomId);
        assertThat(node.path("data").path("roomId").asText()).isEqualTo(roomId.toString());
        assertThat(node.path("data").path("messageId").asText()).isEqualTo(messageId.toString());
        assertThat(payload).doesNotContain("joao disse");
    }

    @Test
    void subscriptionInvalida410Removida() throws Exception {
        UUID otherId = UUID.randomUUID();
        PushSubscription sub = subscription(otherId, "https://push.example.com/gone");
        when(repository.findByRoomId(any())).thenReturn(List.of(sub));
        doThrow(new HttpResponseException(410, "Gone")).when(sender).send(eq(sub), anyString());

        service.notifyNewMessage(UUID.randomUUID(), message(UUID.randomUUID(), "admin", "oi"), "Financeiro");

        verify(repository).delete(sub);
    }

    @Test
    void erroGenericoMantemSubscription() throws Exception {
        UUID otherId = UUID.randomUUID();
        PushSubscription sub = subscription(otherId, "https://push.example.com/flaky");
        when(repository.findByRoomId(any())).thenReturn(List.of(sub));
        doThrow(new IOException("boom")).when(sender).send(eq(sub), anyString());

        service.notifyNewMessage(UUID.randomUUID(), message(UUID.randomUUID(), "admin", "oi"), "Financeiro");

        verify(repository, never()).delete(any());
    }

    private PushSubscription subscription(UUID userId, String endpoint) {
        User user = new User();
        user.setId(userId);
        PushSubscription sub = new PushSubscription();
        sub.setId(UUID.randomUUID());
        sub.setUser(user);
        sub.setEndpoint(endpoint);
        sub.setP256dh("p256dh");
        sub.setAuth("auth");
        return sub;
    }

    private MessageResponse message(UUID userId, String username, String content) {
        return new MessageResponse(
                UUID.randomUUID(),
                UUID.randomUUID(),
                userId,
                username,
                content,
                "USER",
                null,
                null,
                Instant.now(),
                Instant.now(),
                null,
                null);
    }
}
