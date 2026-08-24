package br.gov.pb.cge.konnix.api.user;

import br.gov.pb.cge.konnix.api.common.ApiResponse;
import br.gov.pb.cge.konnix.api.user.dto.CreateUserRequest;
import br.gov.pb.cge.konnix.api.user.dto.UpdateUserRequest;
import br.gov.pb.cge.konnix.api.user.dto.UserResponse;
import br.gov.pb.cge.konnix.api.admin.dto.RoleUpdateRequest;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/users")
@PreAuthorize("hasRole('ADMIN')")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public ApiResponse<List<UserResponse>> list() {
        return ApiResponse.ok(userService.list());
    }

    @GetMapping("/{id}")
    public ApiResponse<UserResponse> get(@PathVariable UUID id) {
        return ApiResponse.ok(userService.get(id));
    }

    @PostMapping
    public ApiResponse<UserResponse> create(@Valid @RequestBody CreateUserRequest request,
                                            Authentication authentication,
                                            HttpServletRequest http) {
        return ApiResponse.ok(userService.create(request, actorId(authentication), clientIp(http)));
    }

    @PatchMapping("/{id}")
    public ApiResponse<UserResponse> update(@PathVariable UUID id,
                                            @Valid @RequestBody UpdateUserRequest request,
                                            Authentication authentication,
                                            HttpServletRequest http) {
        return ApiResponse.ok(userService.update(id, request, actorId(authentication), clientIp(http)));
    }

    @PostMapping("/{id}/deactivate")
    public ApiResponse<UserResponse> deactivate(@PathVariable UUID id,
                                                Authentication authentication,
                                                HttpServletRequest http) {
        return ApiResponse.ok(userService.deactivate(id, actorId(authentication), clientIp(http)));
    }

    @PostMapping("/{id}/activate")
    public ApiResponse<UserResponse> activate(@PathVariable UUID id,
                                              Authentication authentication,
                                              HttpServletRequest http) {
        return ApiResponse.ok(userService.activate(id, actorId(authentication), clientIp(http)));
    }

    @PatchMapping("/{id}/roles")
    public ApiResponse<UserResponse> roles(@PathVariable UUID id,
                                           @Valid @RequestBody RoleUpdateRequest request,
                                           Authentication authentication,
                                           HttpServletRequest http) {
        AuthenticatedUser actor = (AuthenticatedUser) authentication.getPrincipal();
        return ApiResponse.ok(userService.changeRoles(id, request.roles(), actor.id(), clientIp(http)));
    }

    private UUID actorId(Authentication authentication) {
        if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser principal) {
            return principal.id();
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
