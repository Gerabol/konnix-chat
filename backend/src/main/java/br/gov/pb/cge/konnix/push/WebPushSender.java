package br.gov.pb.cge.konnix.push;

import br.gov.pb.cge.konnix.domain.push.PushSubscription;
import nl.martijndwars.webpush.Encoding;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import nl.martijndwars.webpush.Subscription;
import nl.martijndwars.webpush.Urgency;
import org.apache.http.HttpResponse;
import org.apache.http.client.HttpResponseException;
import org.springframework.stereotype.Component;

import java.security.GeneralSecurityException;

@Component
public class WebPushSender implements PushSender {

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

        // RFC 8291 exige estritamente Encoding.AES128GCM.
        // O método padrão pushService.send(Notification) utiliza o legado Encoding.AESGCM (Draft 03),
        // que é tolerado pelo FCM (Android) mas REJEITADO sumariamente pelo Apple APNs (iOS Web Push).
        HttpResponse response = pushService.send(new Notification(keys, payload, Urgency.HIGH), Encoding.AES128GCM);
        int statusCode = response.getStatusLine().getStatusCode();

        if (statusCode == 201) {
            return;
        }

        if (statusCode == 404 || statusCode == 410) {
            throw new HttpResponseException(statusCode, "Push endpoint expired (" + statusCode + ")");
        }

        throw new HttpResponseException(statusCode, "Push gateway error (" + statusCode + ")");
    }
}
