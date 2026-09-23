package br.gov.pb.cge.konnix.push;

import nl.martijndwars.webpush.Utils;
import org.bouncycastle.jce.interfaces.ECPrivateKey;
import org.bouncycastle.jce.interfaces.ECPublicKey;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import br.gov.pb.cge.konnix.domain.settings.AppSetting;
import br.gov.pb.cge.konnix.domain.settings.AppSettingRepository;
import org.springframework.beans.factory.annotation.Autowired;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Security;
import java.security.spec.ECGenParameterSpec;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

@Component
public class PushSettings {

    private static final Logger log = LoggerFactory.getLogger(PushSettings.class);
    public static final String VAPID_PUBLIC_KEY_SETTING = "vapid.public_key";
    public static final String VAPID_PRIVATE_KEY_SETTING = "vapid.private_key";

    static {
        Security.addProvider(new BouncyCastleProvider());
    }

    private final String publicKey;
    private final String privateKey;
    private final String subject;

    public PushSettings(@Value("${konnix.vapid.public-key:}") String publicKey,
                        @Value("${konnix.vapid.private-key:}") String privateKey,
                        @Value("${konnix.vapid.subject:mailto:konnix@localhost}") String subject) {
        this(publicKey, privateKey, subject, null);
    }

    @Autowired
    public PushSettings(@Value("${konnix.vapid.public-key:}") String publicKey,
                        @Value("${konnix.vapid.private-key:}") String privateKey,
                        @Value("${konnix.vapid.subject:mailto:konnix@localhost}") String subject,
                        @Autowired(required = false) AppSettingRepository appSettingRepository) {
        String resolvedPub = publicKey;
        String resolvedPriv = privateKey;

        if (isBlank(resolvedPub) || isBlank(resolvedPriv)) {
            if (appSettingRepository != null) {
                Optional<AppSetting> storedPub = appSettingRepository.findById(VAPID_PUBLIC_KEY_SETTING);
                Optional<AppSetting> storedPriv = appSettingRepository.findById(VAPID_PRIVATE_KEY_SETTING);
                if (storedPub.isPresent() && storedPriv.isPresent()
                        && !isBlank(storedPub.get().getValue()) && !isBlank(storedPriv.get().getValue())) {
                    resolvedPub = storedPub.get().getValue();
                    resolvedPriv = storedPriv.get().getValue();
                    log.info("Chaves VAPID recuperadas do banco de dados (app_settings). Chave pública: {}", resolvedPub);
                } else {
                    KeyPair pair = generateVapidKeyPair();
                    resolvedPub = b64(Utils.encode((ECPublicKey) pair.getPublic()));
                    resolvedPriv = b64(Utils.encode((ECPrivateKey) pair.getPrivate()));
                    saveSetting(appSettingRepository, VAPID_PUBLIC_KEY_SETTING, resolvedPub);
                    saveSetting(appSettingRepository, VAPID_PRIVATE_KEY_SETTING, resolvedPriv);
                    log.info("Chaves VAPID geradas e persistidas no banco de dados (app_settings). Chave pública: {}", resolvedPub);
                }
            } else {
                KeyPair pair = generateVapidKeyPair();
                resolvedPub = b64(Utils.encode((ECPublicKey) pair.getPublic()));
                resolvedPriv = b64(Utils.encode((ECPrivateKey) pair.getPrivate()));
                log.warn("Chaves VAPID não configuradas e sem repositório. Geradas em memória: notificações push não sobrevivem a reinicializações.");
            }
        }
        this.publicKey = resolvedPub;
        this.privateKey = resolvedPriv;
        this.subject = subject;
    }

    private static void saveSetting(AppSettingRepository repo, String key, String value) {
        try {
            AppSetting setting = repo.findById(key).orElseGet(AppSetting::new);
            setting.setKey(key);
            setting.setValue(value);
            setting.setUpdatedAt(Instant.now());
            repo.save(setting);
        } catch (Exception e) {
            log.warn("Não foi possível persistir configuração VAPID {} no banco de dados", key, e);
        }
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
