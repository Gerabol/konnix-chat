package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.exception.ApiExceptions;
import br.gov.pb.cge.konnix.api.user.dto.CreateUserRequest;
import br.gov.pb.cge.konnix.api.user.dto.UpdateUserRequest;
import br.gov.pb.cge.konnix.api.user.dto.UserDirectoryResponse;
import br.gov.pb.cge.konnix.api.user.dto.UserResponse;
import br.gov.pb.cge.konnix.api.user.dto.PublicProfileResponse;
import br.gov.pb.cge.konnix.api.auth.ProfileUpdateRequest;
import br.gov.pb.cge.konnix.api.admin.dto.PageResponse;
import br.gov.pb.cge.konnix.domain.audit.AuditService;
import br.gov.pb.cge.konnix.domain.user.Role;
import br.gov.pb.cge.konnix.domain.user.RoleRepository;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserTheme;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.domain.session.SessionRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;

import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.HashSet;
import java.util.stream.Collectors;
import java.util.UUID;

@Service
public class UserService {

    private static final String ROLE_USER = "USER";
    private static final Set<String> ACCOUNT_STATUSES = Set.of("ACTIVE", "READ_ONLY", "DISABLED");

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditService auditService;
    private final SessionRepository sessionRepository;

    public UserService(UserRepository userRepository,
                       RoleRepository roleRepository,
                       PasswordEncoder passwordEncoder,
                       AuditService auditService,
                       SessionRepository sessionRepository) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
        this.auditService = auditService;
        this.sessionRepository = sessionRepository;
    }

    @Transactional(readOnly = true)
    public List<UserResponse> list() {
        return userRepository.findAll().stream()
                .map(UserResponse::from)
                .sorted(Comparator.comparing(UserResponse::username))
                .toList();
    }

    @Transactional(readOnly = true)
    public PageResponse<UserResponse> adminList(String query, int page, int size) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(1, size), 100);
        return PageResponse.from(userRepository.search(query == null || query.isBlank() ? null : query.trim(),
                PageRequest.of(safePage, safeSize)).map(UserResponse::from));
    }

    @Transactional
    public UserResponse changeRoles(UUID id, Set<String> requestedRoles, UUID actorId, String ipAddress) {
        User user = findOrThrow(id);
        Set<String> names = requestedRoles.stream().map(String::trim).map(String::toUpperCase).collect(Collectors.toSet());
        if (names.stream().anyMatch(name -> !Set.of("ADMIN", "USER", "BOT").contains(name))) {
            throw ApiExceptions.conflict("ROLE_INVALID", "Somente ADMIN, USER e BOT são permitidas");
        }
        boolean removingAdmin = user.getRoles().stream().anyMatch(r -> "ADMIN".equals(r.getName())) && !names.contains("ADMIN");
        if (removingAdmin && user.isActive() && userRepository.countByActiveTrueAndRoles_Name("ADMIN") <= 1) {
            throw ApiExceptions.conflict("LAST_ADMIN", "Não é possível remover o último ADMIN ativo");
        }
        Set<Role> roles = new HashSet<>();
        for (String name : names) {
            roles.add(roleRepository.findByName(name).orElseThrow(() -> ApiExceptions.conflict("ROLE_MISSING", "Role não configurada: " + name)));
        }
        user.setRoles(roles);
        userRepository.save(user);
        auditService.record("USER_ROLE_CHANGED", actor(actorId), "user", user.getId().toString(), ipAddress);
        return UserResponse.from(user);
    }

    @Transactional(readOnly = true)
    public List<UserDirectoryResponse> directory(String query) {
        String q = query == null ? null : query.trim().toLowerCase();
        return userRepository.findAll().stream()
                .filter(user -> !user.isDisabled())
                .filter(u -> q == null || q.isBlank()
                        || (u.getName() != null && u.getName().toLowerCase().contains(q))
                        || (u.getUsername() != null && u.getUsername().toLowerCase().contains(q))
                        || (u.getEmail() != null && u.getEmail().toLowerCase().contains(q)))
                .map(UserDirectoryResponse::from)
                .sorted(Comparator.comparing(UserDirectoryResponse::name, String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(UserDirectoryResponse::username))
                .toList();
    }

    @Transactional(readOnly = true)
    public UserResponse get(UUID id) {
        return UserResponse.from(findOrThrow(id));
    }

    @Transactional(readOnly = true)
    public PublicProfileResponse publicProfile(UUID id) {
        return PublicProfileResponse.from(findOrThrow(id));
    }

    @Transactional
    public UserResponse updateOwnProfile(UUID id, ProfileUpdateRequest request, String ipAddress) {
        User user = findOrThrow(id);
        if (request.name() != null && !request.name().isBlank()) user.setName(request.name().trim());
        if (request.email() != null) {
            String email = normalize(request.email());
            if (email != null && userRepository.findByEmail(email).filter(existing -> !existing.getId().equals(id)).isPresent()) {
                throw ApiExceptions.conflict("EMAIL_TAKEN", "E-mail já cadastrado");
            }
            user.setEmail(email);
        }
        userRepository.save(user);
        auditService.record("USER_UPDATED", user, "user", user.getId().toString(), ipAddress);
        return UserResponse.from(user);
    }

    @Transactional
    public UserResponse updateOwnTheme(UUID id, String requestedTheme) {
        String theme = UserTheme.normalize(requestedTheme);
        if (!UserTheme.isValid(theme)) {
            theme = UserTheme.DEFAULT.name();
        }
        User user = findOrThrow(id);
        user.setTheme(theme);
        userRepository.save(user);
        return UserResponse.from(user);
    }

    @Transactional
    public UserResponse create(CreateUserRequest request, UUID actorId, String ipAddress) {
        String username = request.username().trim();
        String email = normalize(request.email());

        if (userRepository.existsByUsername(username)) {
            throw ApiExceptions.conflict("USERNAME_TAKEN", "Nome de usuário já existe");
        }
        if (email != null && userRepository.existsByEmail(email)) {
            throw ApiExceptions.conflict("EMAIL_TAKEN", "E-mail já cadastrado");
        }

        Role userRole = roleRepository.findByName(ROLE_USER)
                .orElseThrow(() -> ApiExceptions.conflict("ROLE_MISSING", "Role " + ROLE_USER + " não configurada"));

        User user = new User();
        user.setUsername(username);
        user.setName(request.name().trim());
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setPasswordChangeRequired(true);
        user.setActive(true);
        user.setAccountStatus("ACTIVE");
        user.setUserType("USER");
        user.setPasswordMigrationRequired(false);
        user.getRoles().add(userRole);
        userRepository.save(user);

        auditService.record("USER_CREATED", actor(actorId), "user", user.getId().toString(), ipAddress);
        return UserResponse.from(user);
    }

    @Transactional
    public UserResponse update(UUID id, UpdateUserRequest request, UUID actorId, String ipAddress) {
        User user = findOrThrow(id);

        if (request.name() != null && !request.name().isBlank()) {
            user.setName(request.name().trim());
        }
        if (request.email() != null) {
            String email = normalize(request.email());
            if (email == null) {
                user.setEmail(null);
            } else if (!email.equalsIgnoreCase(user.getEmail() == null ? null : user.getEmail())) {
                if (userRepository.findByEmail(email).filter(existing -> !existing.getId().equals(id)).isPresent()) {
                    throw ApiExceptions.conflict("EMAIL_TAKEN", "E-mail já cadastrado");
                }
                user.setEmail(email);
            }
        }
        boolean passwordChanged = request.password() != null && !request.password().isBlank();
        if (passwordChanged) {
            user.setPasswordHash(passwordEncoder.encode(request.password()));
            user.setPasswordMigrationRequired(false);
            if (!id.equals(actorId)) {
                user.setPasswordChangeRequired(true);
                sessionRepository.revokeActiveByUserId(id, java.time.Instant.now());
            }
        }
        userRepository.save(user);

        auditService.record("USER_UPDATED", actor(actorId), "user", user.getId().toString(), ipAddress);
        return UserResponse.from(user);
    }

    @Transactional
    public UserResponse avatarUpdated(UUID id, UUID actorId, String ipAddress) {
        User user = findOrThrow(id);
        userRepository.save(user);
        auditService.record("USER_UPDATED", actor(actorId), "user", user.getId().toString(), ipAddress);
        return UserResponse.from(user);
    }

    @Transactional
    public UserResponse changeAccountStatus(UUID id, String requestedStatus, UUID actorId, String ipAddress) {
        User user = findOrThrow(id);
        String status = requestedStatus == null ? "" : requestedStatus.trim().toUpperCase();
        if (!ACCOUNT_STATUSES.contains(status)) {
            throw ApiExceptions.conflict("ACCOUNT_STATUS_INVALID", "Estado de conta inválido");
        }
        boolean administrator = user.getRoles().stream().anyMatch(role -> "ADMIN".equals(role.getName()));
        if (administrator && !"ACTIVE".equals(status)) {
            throw ApiExceptions.conflict("ADMIN_STATUS_LOCKED", "Administradores devem permanecer ativos");
        }
        boolean removingAdminAccess = user.getRoles().stream().anyMatch(r -> "ADMIN".equals(r.getName()))
                && "DISABLED".equals(status)
                && !user.isDisabled();
        if (removingAdminAccess && userRepository.countByActiveTrueAndRoles_Name("ADMIN") <= 1) {
            throw ApiExceptions.conflict("LAST_ADMIN", "Não é possível desativar o último ADMIN ativo");
        }
        user.setAccountStatus(status);
        userRepository.save(user);
        auditService.record("USER_STATUS_CHANGED", actor(actorId), "user", user.getId().toString(), ipAddress);
        return UserResponse.from(user);
    }

    @Transactional
    public UserResponse activate(UUID id, UUID actorId, String ipAddress) {
        return changeAccountStatus(id, "ACTIVE", actorId, ipAddress);
    }

    @Transactional
    public UserResponse deactivate(UUID id, UUID actorId, String ipAddress) {
        return changeAccountStatus(id, "DISABLED", actorId, ipAddress);
    }

    private User findOrThrow(UUID id) {
        return userRepository.findById(id)
                .orElseThrow(() -> ApiExceptions.notFound("user/" + id));
    }

    private User actor(UUID actorId) {
        return actorId != null ? userRepository.findById(actorId).orElse(null) : null;
    }

    private String normalize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim().toLowerCase();
    }
}
