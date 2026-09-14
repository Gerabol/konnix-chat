# Arquitetura Geral do Sistema: Konnix Chat

O **Konnix Chat** é uma plataforma corporativa moderna para comunicação em tempo real, estruturada com foco em alta disponibilidade, isolamento de dados, conformidade com a LGPD e suporte multiplataforma (Web, PWA e Desktop Nativo via Tauri 2.x).

---

## 1. Visão Arquitetural em Camadas

```mermaid
graph TB
    subgraph Clientes ["Camada de Apresentação (Clientes)"]
        Web[Navegador Web / PWA<br/>React 19 + Vite 6]
        Desktop[App Desktop Nativo Multi-Servidor<br/>Tauri 2.x + React 19]
    end

    subgraph Gateway ["Ponto de Entrada e Proxy"]
        Nginx[Nginx Reverse Proxy / Vite Dev Proxy<br/>Portas 80 / 5173 / 5174 / 5175]
        Tunnel[Cloudflare Tunnel / Named Tunnel<br/>HTTPS Outbound Seguro]
    end

    subgraph BackendApp ["Camada de Aplicação (Spring Boot 3.5.3 / Java 21)"]
        REST[API REST Controllers<br/>/api/v1/* e /api/public/v1/*]
        WS[WebSocket Handler & Session Registry<br/>/ws (Server-Push & Real-time Typing)]
        Sec[Spring Security Filter Chain<br/>Opaque Token Auth & Argon2 Hashing]
        Push[Push Service<br/>Web Push / VAPID Protocol]
        Media[Storage & Media Service<br/>FFmpeg MP3 & Multipart Uploads]
        AdminService[Serviços Administrativos<br/>Auditoria, Métricas, Tokens de Integração]
    end

    subgraph Persistencia ["Camada de Armazenamento e Dados"]
        DB[(PostgreSQL 16<br/>Migrações Flyway V1..V21)]
        FS[Armazenamento Local de Arquivos<br/>/app/uploads/YYYY/MM/UUID]
    end

    Web --> Gateway
    Desktop --> Gateway
    Tunnel --> Gateway
    Gateway --> REST
    Gateway --> WS
    REST --> Sec
    WS --> Sec
    REST --> DB
    REST --> FS
    REST --> Media
    REST --> Push
    REST --> AdminService
    WS --> DB
```

---

## 2. Modelo de Domínio e Principais Entidades

O banco de dados PostgreSQL é gerenciado por migrações versionadas Flyway (V1 a V21):

| Entidade | Tabela | Descrição |
|---|---|---|
| `User` | `users` | Usuário corporativo com credenciais em Argon2, papel global (`ADMIN`, `USER`, `BOT`), status de conta (`ACTIVE`, `READ_ONLY`, `DISABLED`), status de presença (`online`, `away`, `busy`, `mission`, `vacation`, `offline`), tema visual (13 opções) e flags de troca de senha. |
| `AccountStatus` | Enum | Estado operacional da conta: `ACTIVE` (acesso total), `READ_ONLY` (apenas leitura de salas e histórico) ou `DISABLED` (bloqueado para login). |
| `Room` | `rooms` | Sala de conversação. Tipos: `CHANNEL` (canal público), `PRIVATE_GROUP` (grupo privado restrito) e `DIRECT` (conversa direta 1:1). Possui flag `read_only` e referência a `pinned_message_id`. |
| `RoomMember` | `room_members` | Associação N:N entre usuário e sala com papel local (`OWNER` ou `MEMBER`), status ativo e marcação de favorito (`favorite`). |
| `Message` | `messages` | Mensagem enviada em uma sala. Tipos: `USER`, `SYSTEM`, `FILE`, `POLL`. Suporta encadeamento (`parent_message_id`), citação (`quotedMessage`), encaminhamento (`forwarded_from_username`), edição (`edited_at`) e exclusão lógica (*soft delete* com `deleted_at`). |
| `Poll` / `PollOption` / `PollVote` | `polls`, `poll_options`, `poll_votes` | Estrutura de enquetes interativas com pergunta, opções de voto, suporte a voto único ou múltiplo e contabilidade em tempo real de votantes. |
| `MessageReaction` | `message_reactions` | Reações com emojis em mensagens. Limite máximo de 5 emojis distintos por mensagem. |
| `MessageRead` | `message_reads` | Recibos de confirmação de leitura por mensagem e usuário leitor. |
| `Attachment` | `attachments` | Metadados de arquivos anexados (nome original, MIME type, tamanho em bytes, hash SHA-256 e UUID de persistência em disco). |
| `Session` | `sessions` | Sessão ativa persistida como hash SHA-256 do token opaco gerado (`knx_...`). |
| `AuditLog` | `audit_logs` | Trilha de auditoria persistida em transação isolada (`REQUIRES_NEW`), registrando usuário, ação, recurso, ID do recurso e endereço IP. |
| `AppSettings` | `app_settings` | Configurações globais da instância (nome da plataforma e limite máximo de upload de arquivos). |
| `ApiToken` | `api_tokens` | Tokens de integração de longa duração com hash SHA-256, prévia do token, data de expiração e revogação. |
| `PushSubscription` | `push_subscriptions` | Inscrições de navegadores para recebimento de notificações Web Push (VAPID). |

---

## 3. Protocolos de Comunicação

### 3.1. REST API (`/api/v1` e `/api/public/v1`)
- **Autenticação**: Cabeçalho `Authorization: Bearer <token_opaco>`.
- **Formato Uniforme de Resposta**:
  - Sucesso:
    ```json
    {
      "success": true,
      "data": { ... }
    }
    ```
  - Erro padronizado:
    ```json
    {
      "success": false,
      "error": {
        "code": "STRING_CODE",
        "message": "Descrição amigável do erro"
      }
    }
    ```

### 3.2. WebSocket Protocol (`/ws`)
- **Handshake e Autenticação**: Conexão inicial via query param `/ws?token=<token_opaco>`. O interceptor `AuthHandshakeInterceptor` valida o token e armazena o usuário autenticado na sessão.
- **Inbound Frames (Cliente para Servidor)**:
  - `chat.typing`: Informa início ou parada de digitação na sala:
    ```json
    { "type": "chat.typing", "roomId": "UUID", "isTyping": true }
    ```
- **Outbound Server-Push Events (Servidor para Clientes)**:
  - `message.created`: Nova mensagem entregue a todos os membros da sala.
  - `message.updated`: Mensagem editada.
  - `message.deleted`: Exclusão lógica de mensagem.
  - `message.reaction`: Adição ou remoção de emoji em mensagem.
  - `message.read`: Notificação de leitura enviada exclusivamente ao autor da mensagem.
  - `room.pinned_message`: Fixação ou desfixação de mensagem na sala.
  - `room.added` / `room.removed`: Adição ou remoção do usuário de uma sala.
  - `room.updated`: Alteração de nome, descrição ou status da sala.
  - `room.favorite.updated`: Atualização do status de favorito da sala para o usuário.
  - `presence.updated`: Atualização global de presença do usuário (`online`, `away`, `busy`, `mission`, `vacation`, `offline`).
  - `chat.typing`: Notificação de digitação retransmitida para os membros da sala.

---

## 4. Arquitetura Multi-Plataforma (Web, PWA e Desktop)

```mermaid
graph LR
    subgraph UI ["Interface Comum (React 19)"]
        ChatUI[Componentes de Chat, Timeline, Composer, Modais, 13 Temas]
    end

    subgraph Bridge ["Platform Bridge (platform.ts)"]
        PB[API Unificada de Notificações, Armazenamento e Inicialização]
    end

    subgraph WebPwa ["Web / PWA"]
        WebNotify[Web Notifications API]
        BlobDownload[HTML5 Blob Download]
        SessionStorage[sessionStorage]
    end

    subgraph TauriDesktop ["Tauri Desktop (Rust)"]
        TauriNotify[@tauri-apps/plugin-notification]
        TauriDialog[@tauri-apps/plugin-dialog]
        TauriFs[@tauri-apps/plugin-fs]
        TauriAuto[@tauri-apps/plugin-autostart]
        MultiServerStore[serverStore.ts / localStorage isolado por servidor]
    end

    ChatUI --> Bridge
    Bridge --> WebPwa
    Bridge --> TauriDesktop
```

- **Web / PWA**: Utiliza APIs padrão do navegador (`Web Notifications`, `Service Worker` para cache e push, `sessionStorage` para token de sessão).
- **Tauri Desktop**:
  - Gerenciamento de múltiplos servidores (`serverManager.ts`) com troca a quente de instâncias.
  - Armazenamento de credenciais isolado por servidor (`konnix.auth-token.<serverId>`).
  - Plugins nativos do sistema operacional para notificações, salvamento de arquivos em disco e inicialização automática com o sistema operacional (`autostart`).
