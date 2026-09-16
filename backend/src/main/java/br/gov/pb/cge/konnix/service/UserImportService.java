package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.exception.ApiExceptions;
import br.gov.pb.cge.konnix.api.user.dto.ImportUserItem;
import br.gov.pb.cge.konnix.api.user.dto.ImportUsersRequest;
import br.gov.pb.cge.konnix.api.user.dto.ImportUsersResponse;
import br.gov.pb.cge.konnix.api.user.dto.ImportUsersResponse.ImportUserResult;
import br.gov.pb.cge.konnix.domain.audit.AuditService;
import br.gov.pb.cge.konnix.domain.user.Role;
import br.gov.pb.cge.konnix.domain.user.RoleRepository;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class UserImportService {

    private static final String ROLE_USER = "USER";
    private static final String DEFAULT_PASSWORD = "cge@2026";

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditService auditService;

    public UserImportService(UserRepository userRepository,
                             RoleRepository roleRepository,
                             PasswordEncoder passwordEncoder,
                             AuditService auditService) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
        this.auditService = auditService;
    }

    @Transactional
    public ImportUsersResponse importUsers(ImportUsersRequest request, UUID actorId, String ipAddress) {
        String password = (request.defaultPassword() != null && !request.defaultPassword().isBlank())
                ? request.defaultPassword()
                : DEFAULT_PASSWORD;

        Role userRole = roleRepository.findByName(ROLE_USER)
                .orElseThrow(() -> ApiExceptions.conflict("ROLE_MISSING", "Role " + ROLE_USER + " não configurada"));

        String encodedPassword = passwordEncoder.encode(password);
        List<ImportUserResult> results = new ArrayList<>();
        int created = 0;
        int updated = 0;
        int skipped = 0;

        for (ImportUserItem item : request.users()) {
            String username = item.username().trim();
            String name = item.name().trim();
            String email = normalize(item.email());
            boolean active = item.active() == null || item.active();
            String accountStatus = active ? "ACTIVE" : "DISABLED";

            Optional<User> existingUser = userRepository.findByUsername(username);

            if (existingUser.isPresent()) {
                User user = existingUser.get();
                if (email != null) {
                    Optional<User> emailHolder = userRepository.findByEmail(email);
                    if (emailHolder.isPresent() && !emailHolder.get().getId().equals(user.getId())) {
                        skipped++;
                        results.add(new ImportUserResult(username, "SKIPPED", "E-mail já associado a outro usuário"));
                        continue;
                    }
                }
                user.setName(name);
                user.setEmail(email);
                user.setActive(active);
                user.setAccountStatus(accountStatus);
                if (user.getRoles().isEmpty()) {
                    user.getRoles().add(userRole);
                }
                userRepository.save(user);
                updated++;
                results.add(new ImportUserResult(username, "UPDATED", "Usuário atualizado com sucesso"));
            } else {
                if (email != null && userRepository.existsByEmail(email)) {
                    skipped++;
                    results.add(new ImportUserResult(username, "SKIPPED", "E-mail já cadastrado"));
                    continue;
                }

                User user = new User();
                user.setUsername(username);
                user.setName(name);
                user.setEmail(email);
                user.setPasswordHash(encodedPassword);
                user.setActive(active);
                user.setAccountStatus(accountStatus);
                user.setUserType("USER");
                user.setPasswordChangeRequired(true);
                user.setPasswordMigrationRequired(false);
                user.getRoles().add(userRole);

                userRepository.save(user);
                created++;
                results.add(new ImportUserResult(username, "CREATED", "Usuário cadastrado com sucesso"));
            }
        }

        User actor = actorId != null ? userRepository.findById(actorId).orElse(null) : null;
        auditService.record("USERS_BULK_IMPORTED", actor, "users", "Criados: " + created + ", Atualizados: " + updated, ipAddress);

        return new ImportUsersResponse(
                request.users().size(),
                created,
                updated,
                skipped,
                results
        );
    }

    private String normalize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim().toLowerCase();
    }
}
