package br.gov.pb.cge.konnix;

import br.gov.pb.cge.konnix.api.user.dto.ImportUserItem;
import br.gov.pb.cge.konnix.api.user.dto.ImportUsersRequest;
import br.gov.pb.cge.konnix.api.user.dto.ImportUsersResponse;
import br.gov.pb.cge.konnix.domain.user.Role;
import br.gov.pb.cge.konnix.domain.user.RoleRepository;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.service.UserImportService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
@SpringBootTest(properties = {
        "KONNIX_ADMIN_USERNAME=admin",
        "KONNIX_ADMIN_NAME=Admin Teste",
        "KONNIX_ADMIN_EMAIL=admin@test.local",
        "KONNIX_ADMIN_PASSWORD=admin-senha-123"
})
class UserImportTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    private UserImportService userImportService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void setup() {
        // Assegura que a role USER existe
        if (roleRepository.findByName("USER").isEmpty()) {
            Role userRole = new Role();
            userRole.setName("USER");
            userRole.setDescription("Usuário comum");
            roleRepository.save(userRole);
        }
    }

    @Test
    void importUsersCriaUsuariosComSenhaPadraoETrocaObrigatoria() {
        ImportUsersRequest request = new ImportUsersRequest(
                "cge@2026",
                List.of(
                        new ImportUserItem("novo.colega1", "Colega Um", "colega1@cge.pb.gov.br", true),
                        new ImportUserItem("novo.colega2", "Colega Dois (Inativo)", "colega2@cge.pb.gov.br", false)
                )
        );

        ImportUsersResponse response = userImportService.importUsers(request, null, "127.0.0.1");

        assertThat(response.totalProcessed()).isEqualTo(2);
        assertThat(response.createdCount()).isEqualTo(2);
        assertThat(response.updatedCount()).isEqualTo(0);

        // Valida usuário 1 (ativo)
        User user1 = userRepository.findByUsername("novo.colega1").orElseThrow();
        assertThat(user1.getName()).isEqualTo("Colega Um");
        assertThat(user1.getEmail()).isEqualTo("colega1@cge.pb.gov.br");
        assertThat(user1.isActive()).isTrue();
        assertThat(user1.getAccountStatus()).isEqualTo("ACTIVE");
        assertThat(user1.isPasswordChangeRequired()).isTrue();
        assertThat(user1.isPasswordMigrationRequired()).isFalse();
        assertThat(passwordEncoder.matches("cge@2026", user1.getPasswordHash())).isTrue();
        assertThat(user1.getRoles()).extracting(Role::getName).contains("USER");

        // Valida usuário 2 (inativo / DISABLED para preservar histórico)
        User user2 = userRepository.findByUsername("novo.colega2").orElseThrow();
        assertThat(user2.getName()).isEqualTo("Colega Dois (Inativo)");
        assertThat(user2.isActive()).isFalse();
        assertThat(user2.getAccountStatus()).isEqualTo("DISABLED");
        assertThat(user2.isPasswordChangeRequired()).isTrue();
        assertThat(passwordEncoder.matches("cge@2026", user2.getPasswordHash())).isTrue();
        assertThat(user2.getRoles()).extracting(Role::getName).contains("USER");
    }

    @Test
    void importUsersIdempotenteAtualizaSemDuplicar() {
        ImportUsersRequest request = new ImportUsersRequest(
                "cge@2026",
                List.of(
                        new ImportUserItem("colega.idempotente", "Nome Original", "idemp@cge.pb.gov.br", true)
                )
        );
        userImportService.importUsers(request, null, "127.0.0.1");

        // Segunda execução com dados atualizados
        ImportUsersRequest updateRequest = new ImportUsersRequest(
                "cge@2026",
                List.of(
                        new ImportUserItem("colega.idempotente", "Nome Atualizado", "idemp@cge.pb.gov.br", true)
                )
        );
        ImportUsersResponse secondResponse = userImportService.importUsers(updateRequest, null, "127.0.0.1");

        assertThat(secondResponse.totalProcessed()).isEqualTo(1);
        assertThat(secondResponse.createdCount()).isEqualTo(0);
        assertThat(secondResponse.updatedCount()).isEqualTo(1);

        User updated = userRepository.findByUsername("colega.idempotente").orElseThrow();
        assertThat(updated.getName()).isEqualTo("Nome Atualizado");
    }
}
