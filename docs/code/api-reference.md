# Referência da API REST & WebSocket: Konnix Chat

A API REST do **Konnix Chat** adota arquitetura RESTful com autenticação baseada em tokens de sessão opacos transmitidos via cabeçalho `Authorization: Bearer <token_opaco>`.

---

## 1. Padrão Uniforme de Envelope JSON

Todas as respostas REST da plataforma seguem rigorosamente a estrutura de envelope:

### 1.1. Resposta de Sucesso
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "displayName": "Geral",
    "type": "CHANNEL"
  }
}
```

### 1.2. Resposta de Erro
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "O campo 'displayName' é obrigatório e deve ter entre 1 e 100 caracteres."
  }
}
```

---

## 2. Códigos de Erro Padronizados

| Código de Erro | Status HTTP | Significado |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 Unauthorized | Usuário ou senha incorretos. |
| `UNAUTHORIZED` | 401 Unauthorized | Token de sessão ausente, inválido ou expirado. |
| `PASSWORD_CHANGE_REQUIRED` | 403 Forbidden | A conta exige troca imediata de senha antes de acessar outros recursos. |
| `FORBIDDEN` | 403 Forbidden | Usuário autenticado não possui permissão para o recurso solicitado. |
| `ACCOUNT_READ_ONLY` | 403 Forbidden | Conta em modo somente-leitura (ações de escrita bloqueadas). |
| `ROOM_READ_ONLY` | 403 Forbidden | Canal configurado como somente-leitura para usuários não administradores. |
| `LAST_ADMIN` | 400 Bad Request | Operação rejeitada para proteger o último administrador ativo do sistema. |
| `NOT_FOUND` | 404 Not Found | Recurso (usuário, sala, mensagem, arquivo, enquete) não encontrado. |
| `TOO_MANY_ATTEMPTS` | 429 Too Many Requests | Bloqueio temporário por excesso de tentativas de login (máx 5 em 15min). |
| `FILE_TOO_LARGE` | 413 Payload Too Large | Arquivo enviado excede o limite máximo permitido pela instância. |
| `VALIDATION_ERROR` | 400 Bad Request | Dados de entrada violam as anotações Jakarta Bean Validation do DTO. |

---

## 3. Resumo dos Principais Módulos de Endpoints

### 3.1. Autenticação e Perfil (`/api/v1/auth`)
- `POST /login`: Autentica com `username` e `password`, retornando o token de sessão `knx_...`.
- `POST /logout`: Revoga a sessão ativa no banco de dados.
- `GET /me`: Retorna os dados do usuário autenticado, papéis e permissões.
- `PATCH /profile`: Atualiza dados cadastrais próprios (nome, e-mail).
- `PATCH /preferences`: Atualiza preferências visuais (tema ativo).
- `POST /change-required-password`: Define nova senha para contas com troca obrigatória pendente.

### 3.2. Salas e Canais (`/api/v1/rooms`)
- `GET /`: Lista as salas do usuário com contador de mensagens não lidas.
- `POST /`: Cria um novo canal público ou grupo privado.
- `GET /{id}`: Detalhes da sala e lista de membros.
- `GET /{id}/messages`: Histórico paginado por cursor (`?before=<msgId>&limit=50`).
- `POST /{id}/messages`: Envia nova mensagem de texto ou inicia thread.
- `POST /{id}/files`: Upload multipart de anexos.
- `POST /{id}/read`: Marca todas as mensagens da sala como lidas.

### 3.3. Mensagens (`/api/v1/messages`)
- `PATCH /{id}`: Edita o texto de uma mensagem própria.
- `DELETE /{id}`: Exclusão lógica (*soft delete*) de mensagem própria.
- `POST /{id}/reactions`: Adiciona ou remove reação de emoji (`{ emoji: "👍" }`).

#### Formato da resposta `Message` (campos relevantes)
As respostas de mensagem (`GET /{id}/messages`, `POST /{id}/messages`, eventos WebSocket) incluem os seguintes campos além dos dados básicos:
- `attachment`: metadados do anexo (`id`, `originalName`, `mimeType`, `size`) — `null` quando não há.
- `reactions`: lista de reações (`emoji`, `userId`, `username`).
- `roles`: lista de tags do autor, podendo conter `"OWNER"` (proprietário do grupo/canal na sala) e `"ADMIN"` (papel global de administrador). Pode ser uma lista vazia `[]`.

### 3.4. Administração (`/api/v1/admin`) — Requer papel `ADMIN`
- `GET|POST|PUT /users`: Gestão completa de usuários, papéis e status.
- `GET /audit`: Consulta de logs de auditoria com filtros avançados.
- `GET /monitoring/metrics`: Métricas de armazenamento, conexões e uso do banco de dados.
- `GET|POST|DELETE /api-tokens`: Gestão de tokens de integração de longa duração.
