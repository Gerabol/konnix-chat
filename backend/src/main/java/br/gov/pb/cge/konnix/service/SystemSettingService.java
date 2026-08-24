package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.domain.settings.SystemSetting;
import br.gov.pb.cge.konnix.domain.settings.SystemSettingRepository;
import br.gov.pb.cge.konnix.domain.settings.AppSetting;
import br.gov.pb.cge.konnix.domain.settings.AppSettingRepository;
import br.gov.pb.cge.konnix.domain.audit.AuditService;
import br.gov.pb.cge.konnix.domain.user.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class SystemSettingService {
    public static final String READ_RECEIPTS_KEY = "read_receipts.enabled";
    public static final String APP_NAME_KEY = "app.name";
    public static final String MAX_UPLOAD_KEY = "app.max_upload_bytes";

    private final SystemSettingRepository repository;
    private final AppSettingRepository appRepository;
    private final AuditService auditService;

    public SystemSettingService(SystemSettingRepository repository, AppSettingRepository appRepository, AuditService auditService) {
        this.repository = repository;
        this.appRepository = appRepository;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public boolean readReceiptsEnabled() {
        return repository.findById(READ_RECEIPTS_KEY).map(SystemSetting::isBooleanValue).orElse(true);
    }

    @Transactional
    public boolean setReadReceiptsEnabled(boolean enabled) {
        SystemSetting setting = repository.findById(READ_RECEIPTS_KEY).orElseGet(() -> {
            SystemSetting created = new SystemSetting();
            created.setKey(READ_RECEIPTS_KEY);
            return created;
        });
        setting.setBooleanValue(enabled);
        setting.setUpdatedAt(Instant.now());
        repository.save(setting);
        return enabled;
    }

    @Transactional(readOnly = true)
    public br.gov.pb.cge.konnix.api.admin.dto.AppSettingsResponse appSettings(long defaultMax, String defaultName) {
        String name = appRepository.findById(APP_NAME_KEY).map(AppSetting::getValue).orElse(defaultName);
        long max = appRepository.findById(MAX_UPLOAD_KEY).map(AppSetting::getValue).map(Long::parseLong).orElse(defaultMax);
        return new br.gov.pb.cge.konnix.api.admin.dto.AppSettingsResponse(name, max);
    }

    @Transactional
    public br.gov.pb.cge.konnix.api.admin.dto.AppSettingsResponse updateAppSettings(
            br.gov.pb.cge.konnix.api.admin.dto.AppSettingsRequest request, User actor, String ipAddress,
            long defaultMax, String defaultName) {
        saveApp(APP_NAME_KEY, request.name().trim());
        saveApp(MAX_UPLOAD_KEY, Long.toString(request.maxUploadBytes()));
        auditService.record("APP_SETTING_CHANGED", actor, "app_setting", "app", ipAddress);
        return appSettings(defaultMax, defaultName);
    }

    @Transactional(readOnly = true)
    public long maxUploadBytes(long defaultMax) {
        return appRepository.findById(MAX_UPLOAD_KEY).map(AppSetting::getValue).map(Long::parseLong).orElse(defaultMax);
    }

    private void saveApp(String key, String value) {
        AppSetting setting = appRepository.findById(key).orElseGet(() -> { AppSetting s = new AppSetting(); s.setKey(key); return s; });
        setting.setValue(value);
        setting.setUpdatedAt(Instant.now());
        appRepository.save(setting);
    }
}
