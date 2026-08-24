package br.gov.pb.cge.konnix.api.settings;

import br.gov.pb.cge.konnix.api.common.ApiResponse;
import br.gov.pb.cge.konnix.service.SystemSettingService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/settings")
public class SystemSettingsController {
    private final SystemSettingService settingService;

    public SystemSettingsController(SystemSettingService settingService) {
        this.settingService = settingService;
    }

    @GetMapping("/read-receipts")
    public ApiResponse<Map<String, Boolean>> readReceipts() {
        return ApiResponse.ok(Map.of("enabled", settingService.readReceiptsEnabled()));
    }

    @PutMapping("/read-receipts")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<Map<String, Boolean>> updateReadReceipts(
            @Valid @RequestBody ReadReceiptSettingRequest request) {
        return ApiResponse.ok(Map.of("enabled", settingService.setReadReceiptsEnabled(request.enabled())));
    }
}
