package br.gov.pb.cge.konnix.push;

import br.gov.pb.cge.konnix.domain.settings.AppSetting;
import br.gov.pb.cge.konnix.domain.settings.AppSettingRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PushSettingsTest {

    @Test
    void usaChavesFornecidasViaPropriedades() {
        AppSettingRepository repository = mock(AppSettingRepository.class);
        PushSettings settings = new PushSettings("custom-public-key", "custom-private-key", "mailto:admin@empresa.com.br", repository);

        assertThat(settings.publicKey()).isEqualTo("custom-public-key");
        assertThat(settings.privateKey()).isEqualTo("custom-private-key");
        assertThat(settings.subject()).isEqualTo("mailto:admin@empresa.com.br");
        verify(repository, never()).findById(any());
        verify(repository, never()).save(any());
    }

    @Test
    void sanitizaSubjectInvalidoParaCompatibilidadeComAppleApns() {
        AppSettingRepository repository = mock(AppSettingRepository.class);
        
        PushSettings localSetting = new PushSettings("pub", "priv", "mailto:homolog@konnix.local", repository);
        assertThat(localSetting.subject()).isEqualTo(PushSettings.DEFAULT_SUBJECT);

        PushSettings localhostSetting = new PushSettings("pub", "priv", "mailto:konnix@localhost", repository);
        assertThat(localhostSetting.subject()).isEqualTo(PushSettings.DEFAULT_SUBJECT);

        PushSettings blankSetting = new PushSettings("pub", "priv", "   ", repository);
        assertThat(blankSetting.subject()).isEqualTo(PushSettings.DEFAULT_SUBJECT);

        PushSettings validSetting = new PushSettings("pub", "priv", "mailto:notificacoes@orgao.gov.br", repository);
        assertThat(validSetting.subject()).isEqualTo("mailto:notificacoes@orgao.gov.br");
    }

    @Test
    void recuperaChavesExistentesDoBancoDeDados() {
        AppSettingRepository repository = mock(AppSettingRepository.class);

        AppSetting pubSetting = new AppSetting();
        pubSetting.setKey(PushSettings.VAPID_PUBLIC_KEY_SETTING);
        pubSetting.setValue("db-stored-public-key");

        AppSetting privSetting = new AppSetting();
        privSetting.setKey(PushSettings.VAPID_PRIVATE_KEY_SETTING);
        privSetting.setValue("db-stored-private-key");

        when(repository.findById(PushSettings.VAPID_PUBLIC_KEY_SETTING)).thenReturn(Optional.of(pubSetting));
        when(repository.findById(PushSettings.VAPID_PRIVATE_KEY_SETTING)).thenReturn(Optional.of(privSetting));

        PushSettings settings = new PushSettings("", "", "mailto:admin@empresa.com.br", repository);

        assertThat(settings.publicKey()).isEqualTo("db-stored-public-key");
        assertThat(settings.privateKey()).isEqualTo("db-stored-private-key");
        verify(repository, never()).save(any());
    }

    @Test
    void geraESalvaChavesNoBancoQuandoNaoExistem() {
        AppSettingRepository repository = mock(AppSettingRepository.class);
        when(repository.findById(PushSettings.VAPID_PUBLIC_KEY_SETTING)).thenReturn(Optional.empty());
        when(repository.findById(PushSettings.VAPID_PRIVATE_KEY_SETTING)).thenReturn(Optional.empty());

        PushSettings settings = new PushSettings(null, null, "mailto:admin@empresa.com.br", repository);

        assertThat(settings.publicKey()).isNotBlank();
        assertThat(settings.privateKey()).isNotBlank();

        ArgumentCaptor<AppSetting> captor = ArgumentCaptor.forClass(AppSetting.class);
        verify(repository, times(2)).save(captor.capture());

        var saved = captor.getAllValues();
        assertThat(saved).extracting(AppSetting::getKey)
                .containsExactlyInAnyOrder(PushSettings.VAPID_PUBLIC_KEY_SETTING, PushSettings.VAPID_PRIVATE_KEY_SETTING);
    }
}
