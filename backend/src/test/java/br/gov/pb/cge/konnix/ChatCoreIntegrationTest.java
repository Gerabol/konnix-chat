package br.gov.pb.cge.konnix;

import br.gov.pb.cge.konnix.domain.room.Room;
import br.gov.pb.cge.konnix.domain.room.RoomRepository;
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

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
class ChatCoreIntegrationTest {

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
    private RoomRepository roomRepository;

    private static final String PASSWORD = "senha-forte-123";

    private String adminToken;

    @BeforeEach
    void setup() {
        adminToken = login("admin", "admin-senha-123");
    }

    @Test
    void adminCriaCanal() throws Exception {
        mockMvc.perform(post("/api/v1/rooms")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"canal-admin\",\"type\":\"CHANNEL\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name").value("canal-admin"))
                .andExpect(jsonPath("$.data.type").value("CHANNEL"))
                .andExpect(jsonPath("$.data.readOnly").value(false));
    }

    @Test
    void usuarioComumNaoCriaCanal() throws Exception {
        String userId = createUser("comum-negado");
        String token = login("comum-negado", PASSWORD);

        mockMvc.perform(post("/api/v1/rooms")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"canal-negado\",\"type\":\"CHANNEL\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @Test
    void usuarioCriaGrupoPrivado() throws Exception {
        createUser("grupo-owner");
        String token = login("grupo-owner", PASSWORD);

        mockMvc.perform(post("/api/v1/rooms")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"grupo-01\",\"displayName\":\"Grupo Um\",\"type\":\"PRIVATE_GROUP\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.type").value("PRIVATE_GROUP"))
                .andExpect(jsonPath("$.data.displayName").value("Grupo Um"));
    }

    @Test
    void exProprietarioNaoMantemPermissoesAposPerderOwnership() throws Exception {
        String ownerId = createUser("grupo-owner-perdeu");
        String ownerToken = login("grupo-owner-perdeu", PASSWORD);
        String roomId = createRoom(ownerToken, "grupo-owner-perdeu", "PRIVATE_GROUP");
        String novoMembroId = createUser("novo-membro-sem-owner");

        mockMvc.perform(patch("/api/v1/admin/rooms/{roomId}/members/{userId}", roomId, ownerId)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":\"" + ownerId + "\",\"role\":\"MEMBER\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.role").value("MEMBER"));

        mockMvc.perform(post("/api/v1/rooms/{roomId}/members", roomId)
                        .header("Authorization", "Bearer " + ownerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":\"" + novoMembroId + "\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.message").value("Apenas o criador/owner gerencia membros do grupo privado"));
    }

    @Test
    void adicionarMembro() throws Exception {
        String roomId = createRoom(adminToken, "canal-addmember", "CHANNEL");
        String targetId = createUser("membro-novo");

        mockMvc.perform(post("/api/v1/rooms/{id}/members", roomId)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":\"" + targetId + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.userId").value(targetId))
                .andExpect(jsonPath("$.data.role").value("MEMBER"));
    }

    @Test
    void removerMembro() throws Exception {
        String roomId = createRoom(adminToken, "canal-removido", "CHANNEL");
        String targetId = createUser("membro-sai");
        addMember(adminToken, roomId, targetId);
        String targetToken = login("membro-sai", PASSWORD);

        mockMvc.perform(get("/api/v1/rooms/{id}/messages", roomId)
                        .header("Authorization", "Bearer " + targetToken))
                .andExpect(status().isOk());

        mockMvc.perform(delete("/api/v1/rooms/{roomId}/members/{userId}", roomId, targetId)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        mockMvc.perform(get("/api/v1/rooms/{id}/messages", roomId)
                        .header("Authorization", "Bearer " + targetToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("NOT_ROOM_MEMBER"));
    }

    @Test
    void criarConversaDireta() throws Exception {
        createUser("dm-origem");
        String otherId = createUser("dm-destino");
        String token = login("dm-origem", PASSWORD);

        mockMvc.perform(post("/api/v1/direct-messages")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":\"" + otherId + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.type").value("DIRECT"));
    }

    @Test
    void dmDuplicadaRetornaMesmaSala() throws Exception {
        createUser("dm-origem2");
        String otherId = createUser("dm-repetido");
        String token = login("dm-origem2", PASSWORD);

        String first = createDm(token, otherId);
        String second = createDm(token, otherId);

        assertThat(second).isEqualTo(first);
    }

    @Test
    void dmConsigoMesmoRetornaMesmaSala() throws Exception {
        createUser("dm-self");
        String otherId = createUser("dm-self-other");
        String token = login("dm-self", PASSWORD);
        String selfId = userIdByUsername("dm-self");

        createDm(token, otherId);

        MvcResult first = mockMvc.perform(post("/api/v1/direct-messages")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":\"" + selfId + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.type").value("DIRECT"))
                .andExpect(jsonPath("$.data.directPartner.userId").value(selfId))
                .andReturn();
        String firstRoomId = objectMapper.readTree(first.getResponse().getContentAsString()).path("data").path("id").asText();

        String secondRoomId = createDm(token, selfId);
        assertThat(secondRoomId).isEqualTo(firstRoomId);
    }

    @Test
    void enviarMensagem() throws Exception {
        String roomId = createRoom(adminToken, "canal-msg", "CHANNEL");
        String memberId = createUser("msg-enviador");
        String memberToken = login("msg-enviador", PASSWORD);
        addMember(adminToken, roomId, memberId);

        mockMvc.perform(post("/api/v1/rooms/{id}/messages", roomId)
                        .header("Authorization", "Bearer " + memberToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"olá mundo\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").value("olá mundo"))
                .andExpect(jsonPath("$.data.roomId").value(roomId))
                .andExpect(jsonPath("$.data.userId").value(memberId));
    }

    @Test
    void usuarioEmLeituraPodeLerMasNaoPodeEnviar() throws Exception {
        String roomId = createRoom(adminToken, "canal-leitura", "CHANNEL");
        String userId = createUser("modo-leitura");
        addMember(adminToken, roomId, userId);
        setAccountStatus(userId, "READ_ONLY");
        String token = login("modo-leitura", PASSWORD);

        mockMvc.perform(get("/api/v1/rooms/{id}/messages", roomId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/rooms/{id}/messages", roomId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"não deve enviar\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("ACCOUNT_READ_ONLY"));
    }

    @Test
    void grupoPermiteCriarEVotarEmEnquete() throws Exception {
        String roomId = createRoom(adminToken, "grupo-enquete", "PRIVATE_GROUP");
        String userId = createUser("votante-enquete");
        addMember(adminToken, roomId, userId);
        String token = login("votante-enquete", PASSWORD);

        MvcResult created = mockMvc.perform(post("/api/v1/rooms/{id}/polls", roomId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"question\":\"Qual horário?\",\"options\":[\"Manhã\",\"Tarde\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.messageType").value("POLL"))
                .andExpect(jsonPath("$.data.poll.question").value("Qual horário?"))
                .andExpect(jsonPath("$.data.poll.options.length()").value(2))
                .andReturn();
        JsonNode poll = objectMapper.readTree(created.getResponse().getContentAsString()).path("data").path("poll");
        String pollId = poll.path("id").asText();
        String optionId = poll.path("options").get(0).path("id").asText();

        mockMvc.perform(post("/api/v1/polls/{id}/votes", pollId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"optionId\":\"" + optionId + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.poll.options[0].votes").value(1))
                .andExpect(jsonPath("$.data.poll.options[0].selected").value(true));
    }

    @Test
    void usuarioDesativadoNaoPodeIniciarDm() throws Exception {
        String userId = createUser("usuario-desativado");
        setAccountStatus(userId, "DISABLED");

        mockMvc.perform(post("/api/v1/direct-messages")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":\"" + userId + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("USER_UNAVAILABLE"));
    }

    @Test
    void foraDaRoomNaoLeMensagens() throws Exception {
        String roomId = createRoom(adminToken, "canal-foraleitura", "CHANNEL");
        String outsiderId = createUser("fora-leitura");
        String outsiderToken = login("fora-leitura", PASSWORD);

        mockMvc.perform(get("/api/v1/rooms/{id}/messages", roomId)
                        .header("Authorization", "Bearer " + outsiderToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("NOT_ROOM_MEMBER"));
    }

    @Test
    void foraDaRoomNaoEnvia() throws Exception {
        String roomId = createRoom(adminToken, "canal-foraenvio", "CHANNEL");
        createUser("fora-envio");
        String outsiderToken = login("fora-envio", PASSWORD);

        mockMvc.perform(post("/api/v1/rooms/{id}/messages", roomId)
                        .header("Authorization", "Bearer " + outsiderToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"não devia\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("NOT_ROOM_MEMBER"));
    }

    @Test
    void editarPropriaMensagem() throws Exception {
        String roomId = createRoom(adminToken, "canal-editar", "CHANNEL");
        String messageId = sendMessage(adminToken, roomId, "versão 1");

        mockMvc.perform(patch("/api/v1/messages/{id}", messageId)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"versão 2\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").value("versão 2"))
                .andExpect(jsonPath("$.data.editedAt").isNotEmpty());
    }

    @Test
    void naoEditaMensagemDeOutro() throws Exception {
        String roomId = createRoom(adminToken, "canal-editalheia", "CHANNEL");
        String authorId = createUser("autor-msg");
        String authorToken = login("autor-msg", PASSWORD);
        addMember(adminToken, roomId, authorId);
        String messageId = sendMessage(authorToken, roomId, "mensagem alheia");

        createUser("editor-alheio");
        String editorToken = login("editor-alheio", PASSWORD);

        mockMvc.perform(patch("/api/v1/messages/{id}", messageId)
                        .header("Authorization", "Bearer " + editorToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"tentativa\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("CANNOT_EDIT_MESSAGE"));
    }

    @Test
    void exclusaoLogica() throws Exception {
        String roomId = createRoom(adminToken, "canal-excluir", "CHANNEL");
        String messageId = sendMessage(adminToken, roomId, "será apagada");

        mockMvc.perform(delete("/api/v1/messages/{id}", messageId)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.deletedAt").isNotEmpty());

        mockMvc.perform(get("/api/v1/rooms/{id}/messages", roomId)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.messages.length()").value(0));
    }

    @Test
    void mensagemEmRoomReadOnly() throws Exception {
        String roomId = createRoom(adminToken, "canal-readonly", "CHANNEL");
        String memberId = createUser("ro-membro");
        String memberToken = login("ro-membro", PASSWORD);
        addMember(adminToken, roomId, memberId);

        Room room = roomRepository.findById(UUID.fromString(roomId)).orElseThrow();
        room.setReadOnly(true);
        roomRepository.save(room);

        mockMvc.perform(post("/api/v1/rooms/{id}/messages", roomId)
                        .header("Authorization", "Bearer " + memberToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"bloqueado\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("ROOM_READ_ONLY"));

        mockMvc.perform(post("/api/v1/rooms/{id}/messages", roomId)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"admin escreve\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void threadComParentValido() throws Exception {
        String roomId = createRoom(adminToken, "canal-thread", "CHANNEL");
        String rootId = sendMessage(adminToken, roomId, "mensagem raiz");

        mockMvc.perform(post("/api/v1/rooms/{id}/messages", roomId)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"resposta em thread\",\"parentMessageId\":\"" + rootId + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.parentMessageId").value(rootId));
    }

    @Test
    void parentDeOutraRoomRetornaErro() throws Exception {
        String roomA = createRoom(adminToken, "canal-pa", "CHANNEL");
        String roomB = createRoom(adminToken, "canal-pb", "CHANNEL");
        String rootId = sendMessage(adminToken, roomA, "raiz da sala A");

        mockMvc.perform(post("/api/v1/rooms/{id}/messages", roomB)
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"resposta errada\",\"parentMessageId\":\"" + rootId + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("PARENT_ROOM_MISMATCH"));
    }

    @Test
    void paginacaoDeHistorico() throws Exception {
        String roomId = createRoom(adminToken, "canal-pagina", "CHANNEL");
        sendMessage(adminToken, roomId, "msg 1");
        Thread.sleep(5);
        sendMessage(adminToken, roomId, "msg 2");
        Thread.sleep(5);
        sendMessage(adminToken, roomId, "msg 3");

        MvcResult first = mockMvc.perform(get("/api/v1/rooms/{id}/messages", roomId)
                        .header("Authorization", "Bearer " + adminToken)
                        .param("limit", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.messages.length()").value(2))
                .andExpect(jsonPath("$.data.hasMore").value(true))
                .andExpect(jsonPath("$.data.nextBefore").isNotEmpty())
                .andReturn();

        JsonNode firstBody = objectMapper.readTree(first.getResponse().getContentAsString());
        String nextBefore = firstBody.path("data").path("nextBefore").asText();

        mockMvc.perform(get("/api/v1/rooms/{id}/messages", roomId)
                        .header("Authorization", "Bearer " + adminToken)
                        .param("limit", "2")
                        .param("before", nextBefore))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.messages.length()").value(1))
                .andExpect(jsonPath("$.data.hasMore").value(false));
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
            MvcResult result = mockMvc.perform(post("/api/v1/users")
                            .header("Authorization", "Bearer " + adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"username\":\"" + username + "\",\"name\":\"" + username
                                    + "\",\"email\":\"" + username + "@test.local\",\"password\":\"" + PASSWORD + "\"}"))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
            return body.path("data").path("id").asText();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private String userIdByUsername(String username) {
        try {
            MvcResult result = mockMvc.perform(get("/api/v1/users")
                            .header("Authorization", "Bearer " + adminToken))
                    .andReturn();
            JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
            for (JsonNode user : body.path("data")) {
                if (username.equals(user.path("username").asText())) {
                    return user.path("id").asText();
                }
            }
            return null;
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

    private void setAccountStatus(String userId, String status) {
        try {
            mockMvc.perform(patch("/api/v1/admin/users/{id}/status", userId)
                            .header("Authorization", "Bearer " + adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"" + status + "\"}"))
                    .andExpect(status().isOk());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private String createDm(String token, String userId) {
        try {
            MvcResult result = mockMvc.perform(post("/api/v1/direct-messages")
                            .header("Authorization", "Bearer " + token)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"userId\":\"" + userId + "\"}"))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
            return body.path("data").path("id").asText();
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
