package br.gov.pb.cge.konnix.api.push;

import br.gov.pb.cge.konnix.api.common.ApiResponse;
import br.gov.pb.cge.konnix.api.push.dto.PushSubscribeRequest;
import br.gov.pb.cge.konnix.api.push.dto.PushSubscriptionResponse;
import br.gov.pb.cge.konnix.api.push.dto.PushUnsubscribeRequest;
import br.gov.pb.cge.konnix.push.PushSettings;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.service.PushSubscriptionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class PushController {

    private final PushSubscriptionService subscriptionService;
    private final PushSettings pushSettings;

    public PushController(PushSubscriptionService subscriptionService, PushSettings pushSettings) {
        this.subscriptionService = subscriptionService;
        this.pushSettings = pushSettings;
    }

    @GetMapping("/api/v1/push/public-key")
    public ApiResponse<Map<String, String>> publicKey() {
        return ApiResponse.ok(Map.of("publicKey", pushSettings.publicKey()));
    }

    @PostMapping("/api/v1/push/subscribe")
    public ApiResponse<PushSubscriptionResponse> subscribe(@Valid @RequestBody PushSubscribeRequest request,
                                                           Authentication authentication,
                                                           HttpServletRequest http) {
        AuthenticatedUser actor = (AuthenticatedUser) authentication.getPrincipal();
        return ApiResponse.ok(subscriptionService.subscribe(request, actor, clientIp(http)));
    }

    @DeleteMapping("/api/v1/push/unsubscribe")
    public ApiResponse<Void> unsubscribe(@Valid @RequestBody PushUnsubscribeRequest request,
                                         Authentication authentication,
                                         HttpServletRequest http) {
        AuthenticatedUser actor = (AuthenticatedUser) authentication.getPrincipal();
        subscriptionService.unsubscribe(request, actor, clientIp(http));
        return ApiResponse.ok(null);
    }

    private String clientIp(HttpServletRequest http) {
        String forwarded = http.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return http.getRemoteAddr();
    }
}
