package br.gov.pb.cge.konnix.push;

import br.gov.pb.cge.konnix.domain.push.PushSubscription;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import org.apache.http.HttpResponse;
import org.apache.http.ProtocolVersion;
import org.apache.http.client.HttpResponseException;
import org.apache.http.entity.StringEntity;
import org.apache.http.message.BasicHttpResponse;
import org.apache.http.message.BasicStatusLine;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WebPushSenderTest {

    private final PushSettings settings = new PushSettings(null, null, "mailto:admin@konnix.local");

    @Test
    void aceitaStatus201CreatedComSucesso() throws Exception {
        PushService pushService = mock(PushService.class);
        HttpResponse response = new BasicHttpResponse(new BasicStatusLine(new ProtocolVersion("HTTP", 1, 1), 201, "Created"));
        when(pushService.send(any(Notification.class))).thenReturn(response);

        WebPushSender sender = new WebPushSender(settings);
        ReflectionTestUtils.setField(sender, "pushService", pushService);

        PushSubscription sub = sampleSubscription();
        assertThatCode(() -> sender.send(sub, "{}")).doesNotThrowAnyException();
    }

    @Test
    void lancaExcecaoComStatus410QuandoExpirada() throws Exception {
        PushService pushService = mock(PushService.class);
        BasicHttpResponse response = new BasicHttpResponse(new BasicStatusLine(new ProtocolVersion("HTTP", 1, 1), 410, "Gone"));
        response.setEntity(new StringEntity("subscription has expired"));
        when(pushService.send(any(Notification.class))).thenReturn(response);

        WebPushSender sender = new WebPushSender(settings);
        ReflectionTestUtils.setField(sender, "pushService", pushService);

        PushSubscription sub = sampleSubscription();
        assertThatThrownBy(() -> sender.send(sub, "{}"))
                .isInstanceOf(HttpResponseException.class)
                .satisfies(ex -> assertThat(((HttpResponseException) ex).getStatusCode()).isEqualTo(410));
    }

    @Test
    void lancaExcecaoComStatus401QuandoVapidInvalido() throws Exception {
        PushService pushService = mock(PushService.class);
        BasicHttpResponse response = new BasicHttpResponse(new BasicStatusLine(new ProtocolVersion("HTTP", 1, 1), 401, "Unauthorized"));
        response.setEntity(new StringEntity("Unauthorized"));
        when(pushService.send(any(Notification.class))).thenReturn(response);

        WebPushSender sender = new WebPushSender(settings);
        ReflectionTestUtils.setField(sender, "pushService", pushService);

        PushSubscription sub = sampleSubscription();
        assertThatThrownBy(() -> sender.send(sub, "{}"))
                .isInstanceOf(HttpResponseException.class)
                .satisfies(ex -> assertThat(((HttpResponseException) ex).getStatusCode()).isEqualTo(401));
    }

    private PushSubscription sampleSubscription() {
        try {
            java.security.KeyPairGenerator gen = java.security.KeyPairGenerator.getInstance("EC", "BC");
            gen.initialize(new java.security.spec.ECGenParameterSpec("secp256r1"));
            java.security.KeyPair pair = gen.generateKeyPair();
            String p256dh = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(
                    nl.martijndwars.webpush.Utils.encode((org.bouncycastle.jce.interfaces.ECPublicKey) pair.getPublic()));

            PushSubscription sub = new PushSubscription();
            sub.setEndpoint("https://fcm.googleapis.com/fcm/send/sample-token");
            sub.setP256dh(p256dh);
            sub.setAuth("authSecretKey123_45");
            return sub;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
