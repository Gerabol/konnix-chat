package br.gov.pb.cge.konnix.push;

import nl.martijndwars.webpush.Utils;
import org.bouncycastle.jce.interfaces.ECPrivateKey;
import org.bouncycastle.jce.interfaces.ECPublicKey;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Security;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;

@Component
public class PushSettings {

    private static final Logger log = LoggerFactory.getLogger(PushSettings.class);

    static {
        Security.addProvider(new BouncyCastleProvider());
    }

    private final String publicKey;
    private final String privateKey;
    private final String subject;

    public PushSettings(@Value("${konnix.vapid.public-key:}") String publicKey,
                        @Value("${konnix.vapid.private-key:}") String privateKey,
                        @Value("${konnix.vapid.subject:mailto:konnix@localhost}") String subject) {
        if (isBlank(publicKey) || isBlank(privateKey)) {
            KeyPair pair = generateVapidKeyPair();
            this.publicKey = b64(Utils.encode((ECPublicKey) pair.getPublic()));
            this.privateKey = b64(Utils.encode((ECPrivateKey) pair.getPrivate()));
            log.warn("Chaves VAPID não configuradas (KONNIX_VAPID_PUBLIC_KEY/KONNIX_VAPID_PRIVATE_KEY). "
                    + "Geradas em memória: notificações push não sobrevivem a reinicializações. "
                    + "Chave pública: {}", this.publicKey);
        } else {
            this.publicKey = publicKey;
            this.privateKey = privateKey;
        }
        this.subject = subject;
    }

    public String publicKey() {
        return publicKey;
    }

    public String privateKey() {
        return privateKey;
    }

    public String subject() {
        return subject;
    }

    private static KeyPair generateVapidKeyPair() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC", "BC");
            generator.initialize(new ECGenParameterSpec("secp256r1"));
            return generator.generateKeyPair();
        } catch (Exception e) {
            throw new IllegalStateException("Falha ao gerar chaves VAPID", e);
        }
    }

    private static String b64(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
