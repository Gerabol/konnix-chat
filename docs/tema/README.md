# Konnix System UI

Referência estática para criar sistemas administrativos com a mesma linguagem do Konnix Chat.

Esta pasta é um **design system / UI kit**, não uma skill. Uma skill seria instrução para um agente; aqui estão tokens, componentes e composições visuais que podem ser portados para React, Vue ou outra aplicação.

## Páginas

- `index.html`: catálogo geral, tokens e seleção de tema.
- `dashboard.html`: dashboard operacional no shell do Konnix.
- `componentes.html`: índice dos componentes equivalentes aos grupos comuns do TailAdmin.
- `elementos.html`, `formularios.html`, `tabelas.html` e `graficos.html`: páginas independentes para cada grupo, sem navegação por âncoras ou scroll automático.
- `login.html`: autenticação seguindo a tela real do Konnix Chat.
- `tema.css`: tokens e componentes compartilhados.
- `tema.js`: seleção, preview e persistência dos temas.

O menu lateral e a barra superior ficam fixos. A navegação lateral é normalizada pelo `tema.js`, para que todas as páginas tenham exatamente a mesma estrutura.

## Identidade

Os tokens foram derivados de `frontend/src/index.css`: Roboto, `--konnix-primary`, `--konnix-accent`, `--konnix-bg`, `--konnix-surface`, `--konnix-ink`, `--konnix-ink-soft`, `--konnix-border` e as variações `dark`, `black-gray`, `pink`, `green`, `red`, `*-black` e `*-strong`.

Abra `index.html` diretamente no navegador. Não há dependências externas. Os caminhos de fonte e logo apontam para os ativos existentes em `frontend/public`.

## Portabilidade

Copie `tema.css` e `tema.js`, ajuste os caminhos dos ativos e preserve os nomes dos tokens. Em uma aplicação real, transforme os blocos `.kx-*` em componentes e mantenha a seleção de tema ligada à preferência do usuário.
