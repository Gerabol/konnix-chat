import { useEffect, useMemo, useState } from 'react'
import { api, ApiError, revokeBearerToken, validateBearerToken } from './api'
import type { ApiTokenMetadata, User } from './api'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type ApiField = { name: string; type: string; required: boolean; description: string }
type ApiEndpoint = {
  method: Method
  path: string
  title: string
  description: string
  auth: string
  permission: string
  params?: ApiField[]
  query?: ApiField[]
  body?: ApiField[]
  request?: string
  response: string
  statuses: string[]
}
type ApiModule = { id: string; name: string; endpoints: ApiEndpoint[] }

const field = (name: string, type: string, required: boolean, description: string): ApiField => ({ name, type, required, description })
const json = (value: unknown) => JSON.stringify(value, null, 2)
const commonErrors = ['400 - Requisição inválida', '401 - Não autenticado', '403 - Sem permissão', '404 - Recurso não encontrado', '500 - Erro interno']

const modules: ApiModule[] = [
  {
    id: 'auth', name: 'Autenticação', endpoints: [
      { method: 'POST', path: '/api/v1/auth/login', title: 'Autentica usuário', description: 'Valida as credenciais e cria uma sessão Bearer.', auth: 'Não necessária', permission: 'Público', body: [field('username', 'String', true, 'Nome de usuário.'), field('password', 'String', true, 'Senha da conta.')], request: json({ username: 'admin', password: '********' }), response: json({ token: '<TOKEN>', user: { id: '<UUID>', username: 'admin', name: 'Administrador' } }), statuses: ['200 - Login realizado', '400 - Dados inválidos', '401 - Credenciais inválidas'] },
      { method: 'POST', path: '/api/v1/auth/logout', title: 'Encerra sessão', description: 'Revoga o token atual.', auth: 'Obrigatória', permission: 'Usuário autenticado', response: 'null', statuses: ['200 - Sessão encerrada', '401 - Token inválido'] },
      { method: 'POST', path: '/api/v1/auth/change-required-password', title: 'Conclui troca obrigatória de senha', description: 'Substitui a senha temporária definida pelo administrador.', auth: 'Obrigatória', permission: 'Usuário com troca pendente', body: [field('newPassword', 'String', true, 'Nova senha.'), field('confirmPassword', 'String', true, 'Confirmação da nova senha.')], response: '{ ...UserResponse }', statuses: commonErrors },
      { method: 'GET', path: '/api/v1/auth/me', title: 'Consulta sessão atual', description: 'Retorna os dados do usuário autenticado.', auth: 'Obrigatória', permission: 'Usuário autenticado', response: '{ ...UserResponse }', statuses: ['200 - Usuário retornado', '401 - Token inválido'] },
      { method: 'PATCH', path: '/api/v1/auth/profile', title: 'Atualiza o próprio perfil', description: 'Atualiza nome e e-mail do usuário logado.', auth: 'Obrigatória', permission: 'Usuário autenticado', body: [field('name', 'String', true, 'Nome exibido.'), field('email', 'String', false, 'E-mail da conta.')], response: '{ ...UserResponse }', statuses: commonErrors },
      { method: 'PATCH', path: '/api/v1/auth/preferences', title: 'Atualiza preferências pessoais', description: 'Atualiza o tema visual do usuário autenticado.', auth: 'Obrigatória', permission: 'Próprio usuário', body: [field('theme', 'String', true, 'DEFAULT, DARK, BLACK_GRAY, PINK, GREEN ou RED.')], response: '{ ...UserResponse }', statuses: commonErrors },
      { method: 'POST', path: '/api/v1/auth/presence', title: 'Atualiza presença', description: 'Altera o status de presença do usuário.', auth: 'Obrigatória', permission: 'Usuário autenticado', body: [field('status', 'String', true, 'Status permitido pelo PresenceService.')], response: '{ ...UserResponse }', statuses: ['200 - Presença atualizada', ...commonErrors] },
    ],
  },
  {
    id: 'users', name: 'Usuários e perfil', endpoints: [
      { method: 'GET', path: '/api/v1/users', title: 'Lista usuários', description: 'Lista usuários disponíveis para administração.', auth: 'Obrigatória', permission: 'ADMIN', response: '[ ...UserResponse ]', statuses: commonErrors },
      { method: 'GET', path: '/api/v1/users/{id}', title: 'Busca usuário', description: 'Retorna um usuário pelo UUID.', auth: 'Obrigatória', permission: 'ADMIN', params: [field('id', 'UUID', true, 'Identificador do usuário.')], response: '{ ...UserResponse }', statuses: commonErrors },
      { method: 'POST', path: '/api/v1/users', title: 'Cria usuário', description: 'Cria uma conta de usuário.', auth: 'Obrigatória', permission: 'ADMIN', body: [field('username', 'String', true, 'Username único.'), field('name', 'String', true, 'Nome completo.'), field('email', 'String', false, 'E-mail.'), field('password', 'String', true, 'Senha inicial.')], response: '{ ...UserResponse }', statuses: ['200 - Usuário criado', ...commonErrors, '409 - Username já utilizado'] },
      { method: 'PATCH', path: '/api/v1/users/{id}', title: 'Atualiza usuário', description: 'Atualiza dados básicos de uma conta.', auth: 'Obrigatória', permission: 'ADMIN', params: [field('id', 'UUID', true, 'Identificador do usuário.')], body: [field('name', 'String', true, 'Nome completo.'), field('email', 'String', false, 'E-mail.'), field('password', 'String', false, 'Nova senha, quando informada.')], response: '{ ...UserResponse }', statuses: commonErrors },
      { method: 'POST', path: '/api/v1/users/{id}/activate', title: 'Ativa usuário', description: 'Ativa uma conta desativada.', auth: 'Obrigatória', permission: 'ADMIN', params: [field('id', 'UUID', true, 'Identificador do usuário.')], response: '{ ...UserResponse }', statuses: commonErrors },
      { method: 'POST', path: '/api/v1/users/{id}/deactivate', title: 'Desativa usuário', description: 'Desativa uma conta.', auth: 'Obrigatória', permission: 'ADMIN', params: [field('id', 'UUID', true, 'Identificador do usuário.')], response: '{ ...UserResponse }', statuses: commonErrors },
      { method: 'PATCH', path: '/api/v1/users/{id}/roles', title: 'Atualiza roles', description: 'Substitui as roles administrativas do usuário.', auth: 'Obrigatória', permission: 'ADMIN', params: [field('id', 'UUID', true, 'Identificador do usuário.')], body: [field('roles', 'Array<String>', true, 'Roles ADMIN, USER ou BOT.')], response: '{ ...UserResponse }', statuses: ['200 - Roles atualizadas', ...commonErrors] },
      { method: 'GET', path: '/api/v1/users/directory', title: 'Diretório de usuários', description: 'Lista usuários para seleção em conversas.', auth: 'Obrigatória', permission: 'Usuário autenticado', query: [field('q', 'String', false, 'Termo de busca.')], response: '[ ...UserDirectoryResponse ]', statuses: ['200 - Lista retornada', '401 - Não autenticado'] },
      { method: 'GET', path: '/api/v1/profiles/users/{id}', title: 'Perfil público', description: 'Consulta o perfil público de outro usuário.', auth: 'Obrigatória', permission: 'Usuário autenticado', params: [field('id', 'UUID', true, 'Identificador do usuário.')], response: '{ ...PublicProfileResponse }', statuses: commonErrors },
    ],
  },
  {
    id: 'rooms', name: 'Conversas, canais e grupos', endpoints: [
      { method: 'GET', path: '/api/v1/rooms', title: 'Lista conversas', description: 'Lista as salas acessíveis ao usuário.', auth: 'Obrigatória', permission: 'Usuário autenticado', response: '[ ...RoomResponse ]', statuses: ['200 - Salas retornadas', '401 - Não autenticado'] },
      { method: 'GET', path: '/api/v1/rooms/{id}', title: 'Busca sala', description: 'Retorna os dados de uma sala.', auth: 'Obrigatória', permission: 'Membro da sala', params: [field('id', 'UUID', true, 'Identificador da sala.')], response: '{ ...RoomResponse }', statuses: commonErrors },
      { method: 'POST', path: '/api/v1/rooms', title: 'Cria canal ou grupo', description: 'Cria uma nova sala.', auth: 'Obrigatória', permission: 'Usuário autenticado', body: [field('name', 'String', true, 'Nome técnico.'), field('displayName', 'String', false, 'Nome exibido.'), field('type', 'String', true, 'PRIVATE_GROUP ou CHANNEL.')], response: '{ ...RoomResponse }', statuses: ['200 - Sala criada', ...commonErrors] },
      { method: 'POST', path: '/api/v1/direct-messages', title: 'Inicia conversa direta', description: 'Cria ou recupera uma conversa privada.', auth: 'Obrigatória', permission: 'Usuário autenticado', body: [field('userId', 'UUID', true, 'Usuário destinatário.')], response: '{ ...RoomResponse }', statuses: commonErrors },
      { method: 'GET', path: '/api/v1/rooms/{roomId}/members', title: 'Lista membros', description: 'Lista os membros ativos e seus papéis.', auth: 'Obrigatória', permission: 'Membro da sala', params: [field('roomId', 'UUID', true, 'Identificador da sala.')], response: '[ ...RoomMemberResponse ]', statuses: commonErrors },
      { method: 'POST', path: '/api/v1/rooms/{roomId}/members', title: 'Adiciona membro', description: 'Adiciona um usuário à sala.', auth: 'Obrigatória', permission: 'Permissão da sala', params: [field('roomId', 'UUID', true, 'Identificador da sala.')], body: [field('userId', 'UUID', true, 'Usuário a adicionar.')], response: '{ ...RoomMemberResponse }', statuses: commonErrors },
      { method: 'DELETE', path: '/api/v1/rooms/{roomId}/members/{userId}', title: 'Remove membro', description: 'Remove um membro da sala.', auth: 'Obrigatória', permission: 'Permissão da sala', params: [field('roomId', 'UUID', true, 'Sala.'), field('userId', 'UUID', true, 'Membro.')], response: 'null', statuses: commonErrors },
    ],
  },
  {
    id: 'messages', name: 'Mensagens', endpoints: [
      { method: 'GET', path: '/api/v1/rooms/{roomId}/messages', title: 'Lista mensagens', description: 'Retorna o histórico paginado da sala.', auth: 'Obrigatória', permission: 'Membro da sala', params: [field('roomId', 'UUID', true, 'Sala.')], query: [field('limit', 'Integer', false, 'Quantidade limitada pelo backend.'), field('before', 'Instant', false, 'Cursor da página anterior.')], response: '{ messages, hasMore, nextBefore }', statuses: commonErrors },
      { method: 'POST', path: '/api/v1/rooms/{roomId}/messages', title: 'Envia mensagem', description: 'Cria uma mensagem textual.', auth: 'Obrigatória', permission: 'Membro com escrita', params: [field('roomId', 'UUID', true, 'Sala.')], body: [field('content', 'String', true, 'Texto da mensagem.'), field('parentMessageId', 'UUID', false, 'Mensagem citada.'), field('forwardedMessageId', 'UUID', false, 'Mensagem encaminhada.')], response: '{ ...MessageResponse }', statuses: ['200 - Mensagem criada', ...commonErrors] },
      { method: 'POST', path: '/api/v1/rooms/{roomId}/read', title: 'Marca sala como lida', description: 'Registra a leitura das mensagens pendentes.', auth: 'Obrigatória', permission: 'Membro da sala', params: [field('roomId', 'UUID', true, 'Sala.')], response: 'null', statuses: commonErrors },
      { method: 'GET', path: '/api/v1/rooms/{roomId}/messages/search', title: 'Pesquisa mensagens', description: 'Pesquisa conteúdo textual na sala.', auth: 'Obrigatória', permission: 'Membro da sala', params: [field('roomId', 'UUID', true, 'Sala.')], query: [field('q', 'String', true, 'Texto pesquisado.')], response: '[ ...MessageResponse ]', statuses: commonErrors },
      { method: 'POST', path: '/api/v1/messages/{id}/reactions', title: 'Alterna reação', description: 'Adiciona ou remove uma reação.', auth: 'Obrigatória', permission: 'Membro da sala', params: [field('id', 'UUID', true, 'Mensagem.')], body: [field('emoji', 'String', true, 'Emoji da reação.')], response: '{ ...MessageReactionResponse }', statuses: commonErrors },
      { method: 'PATCH', path: '/api/v1/messages/{id}', title: 'Edita mensagem', description: 'Atualiza o conteúdo de uma mensagem própria.', auth: 'Obrigatória', permission: 'Autor da mensagem', params: [field('id', 'UUID', true, 'Mensagem.')], body: [field('content', 'String', true, 'Novo conteúdo.')], response: '{ ...MessageResponse }', statuses: commonErrors },
      { method: 'DELETE', path: '/api/v1/messages/{id}', title: 'Exclui mensagem', description: 'Marca uma mensagem como excluída.', auth: 'Obrigatória', permission: 'Autor ou permissão administrativa', params: [field('id', 'UUID', true, 'Mensagem.')], response: '{ ...MessageResponse }', statuses: commonErrors },
    ],
  },
  {
    id: 'files', name: 'Arquivos e avatares', endpoints: [
      { method: 'POST', path: '/api/v1/rooms/{roomId}/files', title: 'Envia arquivo', description: 'Faz upload de um arquivo e cria a mensagem correspondente.', auth: 'Obrigatória', permission: 'Membro com escrita', params: [field('roomId', 'UUID', true, 'Sala.')], body: [field('file', 'MultipartFile', true, 'Arquivo enviado como multipart/form-data.')], response: '{ ...MessageResponse com attachment }', statuses: ['200 - Arquivo enviado', ...commonErrors] },
      { method: 'GET', path: '/api/v1/rooms/{roomId}/files', title: 'Lista arquivos da conversa', description: 'Lista todos os anexos da sala, ordenados pelo upload.', auth: 'Obrigatória', permission: 'Membro da sala', params: [field('roomId', 'UUID', true, 'Sala.')], response: '[ { id, originalName, mimeType, size, createdAt, userId, username, name } ]', statuses: commonErrors },
      { method: 'GET', path: '/api/v1/files/{id}', title: 'Baixa arquivo', description: 'Retorna o binário do anexo armazenado.', auth: 'Obrigatória', permission: 'Membro da sala do arquivo', params: [field('id', 'UUID', true, 'Anexo.')], response: 'Resource binário com Content-Disposition', statuses: ['200 - Arquivo', ...commonErrors] },
      { method: 'PUT', path: '/api/v1/auth/avatar', title: 'Atualiza meu avatar', description: 'Atualiza a imagem do usuário autenticado.', auth: 'Obrigatória', permission: 'Usuário autenticado', body: [field('file', 'MultipartFile', true, 'Imagem multipart/form-data.')], response: '{ ...UserResponse }', statuses: commonErrors },
      { method: 'GET', path: '/api/v1/users/{id}/avatar', title: 'Baixa avatar de usuário', description: 'Retorna a imagem de avatar.', auth: 'Obrigatória', permission: 'Usuário autenticado', params: [field('id', 'UUID', true, 'Usuário.')], response: 'Resource de imagem', statuses: commonErrors },
      { method: 'PUT', path: '/api/v1/users/{id}/avatar', title: 'Atualiza avatar de usuário', description: 'Atualiza avatar administrativamente.', auth: 'Obrigatória', permission: 'ADMIN', params: [field('id', 'UUID', true, 'Usuário.')], body: [field('file', 'MultipartFile', true, 'Imagem multipart/form-data.')], response: '{ ...UserResponse }', statuses: commonErrors },
      { method: 'PUT', path: '/api/v1/rooms/{id}/avatar', title: 'Atualiza avatar da sala', description: 'Atualiza a imagem de um canal ou grupo.', auth: 'Obrigatória', permission: 'Permissão da sala', params: [field('id', 'UUID', true, 'Sala.')], body: [field('file', 'MultipartFile', true, 'Imagem multipart/form-data.')], response: '{ ...RoomResponse }', statuses: commonErrors },
      { method: 'GET', path: '/api/v1/rooms/{id}/avatar', title: 'Baixa avatar da sala', description: 'Retorna a imagem da sala.', auth: 'Obrigatória', permission: 'Membro da sala', params: [field('id', 'UUID', true, 'Sala.')], response: 'Resource de imagem', statuses: commonErrors },
    ],
  },
  {
    id: 'polls', name: 'Enquetes', endpoints: [
      { method: 'POST', path: '/api/v1/rooms/{roomId}/polls', title: 'Cria enquete', description: 'Cria uma enquete em grupo privado.', auth: 'Obrigatória', permission: 'Membro com escrita', params: [field('roomId', 'UUID', true, 'Grupo.')], body: [field('question', 'String', true, 'Pergunta.'), field('options', 'Array<String>', true, 'Pelo menos duas opções.'), field('allowMultiple', 'Boolean', true, 'Permite múltiplas escolhas.')], response: '{ ...MessageResponse com poll }', statuses: commonErrors },
      { method: 'POST', path: '/api/v1/polls/{pollId}/votes', title: 'Registra voto', description: 'Registra, altera ou remove o voto atual.', auth: 'Obrigatória', permission: 'Membro da sala', params: [field('pollId', 'UUID', true, 'Enquete.')], body: [field('optionId', 'UUID', true, 'Opção escolhida.')], response: '{ ...MessageResponse com poll }', statuses: commonErrors },
    ],
  },
  {
    id: 'push-settings', name: 'Push e configurações', endpoints: [
      { method: 'GET', path: '/api/v1/push/public-key', title: 'Chave pública push', description: 'Retorna a chave VAPID pública.', auth: 'Não necessária', permission: 'Público', response: '{ publicKey: String }', statuses: ['200 - Chave retornada'] },
      { method: 'POST', path: '/api/v1/push/subscribe', title: 'Inscreve push', description: 'Registra uma assinatura de notificações.', auth: 'Obrigatória', permission: 'Usuário autenticado', body: [field('endpoint', 'String', true, 'Endpoint do PushSubscription.'), field('p256dh', 'String', true, 'Chave pública.'), field('auth', 'String', true, 'Segredo da assinatura.')], response: 'null', statuses: commonErrors },
      { method: 'DELETE', path: '/api/v1/push/unsubscribe', title: 'Remove inscrição push', description: 'Remove uma assinatura de notificações.', auth: 'Obrigatória', permission: 'Usuário autenticado', body: [field('endpoint', 'String', true, 'Endpoint a remover.')], response: 'null', statuses: commonErrors },
      { method: 'GET', path: '/api/v1/settings/read-receipts', title: 'Consulta confirmação de leitura', description: 'Consulta a configuração de confirmação de leitura.', auth: 'Obrigatória', permission: 'Usuário autenticado', response: '{ enabled: Boolean }', statuses: commonErrors },
      { method: 'PUT', path: '/api/v1/settings/read-receipts', title: 'Atualiza confirmação de leitura', description: 'Ativa ou desativa confirmações de leitura.', auth: 'Obrigatória', permission: 'Usuário autenticado', body: [field('enabled', 'Boolean', true, 'Configuração desejada.')], response: '{ enabled: Boolean }', statuses: commonErrors },
    ],
  },
  {
    id: 'admin', name: 'Administração', endpoints: [
      { method: 'GET', path: '/api/v1/admin/users', title: 'Lista usuários administrativos', description: 'Lista usuários com paginação e busca.', auth: 'Obrigatória', permission: 'ADMIN', query: [field('q', 'String', false, 'Busca.'), field('page', 'Integer', false, 'Página.'), field('size', 'Integer', false, 'Tamanho da página.')], response: '{ items, page, size, totalItems, totalPages }', statuses: commonErrors },
      { method: 'PATCH', path: '/api/v1/admin/users/{id}/roles', title: 'Altera roles administrativas', description: 'Altera as roles de um usuário.', auth: 'Obrigatória', permission: 'ADMIN', params: [field('id', 'UUID', true, 'Usuário.')], body: [field('roles', 'Array<String>', true, 'ADMIN, USER ou BOT.')], response: '{ ...UserResponse }', statuses: commonErrors },
      { method: 'POST', path: '/api/v1/admin/users/{id}/activate', title: 'Ativa conta', description: 'Ativa uma conta pelo painel administrativo.', auth: 'Obrigatória', permission: 'ADMIN', params: [field('id', 'UUID', true, 'Usuário.')], response: '{ ...UserResponse }', statuses: commonErrors },
      { method: 'POST', path: '/api/v1/admin/users/{id}/deactivate', title: 'Desativa conta', description: 'Desativa uma conta pelo painel administrativo.', auth: 'Obrigatória', permission: 'ADMIN', params: [field('id', 'UUID', true, 'Usuário.')], response: '{ ...UserResponse }', statuses: commonErrors },
      { method: 'PATCH', path: '/api/v1/admin/users/{id}/status', title: 'Atualiza status da conta', description: 'Define ACTIVE, READ_ONLY ou DISABLED.', auth: 'Obrigatória', permission: 'ADMIN', params: [field('id', 'UUID', true, 'Usuário.')], body: [field('status', 'String', true, 'ACTIVE, READ_ONLY ou DISABLED.')], response: '{ ...UserResponse }', statuses: commonErrors },
      { method: 'GET', path: '/api/v1/admin/rooms', title: 'Lista todas as salas', description: 'Lista salas e grupos para administração.', auth: 'Obrigatória', permission: 'ADMIN', response: '[ ...RoomResponse ]', statuses: commonErrors },
      { method: 'PATCH', path: '/api/v1/admin/rooms/{id}', title: 'Atualiza sala', description: 'Atualiza nome, exibição e modo somente leitura.', auth: 'Obrigatória', permission: 'ADMIN', params: [field('id', 'UUID', true, 'Sala.')], body: [field('name', 'String', false, 'Nome técnico.'), field('displayName', 'String', false, 'Nome exibido.'), field('readOnly', 'Boolean', false, 'Modo somente leitura.')], response: '{ ...RoomResponse }', statuses: commonErrors },
      { method: 'GET', path: '/api/v1/admin/rooms/{id}/members', title: 'Lista membros administrativos', description: 'Lista membros de uma sala.', auth: 'Obrigatória', permission: 'ADMIN', params: [field('id', 'UUID', true, 'Sala.')], response: '[ ...RoomMemberResponse ]', statuses: commonErrors },
      { method: 'POST', path: '/api/v1/admin/rooms/{id}/members', title: 'Adiciona membro administrativamente', description: 'Adiciona usuário a uma sala.', auth: 'Obrigatória', permission: 'ADMIN', params: [field('id', 'UUID', true, 'Sala.')], body: [field('userId', 'UUID', true, 'Usuário.')], response: '{ ...RoomMemberResponse }', statuses: commonErrors },
      { method: 'DELETE', path: '/api/v1/admin/rooms/{id}/members/{userId}', title: 'Remove membro administrativamente', description: 'Remove usuário de uma sala.', auth: 'Obrigatória', permission: 'ADMIN', params: [field('id', 'UUID', true, 'Sala.'), field('userId', 'UUID', true, 'Usuário.')], response: 'null', statuses: commonErrors },
      { method: 'PATCH', path: '/api/v1/admin/rooms/{id}/members/{userId}', title: 'Atualiza papel do membro', description: 'Define MEMBER ou OWNER.', auth: 'Obrigatória', permission: 'ADMIN', params: [field('id', 'UUID', true, 'Sala.'), field('userId', 'UUID', true, 'Usuário.')], body: [field('role', 'String', true, 'MEMBER ou OWNER.')], response: '{ ...RoomMemberResponse }', statuses: commonErrors },
      { method: 'GET', path: '/api/v1/admin/audit', title: 'Pesquisa auditoria', description: 'Consulta ações administrativas paginadas.', auth: 'Obrigatória', permission: 'ADMIN', query: [field('user', 'UUID', false, 'Usuário.'), field('action', 'String', false, 'Ação.'), field('resource', 'String', false, 'Recurso.'), field('from/to', 'Instant', false, 'Intervalo de datas.'), field('page/size', 'Integer', false, 'Paginação.')], response: '{ items, page, size, totalItems, totalPages }', statuses: commonErrors },
      { method: 'GET', path: '/api/v1/admin/audit/options', title: 'Opções da auditoria', description: 'Retorna opções para os filtros de auditoria.', auth: 'Obrigatória', permission: 'ADMIN', response: '{ users, actions, resources }', statuses: commonErrors },
      { method: 'GET', path: '/api/v1/admin/monitoring/metrics', title: 'Métricas operacionais', description: 'Retorna métricas do sistema.', auth: 'Obrigatória', permission: 'ADMIN', response: '{ totalFiles, totalMessages, totalUsers, ... }', statuses: commonErrors },
      { method: 'GET', path: '/api/v1/admin/settings', title: 'Consulta configurações', description: 'Retorna configurações administrativas.', auth: 'Obrigatória', permission: 'ADMIN', response: '{ name, maxUploadBytes }', statuses: commonErrors },
      { method: 'PUT', path: '/api/v1/admin/settings', title: 'Atualiza configurações', description: 'Atualiza nome da aplicação e limite de upload.', auth: 'Obrigatória', permission: 'ADMIN', body: [field('name', 'String', true, 'Nome da aplicação.'), field('maxUploadBytes', 'Long', true, 'Limite de upload em bytes.')], response: '{ name, maxUploadBytes }', statuses: commonErrors },
    ],
  },
]

const methodFilters: Array<'ALL' | Method> = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const allEndpointKeys = modules.flatMap((module) => module.endpoints.map((endpoint) => `${module.id}-${endpoint.method}-${endpoint.path}`))

export default function ApiDocsPanel() {
  const [view, setView] = useState<'docs' | 'tokens' | 'export'>('docs')
  const [query, setQuery] = useState('')
  const [method, setMethod] = useState<'ALL' | Method>('ALL')
  const [open, setOpen] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const normalized = query.trim().toLowerCase()
  const filteredModules = useMemo(() => modules.map((module) => ({
    ...module,
    endpoints: module.endpoints.filter((endpoint) => endpoint.method === (method === 'ALL' ? endpoint.method : method) && (!normalized || `${module.name} ${endpoint.method} ${endpoint.path} ${endpoint.title} ${endpoint.description}`.toLowerCase().includes(normalized))),
  })).filter((module) => module.endpoints.length > 0), [method, normalized])
  const copy = async (value: string, key: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API indisponível')
      await navigator.clipboard.writeText(value)
    } catch {
      const area = document.createElement('textarea')
      area.value = value; area.style.position = 'fixed'; area.style.opacity = '0'
      document.body.appendChild(area); area.focus(); area.select(); document.execCommand('copy'); area.remove()
    }
    setCopied(key)
    window.setTimeout(() => setCopied(null), 1500)
  }
  const scrollToModule = (id: string) => document.getElementById(`api-module-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return <section className="admin-panel api-docs-panel">
    <div className="api-docs-hero"><div><span className="api-eyebrow">DOCUMENTAÇÃO INTERNA</span><h1>API / Endpoints</h1><p>Referência técnica dos endpoints reais do Konnix Chat.</p></div><span className="api-count">{modules.reduce((total, item) => total + item.endpoints.length, 0)} endpoints</span></div>
    <div className="api-view-tabs"><button type="button" className={view === 'docs' ? 'active' : ''} onClick={() => setView('docs')}>Endpoints</button><button type="button" className={view === 'tokens' ? 'active' : ''} onClick={() => setView('tokens')}>Tokens</button><button type="button" className={view === 'export' ? 'active' : ''} onClick={() => setView('export')}>Exportar requests.http</button></div>
    {view === 'tokens' ? <ApiTokenPanel /> : view === 'export' ? <ApiRequestExportPanel /> : <>
    <div className="api-toolbar"><input className="input" placeholder="Pesquisar endpoint..." value={query} onChange={(event) => setQuery(event.target.value)} /><div className="api-method-filters">{methodFilters.map((item) => <button type="button" key={item} className={`api-filter ${method === item ? 'active' : ''} ${item !== 'ALL' ? `method-${item.toLowerCase()}` : ''}`} onClick={() => setMethod(item)}>{item === 'ALL' ? 'Todos' : item}</button>)}</div></div>
    <div className="api-docs-layout">
      <nav className="api-module-nav" aria-label="Módulos da API"><strong>Módulos</strong>{modules.map((module) => <button type="button" key={module.id} onClick={() => scrollToModule(module.id)}>{module.name}<span>{module.endpoints.length}</span></button>)}</nav>
      <div className="api-module-list">{filteredModules.length === 0 && <div className="api-empty">Nenhum endpoint encontrado.</div>}{filteredModules.map((module) => <section className="api-module" id={`api-module-${module.id}`} key={module.id}><h2>{module.name}</h2>{module.endpoints.map((endpoint) => { const key = `${module.id}-${endpoint.method}-${endpoint.path}`; const isOpen = open === key; return <article className={`api-endpoint ${isOpen ? 'expanded' : ''}`} key={key}><button type="button" className="api-endpoint-summary" onClick={() => setOpen(isOpen ? null : key)}><span className={`api-method method-${endpoint.method.toLowerCase()}`}>{endpoint.method}</span><span className="api-route">{endpoint.path}</span><span className="api-endpoint-title">{endpoint.title}</span><span className="api-chevron">{isOpen ? '⌃' : '⌄'}</span></button>{isOpen && <ApiEndpointDetails endpoint={endpoint} copied={copied} onCopy={copy} />}</article> })}</section>)}</div>
    </div>
    </>}
  </section>
}

function ApiTokenPanel() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [expirationDate, setExpirationDate] = useState(() => { const date = new Date(); date.setFullYear(date.getFullYear() + 1); return date.toISOString().slice(0, 10) })
  const [tokens, setTokens] = useState<ApiTokenMetadata[]>([])

  useEffect(() => {
    api.adminApiTokens().then(setTokens).catch(() => undefined)
  }, [])

  const generate = async () => {
    if (!username.trim() || !password || busy) return
    setBusy(true); setMessage(null); setUser(null)
    try {
      const result = await api.adminCreateApiToken(username.trim(), password, expirationDate)
      setToken(result.token)
      setTokens((current) => [result.metadata, ...current])
      setPassword('')
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Não foi possível gerar o token')
    } finally { setBusy(false) }
  }

  const validate = async () => {
    if (!token || busy) return
    setBusy(true); setMessage(null)
    try { setUser(await validateBearerToken(token)); setMessage('Token válido e acesso autorizado.') }
    catch (error) { setUser(null); setMessage(error instanceof ApiError ? error.message : 'Token inválido') }
    finally { setBusy(false) }
  }

  const revoke = async (id: string, generated = false) => {
    if (busy) return
    setBusy(true)
    try {
      if (generated && token) await revokeBearerToken(token)
      else await api.adminRevokeApiToken(id)
      setTokens((current) => current.map((item) => item.id === id ? { ...item, revoked: true } : item))
      if (generated) { setToken(null); setUser(null) }
      setMessage('Token revogado.')
    }
    catch (error) { setMessage(error instanceof ApiError ? error.message : 'Não foi possível revogar o token') }
    finally { setBusy(false) }
  }

  return <div className="api-token-panel">
    <div className="api-token-intro"><h2>Tokens Bearer</h2><p>Gere um token para usar no REST Client. O banco guarda apenas uma prévia, validade, usuário e criador. O token completo é exibido somente após a geração.</p></div>
    <div className="api-token-form"><label className="admin-label">Usuário<input className="input" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label><label className="admin-label">Senha<input className="input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><label className="admin-label">Data de expiração<input className="input" type="date" value={expirationDate} onChange={(event) => setExpirationDate(event.target.value)} /></label><button className="btn-primary" disabled={busy || !username.trim() || !password || !expirationDate} onClick={() => void generate()}>{busy ? 'Processando…' : 'Gerar token'}</button></div>
    {token && <div className="api-token-result"><strong>Token gerado, copie agora</strong><code>{token}</code><div className="api-token-actions"><button className="btn-ghost" onClick={() => void navigator.clipboard?.writeText(token)}>Copiar token</button><button className="btn-ghost" disabled={busy} onClick={() => void validate()}>Validar acesso</button></div></div>}
    {user && <div className="api-token-user">Acesso como <strong>{user.name} (@{user.username})</strong></div>}
    {message && <p className="api-token-message">{message}</p>}
    <div className="api-token-list"><h3>Tokens emitidos</h3>{tokens.length === 0 && <p className="api-token-message">Nenhum token emitido.</p>}{tokens.map((item) => <div className="api-token-row" key={item.id}><div><code>{item.tokenPreview}</code><span>Usuário: {item.username} · Criado por: {item.createdBy || 'N/A'}</span><small>Validade: {new Date(item.expiresAt).toLocaleString('pt-BR')}</small></div><button className="danger-action" disabled={busy || item.revoked} onClick={() => void revoke(item.id)}>{item.revoked ? 'Desativado' : 'Desativar'}</button></div>)}</div>
  </div>
}

function ApiRequestExportPanel() {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggle = (key: string) => setSelected((current) => {
    const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next
  })
  const toggleModule = (module: ApiModule, checked: boolean) => setSelected((current) => {
    const next = new Set(current)
    module.endpoints.forEach((endpoint) => {
      const key = `${module.id}-${endpoint.method}-${endpoint.path}`
      if (checked) next.add(key); else next.delete(key)
    })
    return next
  })
  const allSelected = allEndpointKeys.every((key) => selected.has(key))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allEndpointKeys))
  const download = () => {
    const lines = ['@baseUrl = http://localhost:5174', '@token = XXXXXXXXXXXXX', '', '# Konnix Chat REST Client requests', '# Backend Spring REST API (PostgreSQL). The frontend proxies the local installation.', '# API responses are JSON. Replace @baseUrl only when the server is published elsewhere.', '']
    modules.forEach((module) => module.endpoints.forEach((endpoint) => {
      const key = `${module.id}-${endpoint.method}-${endpoint.path}`
      if (!selected.has(key)) return
      lines.push(`### ${endpoint.title}`, `${endpoint.method} {{baseUrl}}${endpoint.path}`, 'Authorization: Bearer {{token}}', 'Accept: application/json', 'Content-Type: application/json', '')
      if (endpoint.request) lines.push(endpoint.request)
      lines.push('')
    }))
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob); const link = document.createElement('a')
    link.href = url; link.download = 'requests.http'; link.click(); URL.revokeObjectURL(url)
  }
  return <div className="api-export-panel"><p>Selecione os endpoints que deseja exportar para a extensão REST Client do VS Code.</p><button type="button" className="btn-ghost api-export-global" aria-pressed={allSelected} onClick={toggleAll}>{allSelected ? `Desmarcar todos os ${allEndpointKeys.length} endpoints` : `Selecionar todos os ${allEndpointKeys.length} endpoints`}</button><div className="api-export-list">{modules.map((module) => { const moduleKeys = module.endpoints.map((endpoint) => `${module.id}-${endpoint.method}-${endpoint.path}`); const moduleAllSelected = moduleKeys.every((key) => selected.has(key)); return <fieldset key={module.id}><legend>{module.name}</legend><label className="api-export-all"><input type="checkbox" checked={moduleAllSelected} onChange={(event) => toggleModule(module, event.target.checked)} /><strong>Todos</strong></label>{module.endpoints.map((endpoint) => { const key = `${module.id}-${endpoint.method}-${endpoint.path}`; return <label key={key}><input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} /><span>{endpoint.method} {endpoint.path}</span></label> })}</fieldset> })}</div><button className="btn-primary" disabled={selected.size === 0} onClick={download}>Baixar requests.http</button></div>
}

function ApiEndpointDetails({ endpoint, copied, onCopy }: { endpoint: ApiEndpoint; copied: string | null; onCopy: (value: string, key: string) => void }) {
  const routeKey = `${endpoint.method} ${endpoint.path}`
  const curl = `curl -X ${endpoint.method} "{BASE_URL}${endpoint.path}" \\\n  -H "Authorization: Bearer <TOKEN>"`
  return <div className="api-endpoint-details">
    <div className="api-detail-head"><div><strong>{endpoint.method} {endpoint.path}</strong><p>{endpoint.description}</p></div><button type="button" className="api-copy" onClick={() => void onCopy(routeKey, `${routeKey}-route`)}>{copied === `${routeKey}-route` ? 'Copiado!' : 'Copiar rota'}</button></div>
    <div className="api-security"><span>🔐 Autenticação: <strong>{endpoint.auth}</strong></span><span>Permissão: <strong>{endpoint.permission}</strong></span></div>
    {endpoint.params && <ApiFieldTable title="Path parameters" fields={endpoint.params} />}
    {endpoint.query && <ApiFieldTable title="Query parameters" fields={endpoint.query} />}
    {endpoint.body && <ApiFieldTable title="Body" fields={endpoint.body} />}
    <ApiCodeBlock title="Exemplo cURL" value={curl} copyKey={`${routeKey}-curl`} copied={copied} onCopy={onCopy} language="bash" />
    {endpoint.request && <ApiCodeBlock title="Exemplo de requisição" value={endpoint.request} copyKey={`${routeKey}-request`} copied={copied} onCopy={onCopy} language="json" />}
    <ApiCodeBlock title="Resposta" value={endpoint.response} copyKey={`${routeKey}-response`} copied={copied} onCopy={onCopy} language="json" />
    <div className="api-statuses"><h4>Status e erros</h4>{endpoint.statuses.map((status) => <span key={status}>{status}</span>)}</div>
  </div>
}

function ApiFieldTable({ title, fields }: { title: string; fields: ApiField[] }) {
  return <div className="api-fields"><h4>{title}</h4><div className="api-fields-grid"><div className="api-fields-row api-fields-header"><span>Campo</span><span>Tipo</span><span>Obrigatório</span><span>Descrição</span></div>{fields.map((item) => <div className="api-fields-row" key={item.name}><strong>{item.name}</strong><code>{item.type}</code><span>{item.required ? 'Sim' : 'Não'}</span><span>{item.description}</span></div>)}</div></div>
}

function ApiCodeBlock({ title, value, copyKey, copied, onCopy, language }: { title: string; value: string; copyKey: string; copied: string | null; onCopy: (value: string, key: string) => void; language: string }) {
  return <div className="api-code-block"><div className="api-code-head"><h4>{title}</h4><button type="button" className="api-copy" onClick={() => void onCopy(value, copyKey)}>{copied === copyKey ? 'Copiado!' : 'Copiar'}</button></div><pre data-language={language}>{value}</pre></div>
}
