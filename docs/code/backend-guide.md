# Guia de Desenvolvimento Backend: Konnix Chat

O backend do **Konnix Chat** é construído em **Java 21** e **Spring Boot 3.5.3**, utilizando banco de dados **PostgreSQL 16** e migrações versionadas com **Flyway**.

---

## 1. Estrutura de Pacotes

O pacote raiz é `br.gov.pb.cge.konnix`, organizado por responsabilidade:

```text
backend/src/main/java/br/gov/pb/cge/konnix/
├── config/             # Configurações de segurança, WebSocket, CORS e beans de infraestrutura
├── controller/         # Controllers REST anotados com @RestController e @PreAuthorize
├── dto/                # Records e classes imutáveis de entrada/saída com Jakarta Validation
├── entity/             # Entidades JPA mapeadas para as tabelas PostgreSQL
├── exception/          # Exceções de domínio e @ControllerAdvice global
├── repository/         # Interfaces Spring Data JPA com queries parametrizadas
├── security/           # Filtro de autenticação de tokens opacos e hash Argon2
├── service/            # Regras de negócio e transações (@Transactional)
└── websocket/          # Handlers e gerenciadores de sessões WebSocket
```

---

## 2. Padrões de Desenvolvimento Backend

### 2.1. Injeção de Dependências e Imutabilidade
- Utilize sempre injeção por construtor (preferencialmente usando construtores explícitos ou `@RequiredArgsConstructor` com campos `final`).
- Evite anotações `@Autowired` diretamente em atributos de classe.

### 2.2. Validação de Entrada
- Todas as classes de DTO de entrada devem utilizar anotações Jakarta Bean Validation:
  ```java
  public record CreateRoomRequest(
      @NotBlank(message = "O nome da sala é obrigatório")
      @Size(min = 1, max = 100, message = "O nome deve ter entre 1 e 100 caracteres")
      String displayName,

      @NotNull(message = "O tipo da sala é obrigatório")
      RoomType type,

      boolean readOnly
  ) {}
  ```

### 2.3. Migrações de Banco de Dados com Flyway
- Todos os scripts SQL ficam em `backend/src/main/resources/db/migration`.
- Siga a convenção `V<versão>__<descricao_em_snake_case>.sql` (ex: `V21__add_user_notification_preferences.sql`).
- **Atenção**: Nunca altere arquivos de migração já executados em produção. Sempre crie uma nova versão para evoluir o esquema.

---

## 3. Testes Automatizados com Testcontainers

A suíte de testes de integração roda em ambiente idêntico ao de produção utilizando contêineres gerenciados pelo **Testcontainers**:

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@Testcontainers
class RoomIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }
}
```

### Como executar os testes
```bash
cd backend
mvn test
```
*(Certifique-se de que o daemon do Docker esteja em execução na máquina de desenvolvimento).*
