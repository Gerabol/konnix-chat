# Plano de Correção — Exemplos de Endpoints e Exportação `.http`

## Contexto

A documentação interna de API (Konnix Chat, 72 endpoints) gera exemplos de cURL, resposta e exportação para o padrão REST Client (`.http`), mas o conteúdo gerado está incompleto:

- O exemplo de cURL não inclui o body da requisição, mesmo quando o endpoint exige campos obrigatórios.
- A resposta de exemplo é um placeholder genérico (`{ ...UserResponse }`) em vez de um exemplo real.
- Esses problemas se propagam para o arquivo `.http` exportado na aba "Exportar requests.http".

## 1. Diagnóstico da causa raiz

O gerador provavelmente trata `body` e `response` apenas como metadados de **tipo/schema** (nomes de campos e tipos), sem armazenar um **valor de exemplo concreto** para cada campo. Por isso:

- O cURL não tem `-d` com JSON, porque não existe um valor serializável para colocar ali.
- A resposta mostra o nome do schema (`UserResponse`) em vez de um objeto de exemplo.

## 2. Corrigir o modelo de dados de cada endpoint

Cada endpoint deveria armazenar, além de método/rota/permissão, exemplos reais:

```json
{
  "method": "POST",
  "path": "/api/v1/users",
  "auth": "obrigatoria",
  "permission": "ADMIN",
  "requestBody": {
    "username": "joao123",
    "name": "João Silva",
    "email": "joao@exemplo.com",
    "password": "senha123"
  },
  "responseExample": {
    "id": "usr_01h...",
    "username": "joao123",
    "name": "João Silva",
    "email": "joao@exemplo.com",
    "createdAt": "2026-08-27T12:00:00Z"
  },
  "errorExamples": {
    "409": { "error": "USERNAME_TAKEN", "message": "Username já utilizado." },
    "403": { "error": "FORBIDDEN", "message": "Sem permissão para esta ação." }
  }
}
```

Sem `requestBody` e `responseExample` com valores reais, nenhum gerador (cURL ou `.http`) consegue montar um exemplo útil.

## 3. Corrigir o template de geração do cURL

**Atual (incompleto):**
```
curl -X {{method}} "{BASE_URL}{{path}}" \
  -H "Authorization: Bearer <TOKEN>"
```

**Corrigido:**
```
curl -X {{method}} "{BASE_URL}{{path}}" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{{requestBodyJSON}}'
```

> Incluir `Content-Type` e `-d` apenas quando `requestBody` existir, para não gerar `-d` vazio em endpoints `GET`/sem body.

## 4. Corrigir o template do exportador `.http`

Template por endpoint selecionado na tela "Exportar requests.http":

```http
### {{summary}}
# @name {{camelCaseName}}
{{method}} {{baseUrl}}{{path}}
{{#if auth}}Authorization: Bearer {{token}}{{/if}}
{{#if requestBody}}Content-Type: application/json{{/if}}

{{#if requestBody}}
{{requestBodyJSON}}
{{/if}}
```

Gerar também um arquivo `http-client.env.json` com `baseUrl` e `token` como variáveis de ambiente, em vez de valores fixos:

```json
{
  "dev": { "baseUrl": "http://localhost:3000", "token": "" },
  "prod": { "baseUrl": "https://api.konnix.chat", "token": "" }
}
```

## 5. Corrigir path params na exportação

Endpoints como `/api/v1/users/{id}` precisam ter `{id}` substituído por uma variável do REST Client (`{{userId}}`) ou por um valor de exemplo. Exportado literalmente, `{id}` (chave simples) não é reconhecido pelo REST Client e gera URL inválida.

## 6. Adicionar exemplos de erro na exportação (opcional)

Para cada erro conhecido do endpoint (400, 401, 403, 404, 409, 500), gerar um bloco adicional no `.http`:

```http
### {{summary}} - erro: username já utilizado (409)
{{method}} {{baseUrl}}{{path}}
Authorization: Bearer {{token}}
Content-Type: application/json

{{requestBodyJSON com valor duplicado proposital}}
```

## 7. Validação final

Após corrigir modelo de dados e templates, rodar a exportação para os 72 endpoints e verificar:

- [ ] Todo endpoint com `requestBody` gera `-d`/JSON no cURL e no `.http`
- [ ] Toda resposta de exemplo mostra valores reais, não placeholders de schema
- [ ] Todo path param vira variável válida (`{{param}}`) na exportação
- [ ] Nenhum `.http` gerado contém texto tipo `...UserResponse` sobrando
- [ ] Arquivo `http-client.env.json` é gerado/atualizado com as variáveis corretas
