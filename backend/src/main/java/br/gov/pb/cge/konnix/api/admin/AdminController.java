package br.gov.pb.cge.konnix.api.admin;

import br.gov.pb.cge.konnix.api.admin.dto.*;
import br.gov.pb.cge.konnix.api.common.ApiResponse;
import br.gov.pb.cge.konnix.api.room.dto.AddMemberRequest;
import br.gov.pb.cge.konnix.api.room.dto.RoomMemberResponse;
import br.gov.pb.cge.konnix.api.room.dto.RoomResponse;
import br.gov.pb.cge.konnix.api.user.dto.UserResponse;
import br.gov.pb.cge.konnix.domain.audit.AuditService;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.domain.session.Session;
import br.gov.pb.cge.konnix.domain.session.SessionRepository;
import br.gov.pb.cge.konnix.api.exception.ApiExceptions;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.security.TokenService;
import org.springframework.security.crypto.password.PasswordEncoder;
import br.gov.pb.cge.konnix.service.RoomService;
import br.gov.pb.cge.konnix.service.SystemSettingService;
import br.gov.pb.cge.konnix.service.UserService;
import br.gov.pb.cge.konnix.service.AdminMonitoringService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {
    private final UserService userService;
    private final UserRepository userRepository;
    private final SessionRepository sessionRepository;
    private final TokenService tokenService;
    private final PasswordEncoder passwordEncoder;
    private final RoomService roomService;
    private final AuditService auditService;
    private final SystemSettingService settingService;
    private final AdminMonitoringService monitoringService;
    private final long defaultMaxUpload;
    private final String defaultAppName;

    public AdminController(UserService userService, UserRepository userRepository, SessionRepository sessionRepository,
                           TokenService tokenService, PasswordEncoder passwordEncoder, RoomService roomService,
                           AuditService auditService, SystemSettingService settingService,
                           AdminMonitoringService monitoringService,
                           @Value("${konnix.files.max-size:62914560}") long defaultMaxUpload,
                           @Value("${spring.application.name:Konnix Chat}") String defaultAppName) {
        this.userService = userService;
        this.userRepository = userRepository;
        this.sessionRepository = sessionRepository;
        this.tokenService = tokenService;
        this.passwordEncoder = passwordEncoder;
        this.roomService = roomService;
        this.auditService = auditService;
        this.settingService = settingService;
        this.monitoringService = monitoringService;
        this.defaultMaxUpload = defaultMaxUpload;
        this.defaultAppName = defaultAppName;
    }

    @GetMapping("/api-tokens")
    public ApiResponse<List<ApiTokenResponse>> apiTokens() {
        return ApiResponse.ok(sessionRepository.findByApiTokenTrueOrderByCreatedAtDesc().stream().map(ApiTokenResponse::from).toList());
    }

    @PostMapping("/api-tokens")
    public ApiResponse<java.util.Map<String, Object>> createApiToken(@Valid @RequestBody ApiTokenCreateRequest request,
                                                                      Authentication auth) {
        User target = userRepository.findByUsername(request.username().trim())
                .orElseThrow(ApiExceptions::invalidCredentials);
        if (!passwordEncoder.matches(request.password(), target.getPasswordHash())) {
            throw ApiExceptions.invalidCredentials();
        }
        LocalDate expirationDate;
        try {
            expirationDate = LocalDate.parse(request.expirationDate());
        } catch (RuntimeException error) {
            throw ApiExceptions.conflict("TOKEN_EXPIRATION_INVALID", "Data de expiração inválida");
        }
        Instant expiresAt = expirationDate.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        if (!expiresAt.isAfter(Instant.now())) {
            throw ApiExceptions.conflict("TOKEN_EXPIRATION_INVALID", "A data de expiração deve estar no futuro");
        }
        Duration ttl = Duration.between(Instant.now(), expiresAt);
        User creator = userRepository.findById(principal(auth).id()).orElseThrow(ApiExceptions::invalidCredentials);
        TokenService.IssuedToken issued = tokenService.issueApiToken(target, creator, ttl);
        return ApiResponse.ok(java.util.Map.of("token", issued.rawToken(), "metadata", ApiTokenResponse.from(issued.session())));
    }

    @DeleteMapping("/api-tokens/{id}")
    public ApiResponse<Void> revokeApiToken(@PathVariable UUID id) {
        Session session = sessionRepository.findById(id).orElseThrow(() -> ApiExceptions.notFound("api-token/" + id));
        if (!session.isApiToken()) throw ApiExceptions.notFound("api-token/" + id);
        session.setRevokedAt(Instant.now());
        sessionRepository.save(session);
        return ApiResponse.ok(null);
    }

    @GetMapping("/users")
    public ApiResponse<PageResponse<UserResponse>> users(@RequestParam(required = false) String q,
                                                           @RequestParam(defaultValue = "0") int page,
                                                           @RequestParam(defaultValue = "25") int size) {
        return ApiResponse.ok(userService.adminList(q, page, size));
    }

    @PatchMapping("/users/{id}/roles")
    public ApiResponse<UserResponse> roles(@PathVariable UUID id, @Valid @RequestBody RoleUpdateRequest request,
                                           Authentication auth, HttpServletRequest http) {
        return ApiResponse.ok(userService.changeRoles(id, request.roles(), principal(auth).id(), ip(http)));
    }

    @PostMapping("/users/{id}/activate")
    public ApiResponse<UserResponse> activate(@PathVariable UUID id, Authentication auth, HttpServletRequest http) {
        return ApiResponse.ok(userService.activate(id, principal(auth).id(), ip(http)));
    }

    @PostMapping("/users/{id}/deactivate")
    public ApiResponse<UserResponse> deactivate(@PathVariable UUID id, Authentication auth, HttpServletRequest http) {
        return ApiResponse.ok(userService.deactivate(id, principal(auth).id(), ip(http)));
    }

    @PatchMapping("/users/{id}/status")
    public ApiResponse<UserResponse> status(@PathVariable UUID id,
                                            @Valid @RequestBody AccountStatusUpdateRequest request,
                                            Authentication auth, HttpServletRequest http) {
        return ApiResponse.ok(userService.changeAccountStatus(id, request.status(), principal(auth).id(), ip(http)));
    }

    @GetMapping("/rooms")
    public ApiResponse<List<RoomResponse>> rooms() { return ApiResponse.ok(roomService.adminList()); }

    @PatchMapping("/rooms/{id}")
    public ApiResponse<RoomResponse> updateRoom(@PathVariable UUID id, @Valid @RequestBody RoomUpdateRequest request,
                                                 Authentication auth, HttpServletRequest http) {
        return ApiResponse.ok(roomService.adminUpdate(id, request, actor(auth), ip(http)));
    }

    @GetMapping("/rooms/{id}/members")
    public ApiResponse<List<RoomMemberResponse>> members(@PathVariable UUID id) { return ApiResponse.ok(roomService.adminMembers(id)); }

    @PostMapping("/rooms/{id}/members")
    public ApiResponse<RoomMemberResponse> addMember(@PathVariable UUID id, @Valid @RequestBody AddMemberRequest request,
                                                      Authentication auth, HttpServletRequest http) {
        return ApiResponse.ok(roomService.adminAddMember(id, request, actor(auth), ip(http)));
    }

    @DeleteMapping("/rooms/{id}/members/{userId}")
    public ApiResponse<Void> removeMember(@PathVariable UUID id, @PathVariable UUID userId,
                                          Authentication auth, HttpServletRequest http) {
        roomService.adminRemoveMember(id, userId, actor(auth), ip(http));
        return ApiResponse.ok(null);
    }

    @PatchMapping("/rooms/{id}/members/{userId}")
    public ApiResponse<RoomMemberResponse> updateMemberRole(@PathVariable UUID id, @PathVariable UUID userId,
                                                             @Valid @RequestBody AddMemberRequest request,
                                                             Authentication auth, HttpServletRequest http) {
        return ApiResponse.ok(roomService.adminUpdateMemberRole(id, userId, request.role(), actor(auth), ip(http)));
    }

    @GetMapping("/audit")
    public ApiResponse<PageResponse<AuditResponse>> audit(@RequestParam(required = false) UUID user,
                                                           @RequestParam(required = false) String action,
                                                           @RequestParam(required = false) String resource,
                                                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                                                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
                                                           @RequestParam(defaultValue = "0") int page,
                                                           @RequestParam(defaultValue = "25") int size) {
        int safeSize = Math.min(Math.max(size, 1), 100);
        return ApiResponse.ok(PageResponse.from(auditService.search(user, action, resource, from, to,
                org.springframework.data.domain.PageRequest.of(Math.max(page, 0), safeSize)).map(AuditResponse::from)));
    }

    @GetMapping("/audit/options")
    public ApiResponse<AuditOptionsResponse> auditOptions() {
        return ApiResponse.ok(monitoringService.auditOptions());
    }

    @GetMapping("/monitoring/metrics")
    public ApiResponse<MonitoringMetricsResponse> metrics() {
        return ApiResponse.ok(monitoringService.metrics());
    }

    @GetMapping("/settings")
    public ApiResponse<AppSettingsResponse> settings() { return ApiResponse.ok(settingService.appSettings(defaultMaxUpload, defaultAppName)); }

    @PutMapping("/settings")
    public ApiResponse<AppSettingsResponse> updateSettings(@Valid @RequestBody AppSettingsRequest request,
                                                            Authentication auth, HttpServletRequest http) {
        return ApiResponse.ok(settingService.updateAppSettings(request, actor(auth), ip(http), defaultMaxUpload, defaultAppName));
    }

    private AuthenticatedUser principal(Authentication auth) { return (AuthenticatedUser) auth.getPrincipal(); }
    private User actor(Authentication auth) { return userRepository.findById(principal(auth).id()).orElseThrow(); }
    private String ip(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
