package br.gov.pb.cge.konnix.bootstrap;

import br.gov.pb.cge.konnix.domain.user.Role;
import br.gov.pb.cge.konnix.domain.user.RoleRepository;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;

@Component
public class AdminBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

    private final Environment environment;
    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;

    public AdminBootstrap(Environment environment,
                          UserRepository userRepository,
                          RoleRepository roleRepository,
                          PasswordEncoder passwordEncoder) {
        this.environment = environment;
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        String username = property("KONNIX_ADMIN_USERNAME");
        String name = property("KONNIX_ADMIN_NAME");
        String email = property("KONNIX_ADMIN_EMAIL");
        String password = property("KONNIX_ADMIN_PASSWORD");

        if (username == null || username.isBlank()) {
            log.info("AdminBootstrap: KONNIX_ADMIN_USERNAME não definido, bootstrap ignorado");
            return;
        }

        Role adminRole = roleRepository.findByName("ADMIN")
                .orElseThrow(() -> new IllegalStateException("Role ADMIN não encontrada no banco"));

        userRepository.findByUsername(username.trim()).ifPresentOrElse(existing -> {
            existing.getRoles().add(adminRole);
            userRepository.save(existing);
            log.info("AdminBootstrap: administrador '{}' já existia; role ADMIN garantida (senha não alterada)", username);
        }, () -> {
            if (password == null || password.isBlank() || name == null || name.isBlank()) {
                log.warn("AdminBootstrap: KONNIX_ADMIN_PASSWORD/KONNIX_ADMIN_NAME obrigatórios para criar '{}'; bootstrap ignorado", username);
                return;
            }
            User admin = new User();
            admin.setUsername(username.trim());
            admin.setName(name.trim());
            admin.setEmail(normalize(email));
            admin.setPasswordHash(passwordEncoder.encode(password));
            admin.setActive(true);
            admin.setUserType("USER");
            admin.setPasswordMigrationRequired(false);
            admin.getRoles().add(adminRole);
            userRepository.save(admin);
            log.info("AdminBootstrap: administrador '{}' criado com role ADMIN", username);
        });
    }

    private String property(String key) {
        return environment.getProperty(key);
    }

    private String normalize(String value) {
        return value == null || value.isBlank() ? null : value.trim().toLowerCase();
    }
}
