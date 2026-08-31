package br.gov.pb.cge.konnix;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Testcontainers
@SpringBootTest(properties = {
        "KONNIX_ADMIN_USERNAME=admin",
        "KONNIX_ADMIN_NAME=Admin Teste",
        "KONNIX_ADMIN_EMAIL=admin@test.local",
        "KONNIX_ADMIN_PASSWORD=admin-senha-123"
})
@AutoConfigureMockMvc
class AuthSecurityIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String adminToken;

    @BeforeEach
    void setupAdminToken() throws Exception {
        adminToken = login("admin", "admin-senha-123");
    }

    @Test
    void loginValidoRetornaToken() throws Exception {
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"admin-senha-123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.token").isNotEmpty())
                .andExpect(jsonPath("$.data.user.username").value("admin"))
                .andExpect(jsonPath("$.data.user.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.data.user.roles", org.hamcrest.Matchers.hasItem("ADMIN")));
    }

    @Test
    void loginInvalidoRetornaErro() throws Exception {
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"senha-errada\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void loginUsuarioInexistenteRetornaErro() throws Exception {
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"naoexiste\",\"password\":\"qualquer123\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void loginUsuarioInativoRetornaErro() throws Exception {
        String userId = createUser("inativo01", "Usuário Inativo", "inativo01@test.local", "senha-inativo-1");
        mockMvc.perform(post("/api/v1/users/{id}/deactivate", userId)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"inativo01\",\"password\":\"senha-inativo-1\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("USER_INACTIVE"));
    }

    @Test
    void endpointProtegidoSemTokenRetorna401() throws Exception {
        mockMvc.perform(get("/api/v1/users"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @Test
    void usuarioComumNaoPodeAcessarAdmin() throws Exception {
        createUser("comum01", "Usuário Comum", "comum01@test.local", "senha-comum-01");
        completarPrimeiroAcesso("comum01", "senha-comum-01", "senha-comum-nova");
        String comumToken = login("comum01", "senha-comum-nova");

        mockMvc.perform(get("/api/v1/users")
                        .header("Authorization", "Bearer " + comumToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @Test
    void administradorPermaneceSempreAtivo() throws Exception {
        mockMvc.perform(patch("/api/v1/admin/users/{id}/status", userId("admin"))
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"DISABLED\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("ADMIN_STATUS_LOCKED"));

        mockMvc.perform(get("/api/v1/auth/me")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.active").value(true))
                .andExpect(jsonPath("$.data.accountStatus").value("ACTIVE"));
    }

    @Test
    void usuarioEditaApenasNomeEmailEMantemCamposProtegidos() throws Exception {
        createUser("perfil01", "Perfil Original", "perfil01@test.local", "senha-perfil-01");
        completarPrimeiroAcesso("perfil01", "senha-perfil-01", "senha-perfil-final");
        String token = login("perfil01", "senha-perfil-final");

        mockMvc.perform(patch("/api/v1/auth/profile")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Perfil Editado\",\"email\":\"perfil01@novo.local\","
                                + "\"password\":\"hackeada-123\",\"active\":false,\"roles\":[\"ADMIN\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name").value("Perfil Editado"))
                .andExpect(jsonPath("$.data.email").value("perfil01@novo.local"))
                .andExpect(jsonPath("$.data.active").value(true))
                .andExpect(jsonPath("$.data.username").value("perfil01"));

        assertThat(login("perfil01", "senha-perfil-final")).isNotBlank();

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"perfil01\",\"password\":\"hackeada-123\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("INVALID_CREDENTIALS"));

        mockMvc.perform(get("/api/v1/auth/me")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.roles", org.hamcrest.Matchers.hasItem("USER")))
                .andExpect(jsonPath("$.data.roles", org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("ADMIN"))));
    }

    @Test
    void usuarioAtualizaApenasOProprioTema() throws Exception {
        createUser("tema01", "Usuário Tema", "tema01@test.local", "senha-tema-01");
        completarPrimeiroAcesso("tema01", "senha-tema-01", "senha-tema-nova");
        String token = login("tema01", "senha-tema-nova");

        mockMvc.perform(patch("/api/v1/auth/preferences")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"theme\":\"DARK\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.theme").value("DARK"));

        mockMvc.perform(get("/api/v1/auth/me")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.theme").value("DARK"));

        mockMvc.perform(patch("/api/v1/auth/preferences")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"theme\":\"INVALID\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.theme").value("DEFAULT"));
    }

    @Test
    void adminCriaUsuarioComSucesso() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/users")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"novouser\",\"name\":\"Novo Usuário\",\"email\":\"novo@test.local\",\"password\":\"senha-novo-123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.username").value("novouser"))
                .andExpect(jsonPath("$.data.active").value(true))
                .andExpect(jsonPath("$.data.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.data.roles", org.hamcrest.Matchers.hasItem("USER")))
                .andExpect(jsonPath("$.data.passwordChangeRequired").value(true))
                .andReturn();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.path("data").path("id").asText()).isNotBlank();

        MvcResult firstLogin = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"novouser\",\"password\":\"senha-novo-123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.passwordChangeRequired").value(true))
                .andReturn();
        String comumToken = objectMapper.readTree(firstLogin.getResponse().getContentAsString()).path("data").path("token").asText();
        assertThat(comumToken).isNotBlank();

        mockMvc.perform(get("/api/v1/rooms")
                        .header("Authorization", "Bearer " + comumToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("PASSWORD_CHANGE_REQUIRED"));
    }

    @Test
    void senhaRedefinidaPeloAdminExigeTrocaEInvalidaSessoes() throws Exception {
        String userId = createUser("troca-obrigatoria", "Troca Obrigatória", "troca@test.local", "senha-inicial-123");

        MvcResult primeiroAcesso = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"troca-obrigatoria\",\"password\":\"senha-inicial-123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.passwordChangeRequired").value(true))
                .andReturn();
        String primeiroToken = objectMapper.readTree(primeiroAcesso.getResponse().getContentAsString()).path("data").path("token").asText();

        mockMvc.perform(post("/api/v1/auth/change-required-password")
                        .header("Authorization", "Bearer " + primeiroToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newPassword\":\"senha-original-123\",\"confirmPassword\":\"senha-original-123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.passwordChangeRequired").value(false));

        String oldToken = login("troca-obrigatoria", "senha-original-123");

        mockMvc.perform(patch("/api/v1/users/{id}", userId)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Nome Atualizado\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.passwordChangeRequired").value(false));

        assertThat(login("troca-obrigatoria", "senha-original-123")).isNotBlank();

        mockMvc.perform(patch("/api/v1/users/{id}", userId)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"senha-temporaria-123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.passwordChangeRequired").value(true));

        mockMvc.perform(get("/api/v1/auth/me")
                        .header("Authorization", "Bearer " + oldToken))
                .andExpect(status().isUnauthorized());

        MvcResult login = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"troca-obrigatoria\",\"password\":\"senha-temporaria-123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.passwordChangeRequired").value(true))
                .andReturn();
        String temporaryToken = objectMapper.readTree(login.getResponse().getContentAsString()).path("data").path("token").asText();

        mockMvc.perform(get("/api/v1/rooms")
                        .header("Authorization", "Bearer " + temporaryToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("PASSWORD_CHANGE_REQUIRED"));

        mockMvc.perform(post("/api/v1/auth/change-required-password")
                        .header("Authorization", "Bearer " + temporaryToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newPassword\":\"senha-nova-123\",\"confirmPassword\":\"outra-123\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("PASSWORDS_DO_NOT_MATCH"));

        mockMvc.perform(post("/api/v1/auth/change-required-password")
                        .header("Authorization", "Bearer " + temporaryToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newPassword\":\"senha-temporaria-123\",\"confirmPassword\":\"senha-temporaria-123\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("PASSWORD_MUST_DIFFER"));

        mockMvc.perform(post("/api/v1/auth/change-required-password")
                        .header("Authorization", "Bearer " + temporaryToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newPassword\":\"senha-nova-123\",\"confirmPassword\":\"senha-nova-123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.passwordChangeRequired").value(false));

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"troca-obrigatoria\",\"password\":\"senha-temporaria-123\"}"))
                .andExpect(status().isUnauthorized());
        assertThat(login("troca-obrigatoria", "senha-nova-123")).isNotBlank();
    }

    @Test
    void criarUsuarioDuplicadoRetornaConflict() throws Exception {
        mockMvc.perform(post("/api/v1/users")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"dup01\",\"name\":\"Duplicado\",\"email\":\"dup01@test.local\",\"password\":\"senha-dup-1234\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/users")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"dup01\",\"name\":\"Duplicado\",\"email\":\"outro@test.local\",\"password\":\"senha-dup-1234\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("USERNAME_TAKEN"));
    }

    @Test
    void logoutInvalidaSessao() throws Exception {
        mockMvc.perform(get("/api/v1/auth/me")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.username").value("admin"));

        mockMvc.perform(post("/api/v1/auth/logout")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        mockMvc.perform(get("/api/v1/auth/me")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isUnauthorized());
    }

    private String login(String username, String password) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.path("data").path("token").asText();
    }

    private void completarPrimeiroAcesso(String username, String senhaTemporaria, String novaSenha) throws Exception {
        String token = login(username, senhaTemporaria);
        assertThat(token).isNotBlank();
        mockMvc.perform(post("/api/v1/auth/change-required-password")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newPassword\":\"" + novaSenha + "\",\"confirmPassword\":\"" + novaSenha + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.passwordChangeRequired").value(false));
    }

    private String createUser(String username, String name, String email, String password) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/users")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"name\":\"" + name
                                + "\",\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.path("data").path("id").asText();
    }

    private String userId(String username) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/users")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andReturn();
        for (JsonNode user : objectMapper.readTree(result.getResponse().getContentAsString()).path("data")) {
            if (username.equals(user.path("username").asText())) return user.path("id").asText();
        }
        throw new IllegalStateException("Usuário não encontrado: " + username);
    }
}
