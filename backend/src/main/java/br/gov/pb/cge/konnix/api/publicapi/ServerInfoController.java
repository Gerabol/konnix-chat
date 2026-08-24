package br.gov.pb.cge.konnix.api.publicapi;

import br.gov.pb.cge.konnix.api.common.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class ServerInfoController {

    @GetMapping("/api/public/server-info")
    public ApiResponse<Map<String, String>> serverInfo() {
        return ApiResponse.ok(Map.of("product", "Konnix Chat", "version", "1.0.0", "serverName", "Konnix Chat"));
    }
}
