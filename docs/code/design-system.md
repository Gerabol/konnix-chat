# Design System & UI Kit: Konnix System UI

O **Konnix System UI** (`docs/tema/`) é o Design System oficial do ecossistema Konnix. Ele padroniza a linguagem visual, tokens CSS, paletas de cores, tipografia e catálogo de componentes para o Konnix Chat, painéis administrativos, cliente desktop e qualquer nova funcionalidade da plataforma.

---

## 1. Princípios e Identidade Visual

- **Tipografia**: Família `Roboto` (`Roboto Latin`, pesos 100 a 900) com fallback `Arial, sans-serif`.
- **Formas e Bordas**:
  - Raio padrão de elementos (`--r`): `10px`
  - Raio grande para cards e modais (`--rl`): `16px`
  - Bordas sutis: `1px solid var(--konnix-border)`
- **Sombra e Elevação**:
  - Padrão (`--konnix-shadow`): `0 10px 30px rgba(32,34,48,.12)`
  - Variações Black (`*-black`): `0 10px 30px rgba(0,0,0,.38)`
- **Estrutura de Layout Fixo**:
  - Largura da Barra Lateral (`--sidebar-w`): `284px`
  - Altura da Topbar: `61px` (desktop) / `54px` (mobile)

---

## 2. Matriz dos 13 Temas Visuais

A aplicação do tema é feita via atributo `data-theme` na tag raiz `<html>` (`document.documentElement.dataset.theme`):

| ID do Tema (`data-theme`) | Nome de Exibição | Cores Principais (Background / Surface / Primary / Accent) | Categoria |
|---|---|---|---|
| `default` (vazio) | **Padrão** | `#f7f8fc` / `#ffffff` / `#5b4cf0` / `#22c7d6` | Claro |
| `dark` | **Dark clássico** | `#121212` / `#23232a` / `#7c5cff` / `#8b72ff` | Escuro |
| `black-gray` | **Cinza e preto** | `#0f1115` / `#1e232b` / `#4f7cff` / `#5a7fff` | Escuro |
| `pink` | **Rosa** | `#fff8fb` / `#ffffff` / `#e84d8a` / `#f0629b` | Claro |
| `green` | **Verde** | `#f5fbf7` / `#ffffff` / `#1fa463` / `#27b56e` | Claro |
| `red` | **Vermelho** | `#fff7f7` / `#ffffff` / `#d94141` / `#e15353` | Claro |
| `green-black` | **Verde Black** | `#0f1411` / `#19221d` / `#25bd70` / `#33d781` | Black |
| `pink-black` | **Rosa Black** | `#140f13` / `#241923` / `#f05a9d` / `#ff78b4` | Black |
| `red-black` | **Vermelho Black** | `#150e0e` / `#251818` / `#f05b5b` / `#ff7777` | Black |
| `default-strong` | **Padrão Forte** | `#f7f8fc` / `#5b4cf0` (sidebar primária) / `#7669f5` / `#ffffff` | Strong |
| `green-strong` | **Verde Forte** | `#f5fbf7` / `#188a53` (sidebar primária) / `#35b873` / `#ffffff` | Strong |
| `pink-strong` | **Rosa Forte** | `#fff8fb` / `#d93e7c` (sidebar primária) / `#ee6a9d` / `#ffffff` | Strong |
| `red-strong` | **Vermelho Forte** | `#fff7f7` / `#c83232` (sidebar primária) / `#e85c5c` / `#ffffff` | Strong |

---

## 3. Tokens Semânticos CSS (`docs/tema/tema.css`)

Todas as novas telas, componentes e estilos devem consumir exclusivamente as variáveis CSS do sistema:

```css
:root {
  --konnix-primary: #5b4cf0;        /* Cor primária da marca */
  --konnix-primary-hover: #4b3cd8;  /* Estado hover de elementos primários */
  --konnix-primary-deep: #3526ab;   /* Variante escura para contrastes */
  --konnix-button: #5b4cf0;         /* Cor padrão de botões de ação */
  --konnix-accent: #22c7d6;         /* Cor de destaque e gradientes */
  --konnix-bg: #f7f8fc;             /* Fundo da aplicação */
  --konnix-surface: #ffffff;        /* Fundo de cards, modais e containers */
  --konnix-ink: #202230;            /* Cor do texto principal */
  --konnix-ink-soft: #5f6478;       /* Cor de rótulos, kickers e textos secundários */
  --konnix-border: #e3e6f0;         /* Cor de bordas e divisores */
  --konnix-danger: #e5484d;         /* Cor semântica de erro/destruição */
  --konnix-ok: #30a46c;             /* Cor semântica de sucesso */
  --konnix-warn: #f5a623;           /* Cor semântica de alerta */
  --konnix-sidebar: var(--konnix-surface); /* Fundo da barra lateral */
  --konnix-shadow: 0 10px 30px rgba(32,34,48,.12);
  --sidebar-w: 284px;
  --r: 10px;
  --rl: 16px;
}
```

---

## 4. Catálogo de Classes e Componentes (`.kx-*`)

### 4.1. Estrutura de Layout e Navegação
- `.kx-app`: Container raiz com layout flexível.
- `.kx-sidebar`: Barra lateral fixa (`width: var(--sidebar-w)`).
- `.kx-brand`: Área de logo (`.kx-logo`) e nome (`.kx-wordmark`).
- `.kx-sidebar-search`: Campo de busca rápida da barra lateral.
- `.kx-nav`: Navegação principal com seções (`.kx-nav-section`) e links ativos (`.kx-nav a.active`).
- `.kx-sidebar-user`: Rodapé da barra lateral com avatar, status de presença e perfil.
- `.kx-main`: Container principal com compensação de margem esquerda (`margin-left: var(--sidebar-w)`).
- `.kx-topbar`: Barra superior fixa com título da sala, breadcrumb e botões de ação rápida.
- `.kx-page`: Área de conteúdo (`max-width: 1500px`, padding `24px`).
- `.kx-page-heading`: Cabeçalho da página com título (`h1`), subtítulo e kicker (`.kx-kicker`).

### 4.2. Componentes de Chat & Mensageria
- `.kx-pinned-banner`: Barra destacada de mensagem fixada no topo da timeline.
- `.kx-typing-indicator`: Indicador discreto e animado de digitação em tempo real.
- `.kx-poll-card`: Container de enquete interativa com barras de progresso percentual e lista de votantes.
- `.kx-reaction-pill`: Pílula de reação com emoji, contador e destaque quando o usuário ativo reagiu.
- `.kx-read-receipt`: Marcadores de entrega (✓) e leitura (✓✓).
- `.kx-audio-player`: Player customizado de áudio com seletor de velocidade e barra de reprodução.

### 4.3. Status de Presença e Tonalidades
- `online`: Indicador verde (`--konnix-ok`).
- `away`: Indicador amarelo/laranja (`--konnix-warn`).
- `busy`: Indicador vermelho (`--konnix-danger`).
- `mission`: Indicador azul (`--konnix-accent`).
- `vacation`: Indicador roxo (`--konnix-primary`).
- `offline`: Indicador cinza translúcido.

### 4.4. Botões e Controles de Ação
- `.kx-button`: Botão padrão (altura mínima `38px`, raio `9px`, tipografia bold).
- `.kx-button-primary`: Ação principal com fundo `--konnix-button`.
- `.kx-button-secondary`: Ação secundária com borda `--konnix-border` e fundo `--konnix-surface`.
- `.kx-button-danger`: Ações destrutivas com fundo `--konnix-danger`.
- `.kx-icon-btn`: Botão quadrado (36x36px) para ícones de cabeçalho e fechamento de modais.

### 4.5. Cards, Métricas e Tabelas
- `.kx-card`: Container de superfície com sombra e raio de 16px.
- `.kx-card-head` / `.kx-card-body`: Estrutura interna com espaçamento uniforme.
- `.kx-stat`: Card de métrica/KPI com efeito circular de marca d'água.
- `.kx-table-wrap` / `.kx-table`: Tabela responsiva com rolagem horizontal e hover suave.
- `.kx-user-cell` / `.kx-mini-avatar`: Célula para exibição de usuário com foto e nome.

### 4.6. Formulários, Inputs e Alertas
- `.kx-form`: Grid de formulário com espaçamento de 14px.
- `.kx-input`: Campo de texto com foco estilizado primário.
- `.kx-form-hint`: Texto de apoio em `--konnix-ink-soft`.
- `.kx-alert-info`, `.kx-alert-ok`, `.kx-alert-danger`: Blocos de feedback visual semântico.

---

## 5. Regras Obrigatórias para Novas Telas e Componentes

1. **Zero Cores Hardcoded**: Todo novo componente React ou folha de estilo deve referenciar exclusivamente as variáveis `--konnix-*`.
2. **Reuso de Componentes `.kx-*`**: Ao implementar painéis administrativos, relatórios, modais ou abas, utilize as classes e proporções do `Konnix System UI`.
3. **Persistência de Tema**: Toda tela deve responder instantaneamente à mudança de tema e respeitar a preferência salva no cookie `konnix_theme` e no perfil do backend.
4. **Responsividade Mobile-First**: Respeitar os breakpoints em `950px` (ajuste de grids) e `680px` (sidebar recolhida e layout fluído com toque mínimo de 44x44px).
