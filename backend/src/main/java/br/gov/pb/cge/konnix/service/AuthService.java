package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.dto.LoginRequest;
import br.gov.pb.cge.konnix.api.dto.LoginResponse;
import br.gov.pb.cge.konnix.api.exception.ApiExceptions;
import br.gov.pb.cge.konnix.api.user.dto.UserResponse;
import br.gov.pb.cge.konnix.api.auth.ProfileUpdateRequest;
import br.gov.pb.cge.konnix.api.auth.ThemeUpdateRequest;
import br.gov.pb.cge.konnix.api.auth.RequiredPasswordChangeRequest;
import br.gov.pb.cge.konnix.domain.audit.AuditService;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.security.LoginAttemptService;
import br.gov.pb.cge.konnix.security.TokenService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;
    private final AuditService auditService;
    private final LoginAttemptService loginAttemptService;
    private final UserService userService;

    public AuthService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       TokenService tokenService,
                       AuditService auditService,
                       LoginAttemptService loginAttemptService,
                       UserService userService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenService = tokenService;
        this.auditService = auditService;
        this.loginAttemptService = loginAttemptService;
        this.userService = userService;
    }

    @Transactional
    public LoginResponse login(LoginRequest request, String ipAddress) {
        String username = request.username().trim();
        if (loginAttemptService.isBlocked(username)) {
            throw ApiExceptions.tooManyAttempts();
        }

        User user = userRepository.findByUsername(username).orElse(null);

        if (user == null) {
            loginAttemptService.registerFailure(username);
            auditService.record("LOGIN_FAILURE", null, "auth", username, ipAddress);
            throw ApiExceptions.invalidCredentials();
        }
        if (user.isDisabled()) {
            auditService.record("LOGIN_FAILURE", user, "auth", user.getUsername(), ipAddress);
            throw ApiExceptions.userInactive();
        }
        if (user.isPasswordMigrationRequired()) {
            auditService.record("LOGIN_FAILURE", user, "auth", user.getUsername(), ipAddress);
            throw ApiExceptions.passwordMigrationRequired();
        }
        if (user.getPasswordHash() == null || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            loginAttemptService.registerFailure(username);
            auditService.record("LOGIN_FAILURE", user, "auth", user.getUsername(), ipAddress);
            throw ApiExceptions.invalidCredentials();
        }

        loginAttemptService.clear(username);
        user.setPresenceStatus("online");
        userRepository.save(user);
        TokenService.IssuedToken issued = tokenService.issue(user);
        auditService.record("LOGIN_SUCCESS", user, "auth", user.getUsername(), ipAddress);
        return new LoginResponse(issued.rawToken(), UserResponse.from(user));
    }

    @Transactional
    public void logout(String rawToken, String username, String ipAddress) {
        User user = username != null
                ? userRepository.findByUsername(username).orElse(null)
                : null;
        tokenService.revoke(rawToken);
        if (user != null) {
            auditService.record("LOGOUT", user, "auth", user.getUsername(), ipAddress);
        }
    }

    @Transactional(readOnly = true)
    public UserResponse me(AuthenticatedUser principal) {
        User user = userRepository.findById(principal.id())
                .orElseThrow(() -> ApiExceptions.unauthorized("Sessão inválida"));
        return UserResponse.from(user);
    }

    public UserResponse updateOwnProfile(AuthenticatedUser principal, ProfileUpdateRequest request, String ipAddress) {
        return userService.updateOwnProfile(principal.id(), request, ipAddress);
    }

    public UserResponse updateOwnTheme(AuthenticatedUser principal, ThemeUpdateRequest request) {
        return userService.updateOwnTheme(principal.id(), request.theme());
    }

    @Transactional
    public UserResponse changeRequiredPassword(AuthenticatedUser principal, RequiredPasswordChangeRequest request) {
        if (!request.newPassword().equals(request.confirmPassword())) {
            throw ApiExceptions.passwordsDoNotMatch();
        }
        User user = userRepository.findById(principal.id())
                .orElseThrow(() -> ApiExceptions.unauthorized("Sessão inválida"));
        if (!user.isPasswordChangeRequired()) {
            throw ApiExceptions.conflict("PASSWORD_CHANGE_NOT_REQUIRED", "Não há troca de senha pendente");
        }
        if (user.getPasswordHash() == null || passwordEncoder.matches(request.newPassword(), user.getPasswordHash())) {
            throw ApiExceptions.passwordMustDiffer();
        }
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        user.setPasswordChangeRequired(false);
        userRepository.save(user);
        auditService.record("PASSWORD_CHANGED", user, "auth", user.getUsername(), null);
        return UserResponse.from(user);
    }
}
