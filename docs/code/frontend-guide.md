# Guia de Desenvolvimento Frontend: Konnix Chat

O frontend do **Konnix Chat** é desenvolvido em **React 19**, **TypeScript** estrito e empacotado com **Vite 6**, com suporte a Progressive Web App (**PWA**) e aplicativo nativo desktop via **Tauri 2.x**.

---

## 1. Estrutura Modular do Projeto Frontend

```text
frontend/
├── public/
│   ├── manifest.webmanifest   # Configuração de instalação do PWA
│   ├── sw.js                  # Service Worker (Cache offline & Push handler)
│   └── icons/                 # Favicons e logotipos nos temas claro/escuro
├── src/
│   ├── desktop/               # Funcionalidades exclusivas do cliente Desktop Tauri
│   │   └── servers/           # Multi-servidores (Setup, Switcher, Store e Manager)
│   │       ├── ServerSetup.tsx      # Modal de conexão a uma nova instância do Konnix
│   │       ├── ServerSwitcher.tsx   # Barra vertical lateral para alternar servidores
│   │       ├── serverManager.ts     # Validação de servidores (/api/public/server-info)
│   │       └── serverStore.ts       # Persistência de instâncias no localStorage
│   ├── AdminView.tsx          # Painel Administrativo multi-abas (Usuários, Salas, Auditoria, Métricas, Tokens, Configurações)
│   ├── ApiDocsPanel.tsx       # Catálogo interativo da API com cURL e exportação .http
│   ├── App.tsx                # Orquestrador principal do chat, timeline, composer e modais
│   ├── api.ts                 # Cliente HTTP REST, WebSocket manager e tipagens estritas
│   ├── platform.ts            # Bridge de abstração unificada entre Web, PWA e Tauri Desktop
│   ├── passwordValidation.ts  # Regras de complexidade de senha e verificação de primeiro acesso
│   ├── index.css              # Variáveis CSS dos 13 temas, reset e estilos base
│   └── main.tsx               # Ponto de entrada e montagem da aplicação React
├── index.html                 # Shell HTML com hidratação prévia de tema (anti-FOUC)
├── package.json
└── vite.config.ts
```

---

## 2. Camada de Abstração de Plataforma (`platform.ts`)

A interface consome recursos nativos por meio de uma ponte de abstração agnóstica de ambiente:

```typescript
export interface PlatformBridge {
  isDesktop: boolean;
  isPwa: boolean;
  showNotification(title: string, options?: NotificationOptions): Promise<void>;
  saveFile(filename: string, blob: Blob): Promise<void>;
  setAutostart(enabled: boolean): Promise<void>;
}
```

- **Ambiente Web / PWA**: Utiliza Web Notifications API nativa e download via `URL.createObjectURL(blob)`.
- **Ambiente Desktop (Tauri 2.x)**: Invoca `@tauri-apps/plugin-notification`, `@tauri-apps/plugin-dialog` e `@tauri-apps/plugin-fs` para uma integração nativa com o sistema operacional do usuário.

---

## 3. Gestão de Estado e Conexão em Tempo Real (`api.ts`)

### 3.1. Isolamento de Autenticação
- **Web**: Token de sessão armazenado em `sessionStorage`.
- **Desktop**: Token isolado por servidor conectado em `localStorage` sob a chave `konnix.auth-token.<serverId>`.

### 3.2. Ciclo de Vida do WebSocket
- Conexão persistente com reconexão automática resiliente a quedas de rede.
- Suporte a envio de eventos de digitação (`chat.typing`) com *debounce* inteligente.
- Handlers reativos para sincronização de mensagens, enquetes, mensagens fixadas, reações com emoji, recibos de leitura, status de presença e criação/remoção de salas.

---

## 4. Principais Recursos de Interface do Usuário

### 4.1. Composer de Mensagens
- Auto-redimensionamento dinâmico do campo de texto com contador de caracteres (limite de 10.000).
- Suporte a menções `@usuario` com menu de autocompletar.
- Gravação de voz com codificação MP3 no cliente via `lamejs`, visualização de tempo decorrido e cancelamento.
- Criação e votação em enquetes interativas com barras dinâmicas de percentual.
- Seleção de emojis via `@emoji-mart/react`.
- Drag & Drop e suporte a colar mídias da área de transferência (`Ctrl+V`).

### 4.2. Timeline do Chat
- Rolagem inteligente com preservação de posição durante leitura de histórico paginado por cursor (`?before=&limit=`).
- Banner fixo de mensagem destacada (pin) com rolagem imediata ao ponto de fixação.
- Player de áudio com reprodução acelerada (1x, 1.5x, 2x) e barra de progresso interativa.
- Visualizador de imagens em tela cheia com zoom e download direto.
- Ações rápidas flutuantes na mensagem: Responder, Reagir com emoji, Fixar/Desfixar, Editar, Encaminhar e Excluir.

### 4.3. Navegação Lateral e Diretório
- Seções organizadas: Favoritos, Canais Públicos, Grupos Privados e Conversas Diretas (DMs).
- Badges numéricos com contadores de mensagens não lidas por sala.
- Seletor de presença no perfil do usuário (`online`, `away`, `busy`, `mission`, `vacation`, `offline`).
- Modal de perfil do parceiro de DM exibindo "Grupos em comum".

---

## 5. Design System e Sistema de 13 Temas Visuais

- **13 Temas**: `default`, `dark`, `black-gray`, `pink`, `green`, `red`, `green-black`, `pink-black`, `red-black`, `default-strong`, `green-strong`, `pink-strong` e `red-strong`.
- **Prevenção de FOUC**: O arquivo `index.html` executa um script síncrono antes do carregamento do bundle React, lendo o cookie `konnix_theme` e aplicando o atributo `data-theme` na tag `<html>`.
- **Sincronização**: Ao selecionar um novo tema, a alteração é aplicada instantaneamente no DOM, persistida no cookie e salva no backend via `PATCH /api/v1/auth/preferences`.

---

## 6. Comandos e Scripts de Execução

```bash
cd frontend

# Instalação de dependências
npm ci --legacy-peer-deps

# Execução em ambiente de desenvolvimento web (Vite)
npm run dev

# Validação estrita de tipos TypeScript e compilação de produção
npm run build

# Execução em ambiente de desenvolvimento Desktop (Tauri)
npm run desktop:dev

# Geração de executáveis Desktop para distribuição
npm run desktop:build
```
