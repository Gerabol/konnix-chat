package br.gov.pb.cge.konnix;

import br.gov.pb.cge.konnix.domain.push.PushSubscription;
import br.gov.pb.cge.konnix.domain.push.PushSubscriptionRepository;
import br.gov.pb.cge.konnix.push.WebPushSender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
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
        "KONNIX_ADMIN_PASSWORD=admin-senha-123",
        "KONNIX_VAPID_SUBJECT=mailto:teste@konnix.local"
})
@AutoConfigureMockMvc
class PushIntegrationTest {

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

    @Autowired
    private PushSubscriptionRepository subscriptionRepository;

    @MockitoSpyBean
    private WebPushSender pushSender;

    private static final String PASSWORD = "senha-forte-123";

    private String adminToken;

    @BeforeEach
    void setup() {
        adminToken = login("admin", "admin-senha-123");
    }

    @Test
    void cadastrarSubscription() throws Exception {
        String endpoint = "https://push.example.com/sub/" + UUID.randomUUID();

        mockMvc.perform(post("/api/v1/push/subscribe")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(subscriptionBody(endpoint)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.endpoint").value(endpoint))
                .andExpect(jsonPath("$.data.id").isNotEmpty());

        PushSubscription stored = subscriptionRepository.findByEndpoint(endpoint).orElseThrow();
        assertThat(stored.getP256dh()).isEqualTo("p256dh-exemplo");
        assertThat(stored.getAuth()).isEqualTo("auth-exemplo");
    }

    @Test
    void subscriptionPertenceAoUsuarioAutenticado() throws Exception {
        String memberId = createUser("push-dono");
        String memberToken = login("push-dono", PASSWORD);
        String endpoint = "https://push.example.com/owner/" + UUID.randomUUID();

        mockMvc.perform(post("/api/v1/push/subscribe")
                        .header("Authorization", "Bearer " + memberToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(subscriptionBody(endpoint)))
                .andExpect(status().isOk());

        PushSubscription stored = subscriptionRepository.findByEndpoint(endpoint).orElseThrow();
        assertThat(stored.getUser().getId().toString()).isEqualTo(memberId);
    }

    @Test
    void removerSubscription() throws Exception {
        String endpoint = "https://push.example.com/rm/" + UUID.randomUUID();
        mockMvc.perform(post("/api/v1/push/subscribe")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(subscriptionBody(endpoint)))
                .andExpect(status().isOk());

        mockMvc.perform(delete("/api/v1/push/unsubscribe")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"endpoint\":\"" + endpoint + "\"}"))
                .andExpect(status().isOk());

        assertThat(subscriptionRepository.findByEndpoint(endpoint)).isEmpty();
    }

    @Test
    void endpointSemAutenticacao() throws Exception {
        mockMvc.perform(post("/api/v1/push/subscribe")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(subscriptionBody("https://push.example.com/na/" + UUID.randomUUID())))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(delete("/api/v1/push/unsubscribe")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"endpoint\":\"https://push.example.com/x\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void chavePublicaDisponivelSemAutenticacao() throws Exception {
        mockMvc.perform(get("/api/v1/push/public-key"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.publicKey").isNotEmpty());
    }

    @Test
    void naoNotificaAutorEPayloadSemConteudoSensivel() throws Exception {
        String roomId = createRoom(adminToken, "push-sala", "CHANNEL");
        String memberId = createUser("push-recebe");
        String memberToken = login("push-recebe", PASSWORD);
        addMember(adminToken, roomId, memberId);

        String adminEndpoint = "https://push.example.com/admin/" + UUID.randomUUID();
        String memberEndpoint = "https://push.example.com/member/" + UUID.randomUUID();
        subscribe(adminToken, adminEndpoint);
        subscribe(memberToken, memberEndpoint);

        PushSubscription adminSub = subscriptionRepository.findByEndpoint(adminEndpoint).orElseThrow();
        PushSubscription memberSub = subscriptionRepository.findByEndpoint(memberEndpoint).orElseThrow();
        doNothing().when(pushSender).send(any(), anyString());

        mockMvc.perform(post("/api/v1/rooms/{id}/messages", roomId)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"dado sensível X\"}"))
                .andExpect(status().isOk());

        ArgumentCaptor<PushSubscription> subscriptionCaptor = ArgumentCaptor.forClass(PushSubscription.class);
        ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
        verify(pushSender, times(1)).send(subscriptionCaptor.capture(), payloadCaptor.capture());

        PushSubscription notified = subscriptionCaptor.getValue();
        assertThat(notified.getEndpoint()).isEqualTo(memberEndpoint);
        assertThat(notified.getEndpoint()).isNotEqualTo(adminSub.getEndpoint());
        assertThat(notified.getEndpoint()).isNotEqualTo(adminEndpoint);

        JsonNode payload = objectMapper.readTree(payloadCaptor.getValue());
        assertThat(payload.path("title").asText()).isEqualTo("Konnix Chat");
        assertThat(payload.path("body").asText()).isEqualTo("Nova mensagem de admin em push-sala");
        assertThat(payloadCaptor.getValue()).doesNotContain("dado sensível X");
    }

    private String subscriptionBody(String endpoint) {
        return "{\"endpoint\":\"" + endpoint
                + "\",\"p256dh\":\"p256dh-exemplo\",\"auth\":\"auth-exemplo\"}";
    }

    private void subscribe(String token, String endpoint) throws Exception {
        mockMvc.perform(post("/api/v1/push/subscribe")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(subscriptionBody(endpoint)))
                .andExpect(status().isOk());
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

    private String createUser(String username) {
        try {
            String temporaryPassword = "primeiro-acesso-" + PASSWORD;
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

    private String createRoom(String token, String name, String type) {
        try {
            MvcResult result = mockMvc.perform(post("/api/v1/rooms")
                            .header("Authorization", "Bearer " + token)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"" + name + "\",\"type\":\"" + type + "\"}"))
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
                    .andExpect(status().isOk())
                    .andReturn();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
