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

## 3. Catálogo de Endpoints REST

### 3.1. Autenticação, Presença e Preferências (`/api/v1/auth`)
- `POST /api/v1/auth/login`: Autentica credenciais e retorna `{ token, user }`.
- `POST /api/v1/auth/logout`: Revoga a sessão ativa no banco de dados.
- `GET /api/v1/auth/me`: Retorna os dados completos do usuário autenticado.
- `PATCH /api/v1/auth/profile`: Atualiza dados cadastrais próprios (`name`, `email`).
- `PATCH /api/v1/auth/preferences`: Atualiza o tema visual ativo (`theme`).
- `POST /api/v1/auth/presence`: Atualiza status de presença (`online`, `away`, `busy`, `mission`, `vacation`, `offline`).
- `POST /api/v1/auth/change-required-password`: Define nova senha para contas com troca obrigatória pendente.
- `PUT /api/v1/auth/avatar`: Upload multipart do avatar próprio.

### 3.2. Diretório e Perfis de Usuários
- `GET /api/v1/users/directory?q={termo}`: Busca usuários para iniciar conversas diretas.
- `GET /api/v1/profiles/users/{userId}`: Perfil público de um usuário.
- `GET /api/v1/profiles/users/{userId}/common-rooms`: Lista de salas e canais compartilhados entre o usuário atual e o parceiro.
- `GET /api/v1/users/{userId}/avatar`: Download da imagem de avatar do usuário.

### 3.3. Salas, Canais e Conversas Diretas (`/api/v1/rooms` e `/api/v1/direct-messages`)
- `GET /api/v1/rooms`: Lista todas as salas do usuário com contadores de não lidas e favoritos.
- `POST /api/v1/rooms`: Cria novo canal (`CHANNEL`) ou grupo privado (`PRIVATE_GROUP`).
- `GET /api/v1/rooms/{id}`: Detalhes da sala e lista de membros ativos.
- `PATCH /api/v1/rooms/{id}`: Atualiza o nome da sala.
- `POST /api/v1/rooms/{id}/favorite`: Alterna o status de favorito da sala.
- `POST /api/v1/direct-messages`: Inicia ou recupera uma conversa direta 1:1 com outro usuário.
- `GET /api/v1/rooms/{id}/members`: Lista membros da sala com seus papéis locais (`OWNER`, `MEMBER`).
- `POST /api/v1/rooms/{id}/members`: Adiciona usuário à sala.
- `DELETE /api/v1/rooms/{id}/members/{userId}`: Remove usuário da sala.
- `PUT /api/v1/rooms/{roomId}/avatar`: Upload do avatar personalizado da sala.

### 3.4. Mensagens, Histórico e Threads
- `GET /api/v1/rooms/{id}/messages?limit=50&before={msgId}`: Histórico paginado por cursor.
- `GET /api/v1/rooms/{id}/messages/search?q={termo}`: Busca textual de mensagens na sala.
- `POST /api/v1/rooms/{id}/messages`: Envia mensagem de texto, resposta em thread (`parentMessageId`) ou mensagem encaminhada (`forwardedMessageId`).
- `PATCH /api/v1/messages/{id}`: Edita o conteúdo de uma mensagem própria.
- `DELETE /api/v1/messages/{id}`: Exclusão lógica (*soft delete*) de mensagem própria.

### 3.5. Mensagens Fixadas (Pin)
- `POST /api/v1/rooms/{id}/pin/{messageId}`: Fixa uma mensagem de destaque na sala.
- `DELETE /api/v1/rooms/{id}/pin`: Remove a fixação da mensagem na sala.

### 3.6. Enquetes Interativas (Polls)
- `POST /api/v1/rooms/{id}/polls`: Cria uma enquete na sala com pergunta, opções e configuração de voto único/múltiplo.
- `POST /api/v1/polls/{id}/votes`: Registra o voto do usuário em uma opção da enquete.

### 3.7. Reações com Emoji
- `POST /api/v1/messages/{id}/reactions`: Adiciona ou remove reação com emoji (`{ "emoji": "👍" }`).

### 3.8. Arquivos e Anexos
- `POST /api/v1/rooms/{id}/files`: Upload multipart de arquivos com mensagem opcional associada.
- `GET /api/v1/rooms/{id}/files`: Lista todos os arquivos compartilhados na sala.
- `GET /api/v1/files/{id}`: Download autenticado do arquivo com headers de streaming e `Content-Disposition`.

### 3.9. Recibos de Leitura e Notificações Push
- `POST /api/v1/rooms/{id}/read`: Marca todas as mensagens da sala como lidas.
- `GET /api/v1/settings/read-receipts`: Consulta preferência de emissão de recibos de leitura.
- `PUT /api/v1/settings/read-receipts`: Ativa ou desativa recibos de leitura próprios.
- `GET /api/v1/push/public-key`: Retorna a chave pública VAPID para registro no navegador.
- `POST /api/v1/push/subscribe`: Registra uma nova assinatura de Web Push.
- `DELETE /api/v1/push/unsubscribe`: Cancela assinatura de Web Push.

### 3.10. Painel Administrativo (`/api/v1/admin`) — Requer papel `ADMIN`
- `GET /api/v1/admin/users?page=0&size=25&q=`: Listagem paginada de usuários com filtros.
- `PATCH /api/v1/admin/users/{id}/roles`: Atualiza os papéis globais (`ADMIN`, `USER`, `BOT`).
- `PATCH /api/v1/admin/users/{id}/status`: Atualiza o status da conta (`ACTIVE`, `READ_ONLY`, `DISABLED`).
- `POST /api/v1/admin/users/{id}/activate`: Ativação rápida da conta.
- `POST /api/v1/admin/users/{id}/deactivate`: Desativação rápida da conta.
- `GET /api/v1/admin/rooms`: Listagem e moderação de todas as salas.
- `PATCH /api/v1/admin/rooms/{id}`: Atualiza status da sala (nome, somente-leitura).
- `GET /api/v1/admin/audit?page=0&size=25&user=&action=&resource=&from=&to=`: Trilha de auditoria detalhada.
- `GET /api/v1/admin/audit/options`: Lista de ações, recursos e usuários disponíveis para filtros de auditoria.
- `GET /api/v1/admin/monitoring/metrics`: Métricas de armazenamento em disco, banco PostgreSQL e usuários ativos.
- `GET /api/v1/admin/api-tokens`: Lista tokens de integração de longa duração.
- `POST /api/v1/admin/api-tokens`: Cria novo token de integração com prazo de expiração.
- `DELETE /api/v1/admin/api-tokens/{id}`: Revoga token de integração.
- `GET /api/v1/admin/settings`: Consulta configurações gerais do sistema (`AppSettings`).
- `PUT /api/v1/admin/settings`: Atualiza nome do sistema e limite de upload.

### 3.11. Diagnóstico e API Pública
- `GET /api/public/v1/info` ou `GET /api/public/server-info`: Retorna dados públicos da instância (`product`, `version`, `serverName`).

---

## 4. Protocolo WebSocket em Tempo Real (`/ws`)

### 4.1. Conexão e Handshake
```text
GET /ws?token=knx_session_token_here
Connection: Upgrade
Upgrade: websocket
```

### 4.2. Eventos Inbound (Cliente -> Servidor)
```json
{
  "type": "chat.typing",
  "roomId": "123e4567-e89b-12d3-a456-426614174000",
  "isTyping": true
}
```

### 4.3. Eventos Outbound (Servidor -> Clientes)
- `message.created`: Payload completo de nova mensagem.
- `message.updated`: Mensagem alterada após edição.
- `message.deleted`: Notificação de mensagem excluída.
- `message.reaction`: Atualização de contagem/usuários em reação de emoji.
- `message.read`: Recibo de leitura entregue ao autor da mensagem.
- `room.pinned_message`: Atualização de mensagem fixada na sala.
- `room.added` / `room.removed`: Atualização na lista de salas do usuário.
- `room.updated`: Metadados da sala atualizados.
- `room.favorite.updated`: Atualização de favorito para o usuário.
- `presence.updated`: Notificação global de mudança de status de presença.
- `chat.typing`: Notificação de digitação entregue aos membros da sala.
