package br.gov.pb.cge.konnix;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "KONNIX_ADMIN_USERNAME=admin",
        "KONNIX_ADMIN_NAME=Admin Teste",
        "KONNIX_ADMIN_EMAIL=admin@test.local",
        "KONNIX_ADMIN_PASSWORD=admin-senha-123",
        "KONNIX_UPLOADS_DIR=target/test-uploads-regressao"
})
@AutoConfigureMockMvc
class AttachmentDateRegressionTest {

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("KONNIX_TEST_DB_URL"));
        registry.add("spring.datasource.username", () -> System.getenv("KONNIX_TEST_DB_USER"));
        registry.add("spring.datasource.password", () -> System.getenv("KONNIX_TEST_DB_PASSWORD"));
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private static final byte[] CONTEUDO = "imagem de teste".getBytes(StandardCharsets.UTF_8);

    private String adminToken;

    @BeforeEach
    void setup() {
        adminToken = login("admin", "admin-senha-123");
    }

    @Test
    void anexoNaoRetornaDataEpoch() throws Exception {
        String roomId = createRoom("canal-epoch-anexo");
        Instant antes = Instant.now().minusSeconds(5);
        MvcResult result = mockMvc.perform(multipart("/api/v1/rooms/{id}/files", roomId)
                        .file(new MockMultipartFile("file", "foto.png", "image/png", CONTEUDO))
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andReturn();

        String createdAt = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("createdAt").asText();
        assertThat(createdAt)
                .as("createdAt da mensagem com anexo nao pode ser nulo/epoch")
                .isNotBlank()
                .isNotEqualTo("null");
        assertThat(Instant.parse(createdAt))
                .as("createdAt da mensagem com anexo deve ser o instante atual")
                .isAfter(antes);
    }

    @Test
    void textoNaoRetornaDataEpoch() throws Exception {
        String roomId = createRoom("canal-epoch-texto");
        Instant antes = Instant.now().minusSeconds(5);

        MvcResult result = mockMvc.perform(post("/api/v1/rooms/{id}/messages", roomId)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"ola\"}"))
                .andExpect(status().isOk())
                .andReturn();

        String createdAt = objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("createdAt").asText();
        assertThat(Instant.parse(createdAt)).isAfter(antes);
    }

    private String createRoom(String name) {
        try {
            MvcResult result = mockMvc.perform(post("/api/v1/rooms")
                            .header("Authorization", "Bearer " + adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"" + name + "-" + UUID.randomUUID().toString().substring(0, 8)
                                    + "\",\"type\":\"CHANNEL\"}"))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
            return body.path("data").path("id").asText();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private String login(String username, String password) {
        try {
            MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                    .andReturn();
            JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
            return body.path("data").path("token").asText();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
