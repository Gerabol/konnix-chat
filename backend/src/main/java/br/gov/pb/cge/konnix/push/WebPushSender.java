package br.gov.pb.cge.konnix.push;

import br.gov.pb.cge.konnix.domain.push.PushSubscription;
import nl.martijndwars.webpush.Encoding;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import nl.martijndwars.webpush.Subscription;
import nl.martijndwars.webpush.Urgency;
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

        // RFC 8291 exige estritamente Encoding.AES128GCM.
        // O método padrão pushService.send(Notification) utiliza o legado Encoding.AESGCM (Draft 03),
        // que é tolerado pelo FCM (Android) mas REJEITADO sumariamente pelo Apple APNs (iOS Web Push).
        HttpResponse response = pushService.send(new Notification(keys, payload, Urgency.HIGH), Encoding.AES128GCM);
        int statusCode = response.getStatusLine().getStatusCode();

        String gateway = identifyGateway(subscription.getEndpoint());
        String maskedEndpoint = maskEndpoint(subscription.getEndpoint());
        if (statusCode == 201) {
            log.info("Push gateway ({}) respondeu HTTP 201 Created para endpoint {}", gateway, maskedEndpoint);
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
            log.info("Push gateway ({}) recusou endpoint expirado/inexistente (HTTP {}): {}", gateway, statusCode, maskedEndpoint);
            throw new HttpResponseException(statusCode, "Push endpoint expired (" + statusCode + "): " + reason);
        }

        log.warn("Falha no envio de push via {} (HTTP {}): {} para {}", gateway, statusCode, reason, maskedEndpoint);
        throw new HttpResponseException(statusCode, "Push gateway error (" + statusCode + "): " + reason);
    }

    private static String identifyGateway(String endpoint) {
        if (endpoint == null) return "Unknown";
        if (endpoint.contains("apple.com")) return "Apple APNs";
        if (endpoint.contains("google") || endpoint.contains("fcm")) return "Google FCM";
        if (endpoint.contains("mozilla") || endpoint.contains("autopush")) return "Mozilla Autopush";
        if (endpoint.contains("windows.com") || endpoint.contains("microsoft")) return "Microsoft WNS";
        return "WebPush";
    }

    private static String maskEndpoint(String endpoint) {
        if (endpoint == null) return "null";
        if (endpoint.length() <= 40) return endpoint;
        return endpoint.substring(0, 30) + "..." + endpoint.substring(endpoint.length() - 8);
    }
}
