package br.gov.pb.cge.konnix.push;

import br.gov.pb.cge.konnix.domain.push.PushSubscription;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import nl.martijndwars.webpush.Subscription;
import org.apache.http.HttpResponse;
import org.apache.http.client.HttpResponseException;
import org.apache.http.util.EntityUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.security.GeneralSecurityException;

@Component
public class WebPushSender implements PushSender {

    private static final Logger log = LoggerFactory.getLogger(WebPushSender.class);

    private final PushService pushService;

    public WebPushSender(PushSettings settings) {
        try {
            this.pushService = new PushService(settings.publicKey(), settings.privateKey(), settings.subject());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Falha ao configurar PushService com as chaves VAPID", e);
        }
    }

    @Override
    public void send(PushSubscription subscription, String payload) throws Exception {
        Subscription keys = new Subscription(subscription.getEndpoint(),
                new Subscription.Keys(subscription.getP256dh(), subscription.getAuth()));
        HttpResponse response = pushService.send(new Notification(keys, payload));
        int statusCode = response.getStatusLine().getStatusCode();

        if (statusCode == 201) {
            log.debug("Push enviado com sucesso para endpoint {}", subscription.getEndpoint());
            return;
        }

        String reason = "";
        if (response.getEntity() != null) {
            try {
                reason = EntityUtils.toString(response.getEntity());
            } catch (Exception ignored) {
            }
        }

        if (statusCode == 404 || statusCode == 410) {
            log.info("Endpoint de push expirado/inexistente ({}): {}", statusCode, subscription.getEndpoint());
            throw new HttpResponseException(statusCode, "Push endpoint expired (" + statusCode + "): " + reason);
        }

        log.warn("Falha no envio de push (status {}): {} para {}", statusCode, reason, subscription.getEndpoint());
        throw new HttpResponseException(statusCode, "Push gateway error (" + statusCode + "): " + reason);
    }
}
