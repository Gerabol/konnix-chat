package br.gov.pb.cge.konnix.api.publicapi;

import br.gov.pb.cge.konnix.api.admin.dto.AppSettingsResponse;
import br.gov.pb.cge.konnix.api.common.ApiResponse;
import br.gov.pb.cge.konnix.service.SystemSettingService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class ServerInfoController {

    private final SystemSettingService settingService;
    private final long defaultMaxUpload;
    private final String defaultAppName;

    public ServerInfoController(SystemSettingService settingService,
                                @Value("${konnix.files.max-size:62914560}") long defaultMaxUpload,
                                @Value("${spring.application.name:Konnix Chat}") String defaultAppName) {
        this.settingService = settingService;
        this.defaultMaxUpload = defaultMaxUpload;
        this.defaultAppName = defaultAppName;
    }

    @GetMapping("/api/public/server-info")
    public ApiResponse<Map<String, Object>> serverInfo() {
        AppSettingsResponse settings = settingService.appSettings(defaultMaxUpload, defaultAppName);
        String serverName = settings.name() == null || settings.name().isBlank() ? "Konnix Chat" : settings.name();
        return ApiResponse.ok(Map.of(
                "product", "Konnix Chat",
                "version", "1.0.0",
                "serverName", serverName,
                "maxUploadBytes", settings.maxUploadBytes()
        ));
    }
}
