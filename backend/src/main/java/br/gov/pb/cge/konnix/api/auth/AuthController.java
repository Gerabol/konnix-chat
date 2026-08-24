package br.gov.pb.cge.konnix.api.auth;

import br.gov.pb.cge.konnix.api.common.ApiResponse;
import br.gov.pb.cge.konnix.api.dto.LoginRequest;
import br.gov.pb.cge.konnix.api.dto.LoginResponse;
import br.gov.pb.cge.konnix.api.user.dto.UserResponse;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private static final String BEARER_PREFIX = "Bearer ";

    private final AuthService authService;
    private final br.gov.pb.cge.konnix.service.PresenceService presenceService;

    public AuthController(AuthService authService,
                          br.gov.pb.cge.konnix.service.PresenceService presenceService) {
        this.authService = authService;
        this.presenceService = presenceService;
    }

    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        LoginResponse response = authService.login(request, clientIp(http));
        return ApiResponse.ok(response);
    }

    @PostMapping("/logout")
    public ApiResponse<Void> logout(Authentication authentication, HttpServletRequest http) {
        String token = bearerToken(http);
        String username = authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser principal
                ? principal.username()
                : null;
        authService.logout(token, username, clientIp(http));
        return ApiResponse.ok(null);
    }

    @PostMapping("/change-required-password")
    public ApiResponse<UserResponse> changeRequiredPassword(
            @Valid @RequestBody RequiredPasswordChangeRequest request,
            Authentication authentication) {
        return ApiResponse.ok(authService.changeRequiredPassword(
                (AuthenticatedUser) authentication.getPrincipal(), request));
    }

    @GetMapping("/me")
    public ApiResponse<UserResponse> me(Authentication authentication) {
        AuthenticatedUser principal = (AuthenticatedUser) authentication.getPrincipal();
        return ApiResponse.ok(authService.me(principal));
    }

    @PatchMapping("/profile")
    public ApiResponse<UserResponse> updateProfile(@Valid @RequestBody ProfileUpdateRequest request,
                                                    Authentication authentication, HttpServletRequest http) {
        AuthenticatedUser principal = (AuthenticatedUser) authentication.getPrincipal();
        return ApiResponse.ok(authService.updateOwnProfile(principal, request, clientIp(http)));
    }

    @PatchMapping("/preferences")
    public ApiResponse<UserResponse> updatePreferences(@Valid @RequestBody ThemeUpdateRequest request,
                                                        Authentication authentication) {
        return ApiResponse.ok(authService.updateOwnTheme(
                (AuthenticatedUser) authentication.getPrincipal(), request));
    }

    @PostMapping("/presence")
    public ApiResponse<UserResponse> presence(@Valid @RequestBody PresenceRequest request,
                                              Authentication authentication) {
        return ApiResponse.ok(presenceService.update(
                (AuthenticatedUser) authentication.getPrincipal(), request.status()));
    }

    private String bearerToken(HttpServletRequest http) {
        String header = http.getHeader("Authorization");
        if (header != null && header.startsWith(BEARER_PREFIX)) {
            return header.substring(BEARER_PREFIX.length());
        }
        return null;
    }

    private String clientIp(HttpServletRequest http) {
        String forwarded = http.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return http.getRemoteAddr();
    }
}
