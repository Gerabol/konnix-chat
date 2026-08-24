package br.gov.pb.cge.konnix.push;

import br.gov.pb.cge.konnix.domain.push.PushSubscription;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import nl.martijndwars.webpush.Subscription;
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
        pushService.send(new Notification(keys, payload));
    }
}
