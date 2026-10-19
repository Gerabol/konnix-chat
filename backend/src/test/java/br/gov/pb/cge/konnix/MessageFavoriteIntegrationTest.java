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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
class MessageFavoriteIntegrationTest {

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

    private static final String PASSWORD = "senha-forte-123";
    private String adminToken;

    @BeforeEach
    void setup() {
        adminToken = login("admin", "admin-senha-123");
    }

    @Test
    void favoritarEDesfavoritarMensagemComIsolamento() throws Exception {
        createUser("user-fav-1");
        createUser("user-fav-2");
        String token1 = login("user-fav-1", PASSWORD);
        String token2 = login("user-fav-2", PASSWORD);

        String roomId = createRoom(token1, "Grupo Teste Fav");
        addMember(token1, roomId, getUserId(token2));

        String messageId = sendMessage(token1, roomId, "Mensagem importante!");

        // Usuário 1 favorita a mensagem
        mockMvc.perform(post("/api/v1/messages/{id}/favorite", messageId)
                        .header("Authorization", "Bearer " + token1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.favorite").value(true));

        // Usuário 1 consulta IDs favoritos da sala
        mockMvc.perform(get("/api/v1/rooms/{roomId}/messages/favorite-ids", roomId)
                        .header("Authorization", "Bearer " + token1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0]").value(messageId));

        // Usuário 2 consulta IDs favoritos da mesma sala: lista vazia (isolamento)
        mockMvc.perform(get("/api/v1/rooms/{roomId}/messages/favorite-ids", roomId)
                        .header("Authorization", "Bearer " + token2))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());

        // Usuário 1 consulta listagem completa de favoritas na sala
        MvcResult favResult = mockMvc.perform(get("/api/v1/messages/favorites")
                        .param("roomId", roomId)
                        .header("Authorization", "Bearer " + token1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].message.id").value(messageId))
                .andExpect(jsonPath("$.data[0].message.content").value("Mensagem importante!"))
                .andExpect(jsonPath("$.data[0].roomName").value("Grupo Teste Fav"))
                .andReturn();

        JsonNode favNode = objectMapper.readTree(favResult.getResponse().getContentAsString());
        assertThat(favNode.path("data").size()).isEqualTo(1);

        // Toggle: Usuário 1 chama POST novamente para desfavoritar
        mockMvc.perform(post("/api/v1/messages/{id}/favorite", messageId)
                        .header("Authorization", "Bearer " + token1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.favorite").value(false));

        // Verifica que lista ficou vazia
        mockMvc.perform(get("/api/v1/rooms/{roomId}/messages/favorite-ids", roomId)
                        .header("Authorization", "Bearer " + token1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());

        // Favorita novamente e remove via DELETE explícito
        mockMvc.perform(post("/api/v1/messages/{id}/favorite", messageId)
                        .header("Authorization", "Bearer " + token1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.favorite").value(true));

        mockMvc.perform(delete("/api/v1/messages/{id}/favorite", messageId)
                        .header("Authorization", "Bearer " + token1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.favorite").value(false));
    }

    @Test
    void usuarioNaoMembroNaoPodeFavoritar() throws Exception {
        createUser("membro-sala");
        createUser("intruso");
        String tokenMembro = login("membro-sala", PASSWORD);
        String tokenIntruso = login("intruso", PASSWORD);

        String roomId = createRoom(tokenMembro, "Grupo Privado");
        String messageId = sendMessage(tokenMembro, roomId, "Segredo");

        mockMvc.perform(post("/api/v1/messages/{id}/favorite", messageId)
                        .header("Authorization", "Bearer " + tokenIntruso))
                .andExpect(status().isForbidden());
    }

    @Test
    void mensagemApagadaNaoApareceEmFavoritos() throws Exception {
        createUser("autor-msg");
        String token = login("autor-msg", PASSWORD);

        String roomId = createRoom(token, "Sala Apagar");
        String messageId = sendMessage(token, roomId, "Esta mensagem sera apagada");

        // Favorita
        mockMvc.perform(post("/api/v1/messages/{id}/favorite", messageId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.favorite").value(true));

        // Apaga a mensagem
        mockMvc.perform(delete("/api/v1/messages/{id}", messageId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        // Não deve aparecer na listagem de favoritos
        mockMvc.perform(get("/api/v1/messages/favorites")
                        .param("roomId", roomId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());

        // Nem nos IDs
        mockMvc.perform(get("/api/v1/rooms/{roomId}/messages/favorite-ids", roomId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());
    }

    private String login(String username, String password) {
        try {
            MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
            return body.path("data").path("token").asText();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private String getUserId(String token) {
        try {
            MvcResult result = mockMvc.perform(get("/api/v1/auth/me")
                            .header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
            return body.path("data").path("id").asText();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private String createUser(String username) {
        try {
            String temporaryPassword = "temp-" + username + "-123";
            MvcResult result = mockMvc.perform(post("/api/v1/users")
                            .header("Authorization", "Bearer " + adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"username\":\"" + username + "\",\"name\":\"" + username
                                    + "\",\"email\":\"" + username + "@test.local\",\"password\":\"" + temporaryPassword + "\"}"))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
            String token = login(username, temporaryPassword);
            mockMvc.perform(post("/api/v1/auth/change-required-password")
                            .header("Authorization", "Bearer " + token)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"newPassword\":\"" + PASSWORD + "\",\"confirmPassword\":\"" + PASSWORD + "\"}"))
                    .andExpect(status().isOk());
            return body.path("data").path("id").asText();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private String createRoom(String token, String name) {
        try {
            MvcResult result = mockMvc.perform(post("/api/v1/rooms")
                            .header("Authorization", "Bearer " + token)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"" + name + "\",\"type\":\"PRIVATE_GROUP\"}"))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
            return body.path("data").path("id").asText();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private void addMember(String token, String roomId, String userId) {
        try {
            mockMvc.perform(post("/api/v1/rooms/{id}/members", roomId)
                            .header("Authorization", "Bearer " + token)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"userId\":\"" + userId + "\"}"))
                    .andExpect(status().isOk());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private String sendMessage(String token, String roomId, String content) {
        try {
            MvcResult result = mockMvc.perform(post("/api/v1/rooms/{id}/messages", roomId)
                            .header("Authorization", "Bearer " + token)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"content\":\"" + content + "\"}"))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
            return body.path("data").path("id").asText();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
