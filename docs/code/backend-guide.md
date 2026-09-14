# Guia de Desenvolvimento Backend: Konnix Chat

O backend do **Konnix Chat** é construído em **Java 21** e **Spring Boot 3.5.3**, utilizando banco de dados relacional **PostgreSQL 16** e migrações versionadas com **Flyway**.

---

## 1. Estrutura Real de Pacotes

O pacote raiz é `br.gov.pb.cge.konnix`, organizado com separação estrita de responsabilidades:

```text
backend/src/main/java/br/gov/pb/cge/konnix/
├── api/                    # Camada de Entrada REST (Controllers, DTOs e Exceptions)
│   ├── admin/              # Endpoints administrativos (/api/v1/admin/*) e DTOs de gestão
│   ├── auth/               # Autenticação, sessão, perfil próprio, preferências e presença
│   ├── avatar/             # Upload e download de avatares de usuários e salas
│   ├── common/             # Envelope uniforme de API (ApiResponse, ApiErrorResponse)
│   ├── dto/                # DTOs de login e resposta de autenticação
│   ├── exception/          # Exceções de domínio e GlobalExceptionHandler (@ControllerAdvice)
│   ├── file/               # Download seguro e streaming de arquivos (/api/v1/files/*)
│   ├── message/            # Gestão de mensagens, histórico paginado, reações e recibos
│   ├── poll/               # Criação e votação em enquetes interativas (/api/v1/polls/*)
│   ├── publicapi/          # Endpoints públicos de diagnóstico (/api/public/v1/info)
│   ├── push/               # Assinatura e cancelamento de Web Push (VAPID)
│   ├── room/               # Salas públicas, grupos privados e conversas diretas (/api/v1/rooms/*)
│   ├── settings/           # Configurações de preferências do sistema (ex: recibos de leitura)
│   ├── support/            # Relatórios e respostas de suporte a usuários
│   └── user/               # Diretório corporativo e perfis de usuários
├── domain/                 # Camada de Domínio e Persistência (Entidades JPA e Repositórios)
│   ├── attachment/         # Entidade Attachment e AttachmentRepository
│   ├── audit/              # Entidade AuditLog e AuditLogRepository
│   ├── message/            # Entidades Message, MessageReaction, MessageRead e Repositórios
│   ├── poll/               # Entidades Poll, PollOption, PollVote e Repositórios
│   ├── push/               # Entidade PushSubscription e PushSubscriptionRepository
│   ├── room/               # Entidades Room, RoomMember e Repositórios JPA
│   ├── session/            # Entidade Session e SessionRepository (token SHA-256)
│   ├── settings/           # Entidade AppSettings e AppSettingsRepository
│   └── user/               # Entidade User, UserRepository e Enums (AccountStatus, Role)
├── service/                # Regras de Negócio Transacionais (@Service / @Transactional)
├── storage/                # Persistência de Arquivos em Disco e Sanitização de UUIDs
├── websocket/              # WebSocket Handlers, Session Registry e ChatEventPublisher
├── security/               # Filtro de Tokens Opacos, Hash Argon2 e Spring Security Config
├── push/                   # Serviço de Notificações Web Push com criptografia VAPID
├── config/                 # Configurações do Spring (Async, Jackson, WebMvc, CORS)
└── bootstrap/              # Inicialização e carga inicial de dados (semeadura de papéis e admin)
```

---

## 2. Padrões de Desenvolvimento Backend

### 2.1. Injeção de Dependências e Imutabilidade
- Utilize construtores explícitos ou `@RequiredArgsConstructor` do Lombok em campos declarados como `final`.
- **Proibido**: Usar injeção por campo com `@Autowired`.

### 2.2. DTOs Imutáveis com Records e Jakarta Validation
Todas as requisições de entrada devem ser validadas com anotações padrão do Jakarta:
```java
public record CreatePollRequest(
    @NotBlank(message = "A pergunta da enquete é obrigatória")
    @Size(min = 3, max = 255, message = "A pergunta deve ter entre 3 e 255 caracteres")
    String question,

    @NotNull(message = "As opções são obrigatórias")
    @Size(min = 2, max = 10, message = "A enquete deve ter entre 2 e 10 opções")
    List<@NotBlank(message = "O texto da opção não pode estar em branco") String> options,

    boolean allowMultiple
) {}
```

### 2.3. Controle de Acesso e Autorização Granular
- Proteja métodos administrativos com `@PreAuthorize("hasRole('ADMIN')")`.
- Valide sempre que o usuário autenticado é membro ativo da sala antes de permitir leitura, envio de mensagens, downloads ou votação em enquetes.

### 2.4. Resposta e Tratamento de Exceções
- Utilize exceções de domínio mapeadas (`ApiException` / `ApiExceptions`) para emitir o código semântico e HTTP status correspondentes:
```java
if (room.isReadOnly() && !isAdmin(currentUser)) {
    throw ApiExceptions.roomReadOnly();
}
```
- O `GlobalExceptionHandler` interceptará e formatará a resposta no envelope padrão:
```json
{
  "success": false,
  "error": {
    "code": "ROOM_READ_ONLY",
    "message": "Esta sala está em modo somente leitura."
  }
}
```

### 2.5. Trilha de Auditoria Isolada
- Toda ação administrativa ou crítica deve registrar log de auditoria executando em transação independente (`Propagation.REQUIRES_NEW`), garantindo que o log seja persistido mesmo se a operação de negócio falhar ou sofrer rollback.

### 2.6. Migrações de Banco com Flyway
- Localização: `backend/src/main/resources/db/migration/`
- Nomenclatura: `V<N>__<descricao_snake_case>.sql` (ex: `V21__add_pinned_message_to_rooms.sql`).
- **Regra**: Nunca altere migrações já executadas. Crie um novo arquivo sequencial para qualquer evolução estrutural ou de dados.

---

## 3. Testes Automatizados com Testcontainers

A suíte de testes de integração roda em ambiente idêntico ao de produção utilizando contêineres Docker gerenciados pelo **Testcontainers (PostgreSQL 16)**:

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@Testcontainers
class MessageControllerIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void shouldCreateAndRetrieveMessageSuccessfully() throws Exception {
        // Arrange
        String token = authenticateUser("testuser");
        UUID roomId = createTestRoom("Geral");
        var request = new CreateMessageRequest("Olá mundo!", null, null);

        // Act & Assert
        mockMvc.perform(post("/api/v1/rooms/" + roomId + "/messages")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content").value("Olá mundo!"));
    }
}
```

### Comandos de Execução
```bash
cd backend
mvn clean test        # Executa toda a suíte de testes unitários e de integração
mvn clean compile     # Valida compilação e tipagem do código Java
```
