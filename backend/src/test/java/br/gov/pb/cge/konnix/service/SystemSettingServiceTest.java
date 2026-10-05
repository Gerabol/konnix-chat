package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.domain.audit.AuditService;
import br.gov.pb.cge.konnix.domain.settings.AppSettingRepository;
import br.gov.pb.cge.konnix.domain.settings.SystemSetting;
import br.gov.pb.cge.konnix.domain.settings.SystemSettingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SystemSettingServiceTest {

    @Mock
    private SystemSettingRepository repository;
    @Mock
    private AppSettingRepository appRepository;
    @Mock
    private AuditService auditService;

    private SystemSettingService service;

    @BeforeEach
    void setUp() {
        service = new SystemSettingService(repository, appRepository, auditService);
    }

    @Test
    void audioTranscriptionEnabled_defaultToTrueWhenNotFound() {
        when(repository.findById(SystemSettingService.AUDIO_TRANSCRIPTION_KEY)).thenReturn(Optional.empty());

        boolean result = service.audioTranscriptionEnabled();

        assertThat(result).isTrue();
    }

    @Test
    void audioTranscriptionEnabled_returnsConfiguredValue() {
        SystemSetting setting = new SystemSetting();
        setting.setKey(SystemSettingService.AUDIO_TRANSCRIPTION_KEY);
        setting.setBooleanValue(true);

        when(repository.findById(SystemSettingService.AUDIO_TRANSCRIPTION_KEY)).thenReturn(Optional.of(setting));

        boolean result = service.audioTranscriptionEnabled();

        assertThat(result).isTrue();
    }

    @Test
    void setAudioTranscriptionEnabled_savesAndReturnsValue() {
        when(repository.findById(SystemSettingService.AUDIO_TRANSCRIPTION_KEY)).thenReturn(Optional.empty());

        boolean result = service.setAudioTranscriptionEnabled(true);

        assertThat(result).isTrue();

        ArgumentCaptor<SystemSetting> captor = ArgumentCaptor.forClass(SystemSetting.class);
        verify(repository).save(captor.capture());

        SystemSetting saved = captor.getValue();
        assertThat(saved.getKey()).isEqualTo(SystemSettingService.AUDIO_TRANSCRIPTION_KEY);
        assertThat(saved.isBooleanValue()).isTrue();
    }
}
