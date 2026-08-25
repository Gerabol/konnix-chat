# Guia de Desenvolvimento Frontend: Konnix Chat

O frontend do **Konnix Chat** é desenvolvido em **React 19**, **TypeScript** estrito e empacotado via **Vite 6**, com suporte a Progressive Web App (**PWA**) e aplicativo nativo desktop via **Tauri 2.x**.

---

## 1. Estrutura do Projeto Frontend

```text
frontend/
├── public/
│   ├── manifest.webmanifest   # Configuração de instalação do PWA
│   └── sw.js                  # Service Worker (Cache offline & Push handler)
├── src/
│   ├── desktop/               # Lógica específica do cliente desktop (multi-servidor)
│   │   └── servers/           # Gerenciamento de servidores conectados
│   ├── AdminView.tsx          # Painel administrativo multi-abas
│   ├── ApiDocsPanel.tsx       # Catálogo e documentação interativa da API
│   ├── App.tsx                # Componente principal do chat e orquestração de modais
│   ├── api.ts                 # Cliente HTTP REST e gerenciador de conexão WebSocket
│   ├── platform.ts            # Camada de abstração entre Web, PWA e Tauri Desktop
│   ├── index.css              # Variáveis CSS dos 13 temas e estilos base
│   └── main.tsx               # Ponto de montagem da aplicação React
├── index.html
├── package.json
└── vite.config.ts
```

---

## 2. Camada de Abstração de Plataforma (`platform.ts`)

O módulo `src/platform.ts` detecta o ambiente de execução e expõe uma API unificada para a interface:

```typescript
export interface PlatformBridge {
  isDesktop: boolean;
  isPwa: boolean;
  showNotification(title: string, options?: NotificationOptions): Promise<void>;
  saveFile(filename: string, blob: Blob): Promise<void>;
  setAutostart(enabled: boolean): Promise<void>;
}
```

- **No Navegador / PWA**: Utiliza Web Notifications API e download de Blob tradicional.
- **No Tauri Desktop**: Invoca os plugins `@tauri-apps/plugin-notification`, `@tauri-apps/plugin-dialog` e `@tauri-apps/plugin-fs`.

---

## 3. Gestão de Estado e Conexão WebSocket

O arquivo `src/api.ts` centraliza a comunicação com o backend:

- **Token de Sessão**: Armazenado em `sessionStorage` (web) ou isolado por servidor no `localStorage` (desktop).
- **Conexão WebSocket**:
  - URL dinâmica gerada a partir da base HTTP (`ws://` ou `wss://`).
  - Reconexão automática com intervalo exponencial ou fixo de 3 segundos em caso de queda de rede.
  - Handlers de evento registrados para atualizar reativamente a lista de mensagens, reações, membros e status de presença.

---

## 4. Sistema de 13 Temas Visuais & Design System (`docs/tema/`)

O ecossistema utiliza o **Konnix System UI** (`docs/tema/` e `docs/code/design-system.md`) como design system mestre:
- **Tokens Semânticos**: Uso estrito de `--konnix-primary`, `--konnix-bg`, `--konnix-surface`, `--konnix-ink`, `--konnix-border`, etc.
- **Variações de Tema**: 13 combinações (`default`, `dark`, `black-gray`, `pink`, `green`, `red`, `*-black`, `*-strong`).
- **Prevenção de FOUC**: O cookie `konnix_theme` é lido imediatamente no carregamento inicial do `index.html` antes da montagem do React.
- **Persistência**: Alterações de tema chamam a rota `PATCH /api/v1/auth/preferences` para persistir a escolha no perfil do usuário no banco de dados.
- **Catálogo de Componentes `.kx-*`**: Formulários, tabelas, cards, estatísticas, badges, modais e alertas devem seguir as classes e proporções do `docs/tema/tema.css`.

Consulte o [Guia Completo do Design System](file:///Users/sergioo/Documents/GitHub/konnix-chat/docs/code/design-system.md) para a lista de tokens, classes `.kx-*` e componentes de referência.

---

## 5. Como Executar o Frontend Localmente

```bash
cd frontend
npm ci --legacy-peer-deps
npm run dev
```
Para executar testes de compilação e tipagem:
```bash
npm run build
```
