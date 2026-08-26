# Konnix Chat

Konnix Chat is a corporate communication platform originally created and
developed by Geraldo Valencia.

## License

The Konnix Chat source code is licensed under the Apache License 2.0.

Copyright (c) 2026 Geraldo Valencia.

The Apache License 2.0 permits the source code to be used, studied, copied,
modified, redistributed, used commercially, and incorporated into other
systems, subject to the terms of that license.

The **Konnix Chat** name, logo, visual identity, and associated branding are
not licensed under the Apache License 2.0. Their use is governed separately
by the trademark policy.

See:

- [Apache License 2.0](LICENSE)
- [Attribution Notice](NOTICE)
- [Konnix Chat Trademark Policy](TRADEMARKS.md)

## Attribution

Konnix Chat was originally created and developed by Geraldo Valencia.

Modified versions and forks may be created and redistributed under the Apache
License 2.0. Contributors retain authorship of their own modifications, while
the original attribution must remain preserved according to `LICENSE` and
`NOTICE`.

## Trademark Summary

The following descriptive uses are permitted:

```text
Based on Konnix Chat
Fork of Konnix Chat
Compatible with Konnix Chat
Originally based on the Konnix Chat project
```

Modified products must not present themselves as an official Konnix Chat
version or use the official logo in a way that implies approval, partnership,
or official support without authorization.

Forks are not required to keep the Konnix Chat name and may use another name
and visual identity. Read [TRADEMARKS.md](TRADEMARKS.md) for the complete
policy.

## Documentation & Architecture

Comprehensive technical documentation and guides are organized under the [`docs/`](docs/) directory:

- [System Architecture](docs/code/architecture.md): Layered architecture, entity models, and WebSocket event protocols.
- [Backend Guide](docs/code/backend-guide.md): Java 21, Spring Boot 3.5.3, Flyway migrations, and Testcontainers.
- [Frontend Guide](docs/code/frontend-guide.md): React 19, TypeScript, Vite, PWA, and Tauri Desktop.
- [Design System & UI Kit](docs/code/design-system.md): Tokens, 13 visual themes, and `.kx-*` components from [`docs/tema/`](docs/tema/).
- [REST API Reference](docs/code/api-reference.md): Standard JSON envelope, error codes, and endpoint catalog.
- [DevOps & Deployment Guide](docs/code/devops-deployment-guide.md): GitHub Actions CI/CD, self-hosted runner automation, and Cloudflare Tunnel.

## AI Agents & Governance

For AI assistants and engineering team orchestration, see [AGENTS.md](AGENTS.md) for the 4 specialized agent specifications:
- [Software Developer Agent](docs/agents/1-software-developer.md)
- [QA Analyst Agent](docs/agents/2-qa-analyst.md)
- [UX/UI Specialist Agent](docs/agents/3-ux-ui-specialist.md)
- [Security & Privacy Specialist Agent (Zero PII Leakage)](docs/agents/4-security-privacy-specialist.md)

## Project Files

- `AGENTS.md` contains the AI agent orchestration index and rules.
- `LICENSE` contains the complete Apache License 2.0 text.
- `NOTICE` identifies the original authorship and attribution requirements.
- `TRADEMARKS.md` defines use of the Konnix Chat name and visual identity.
