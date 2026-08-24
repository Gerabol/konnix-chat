package br.gov.pb.cge.konnix;

import br.gov.pb.cge.konnix.domain.attachment.Attachment;
import br.gov.pb.cge.konnix.domain.attachment.AttachmentRepository;
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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Testcontainers
@SpringBootTest(properties = {
        "KONNIX_ADMIN_USERNAME=admin",
        "KONNIX_ADMIN_NAME=Admin Teste",
        "KONNIX_ADMIN_EMAIL=admin@test.local",
        "KONNIX_ADMIN_PASSWORD=admin-senha-123",
        "KONNIX_MAX_FILE_SIZE=1024",
        "KONNIX_UPLOADS_DIR=target/test-uploads"
})
@AutoConfigureMockMvc
class FileStorageIntegrationTest {

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

    @Autowired
    private AttachmentRepository attachmentRepository;

    private static final String PASSWORD = "senha-forte-123";

    private static final byte[] CONTEUDO = "conteúdo do arquivo para teste\nlinha 2".getBytes(StandardCharsets.UTF_8);

    private String adminToken;

    @BeforeEach
    void setup() {
        adminToken = login("admin", "admin-senha-123");
    }

    @Test
    void uploadValidoRetornaMetadadosSeguros() throws Exception {
        String roomId = createRoom(adminToken, "canal-arquivo", "CHANNEL");

        MvcResult result = mockMvc.perform(multipart("/api/v1/rooms/{id}/files", roomId)
                        .file(new MockMultipartFile("file", "relatorio.txt", "text/plain", CONTEUDO))
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.messageType").value("FILE"))
                .andExpect(jsonPath("$.data.content").value("relatorio.txt"))
                .andExpect(jsonPath("$.data.attachment.id").isNotEmpty())
                .andExpect(jsonPath("$.data.attachment.originalName").value("relatorio.txt"))
                .andExpect(jsonPath("$.data.attachment.mimeType").value("text/plain"))
                .andExpect(jsonPath("$.data.attachment.size").value(CONTEUDO.length))
                .andExpect(jsonPath("$.data.attachment.storedName").doesNotExist())
                .andExpect(jsonPath("$.data.attachment.storagePath").doesNotExist())
                .andExpect(jsonPath("$.data.attachment.sha256").doesNotExist())
                .andReturn();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.path("data").path("attachment").path("id").asText()).isNotBlank();
    }

    @Test
    void uploadSemAutenticacao() throws Exception {
        String roomId = createRoom(adminToken, "canal-nauth", "CHANNEL");

        mockMvc.perform(multipart("/api/v1/rooms/{id}/files", roomId)
                        .file(new MockMultipartFile("file", "a.txt", "text/plain", CONTEUDO)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void uploadForaDaRoom() throws Exception {
        String roomId = createRoom(adminToken, "canal-fora", "CHANNEL");
        createUser("fora-arquivo");
        String outsiderToken = login("fora-arquivo", PASSWORD);

        mockMvc.perform(multipart("/api/v1/rooms/{id}/files", roomId)
                        .file(new MockMultipartFile("file", "a.txt", "text/plain", CONTEUDO))
                        .header("Authorization", "Bearer " + outsiderToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("NOT_ROOM_MEMBER"));
    }

    @Test
    void uploadAcimaDoLimite() throws Exception {
        String roomId = createRoom(adminToken, "canal-grande", "CHANNEL");
        byte[] big = new byte[2048];
        for (int i = 0; i < big.length; i++) {
            big[i] = (byte) 'x';
        }

        mockMvc.perform(multipart("/api/v1/rooms/{id}/files", roomId)
                        .file(new MockMultipartFile("file", "grande.bin", "application/octet-stream", big))
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.error.code").value("FILE_TOO_LARGE"));
    }

    @Test
    void uploadArquivoVazio() throws Exception {
        String roomId = createRoom(adminToken, "canal-vazio", "CHANNEL");

        mockMvc.perform(multipart("/api/v1/rooms/{id}/files", roomId)
                        .file(new MockMultipartFile("file", "vazio.txt", "text/plain", new byte[0]))
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("FILE_EMPTY"));
    }

    @Test
    @org.springframework.transaction.annotation.Transactional
    void metadadosGravadosNoBanco() throws Exception {
        String roomId = createRoom(adminToken, "canal-meta", "CHANNEL");
        String attachmentId = upload(adminToken, roomId, "meta.txt", "text/plain", CONTEUDO);

        Attachment attachment = attachmentRepository.findById(UUID.fromString(attachmentId)).orElseThrow();
        assertThat(attachment.getOriginalName()).isEqualTo("meta.txt");
        assertThat(attachment.getMimeType()).isEqualTo("text/plain");
        assertThat(attachment.getSize()).isEqualTo(CONTEUDO.length);
        assertThat(attachment.getStoragePath()).matches("\\d{4}/\\d{2}/[0-9a-f-]{36}");
        assertThat(attachment.getStoredName()).isNotBlank();
        assertThat(attachment.getLegacySource()).isNull();
        assertThat(attachment.getLegacyId()).isNull();
        assertThat(attachment.getMessage().getRoom().getId().toString()).isEqualTo(roomId);
    }

    @Test
    void sha256GeradoDuranteGravacao() throws Exception {
        String roomId = createRoom(adminToken, "canal-sha", "CHANNEL");
        String attachmentId = upload(adminToken, roomId, "hash.txt", "text/plain", CONTEUDO);

        Attachment attachment = attachmentRepository.findById(UUID.fromString(attachmentId)).orElseThrow();
        String expected = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(CONTEUDO));
        assertThat(attachment.getSha256()).isEqualTo(expected);
    }

    @Test
    void mensagemTipoFILEVinculada() throws Exception {
        String roomId = createRoom(adminToken, "canal-msgfile", "CHANNEL");

        MvcResult result = mockMvc.perform(multipart("/api/v1/rooms/{id}/files", roomId)
                        .file(new MockMultipartFile("file", "doc.pdf", "application/pdf", CONTEUDO))
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        String messageId = body.path("data").path("id").asText();
        String attachmentId = body.path("data").path("attachment").path("id").asText();

        mockMvc.perform(get("/api/v1/rooms/{id}/messages", roomId)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.messages[0].messageType").value("FILE"))
                .andExpect(jsonPath("$.data.messages[0].attachment.id").value(attachmentId))
                .andExpect(jsonPath("$.data.messages[0].id").value(messageId));
    }

    @Test
    void downloadValidoComNomeOriginal() throws Exception {
        String roomId = createRoom(adminToken, "canal-dl", "CHANNEL");
        String attachmentId = upload(adminToken, roomId, "download.txt", "text/plain", CONTEUDO);

        mockMvc.perform(get("/api/v1/files/{id}", attachmentId)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "text/plain"))
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("attachment")))
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("download.txt")))
                .andExpect(content().bytes(CONTEUDO));
    }

    @Test
    void downloadForaDaRoom() throws Exception {
        String roomId = createRoom(adminToken, "canal-dlfora", "CHANNEL");
        String attachmentId = upload(adminToken, roomId, "secreto.txt", "text/plain", CONTEUDO);
        createUser("fora-dl");
        String outsiderToken = login("fora-dl", PASSWORD);

        mockMvc.perform(get("/api/v1/files/{id}", attachmentId)
                        .header("Authorization", "Bearer " + outsiderToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("NOT_ROOM_MEMBER"));
    }

    @Test
    void downloadDeArquivoInexistente() throws Exception {
        mockMvc.perform(get("/api/v1/files/{id}", UUID.randomUUID())
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("FILE_NOT_FOUND"));
    }

    @Test
    void downloadSemArquivoFisico() throws Exception {
        String roomId = createRoom(adminToken, "canal-dlfisico", "CHANNEL");
        String attachmentId = upload(adminToken, roomId, "sumido.txt", "text/plain", CONTEUDO);

        Attachment attachment = attachmentRepository.findById(UUID.fromString(attachmentId)).orElseThrow();
        Path physical = Paths.get("target/test-uploads").toAbsolutePath().normalize()
                .resolve(attachment.getStoragePath());
        Files.deleteIfExists(physical);
        assertThat(Files.exists(physical)).isFalse();

        mockMvc.perform(get("/api/v1/files/{id}", attachmentId)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("FILE_NOT_FOUND"));
    }

    @Test
    void nomeMaliciosoNaoAfetaArmazenamento() throws Exception {
        String roomId = createRoom(adminToken, "canal-mal", "CHANNEL");
        String attachmentId = upload(adminToken, roomId, "../../../etc/passwd", "text/plain", CONTEUDO);

        Attachment attachment = attachmentRepository.findById(UUID.fromString(attachmentId)).orElseThrow();
        assertThat(attachment.getStoragePath()).matches("\\d{4}/\\d{2}/[0-9a-f-]{36}");
        assertThat(attachment.getStoragePath()).doesNotContain("etc");

        Path root = Paths.get("target/test-uploads").toAbsolutePath().normalize();
        Path physical = root.resolve(attachment.getStoragePath()).normalize();
        assertThat(physical.startsWith(root)).isTrue();
        assertThat(Files.isRegularFile(physical)).isTrue();

        mockMvc.perform(get("/api/v1/files/{id}", attachmentId)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("passwd")))
                .andExpect(content().bytes(CONTEUDO));
    }

    @Test
    void uploadRoomReadOnlyBloqueiaComum() throws Exception {
        String roomId = createRoom(adminToken, "canal-rof", "CHANNEL");
        String memberId = createUser("ro-f-arquivo");
        addMember(adminToken, roomId, memberId);
        String memberToken = login("ro-f-arquivo", PASSWORD);
        setReadOnly(roomId, true);

        mockMvc.perform(multipart("/api/v1/rooms/{id}/files", roomId)
                        .file(new MockMultipartFile("file", "a.txt", "text/plain", CONTEUDO))
                        .header("Authorization", "Bearer " + memberToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("ROOM_READ_ONLY"));
    }

    @Test
    void uploadRoomReadOnlyAdminPermite() throws Exception {
        String roomId = createRoom(adminToken, "canal-rofadm", "CHANNEL");
        setReadOnly(roomId, true);

        mockMvc.perform(multipart("/api/v1/rooms/{id}/files", roomId)
                        .file(new MockMultipartFile("file", "admin.txt", "text/plain", CONTEUDO))
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attachment.originalName").value("admin.txt"));
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

    private void setReadOnly(String roomId, boolean readOnly) {
        Room room = roomRepository.findById(UUID.fromString(roomId)).orElseThrow();
        room.setReadOnly(readOnly);
        roomRepository.save(room);
    }

    private String upload(String token, String roomId, String name, String mimeType, byte[] content) throws Exception {
        MvcResult result = mockMvc.perform(multipart("/api/v1/rooms/{id}/files", roomId)
                        .file(new MockMultipartFile("file", name, mimeType, content))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.path("data").path("attachment").path("id").asText();
    }
}
