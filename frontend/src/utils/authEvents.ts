/**
 * Determina se uma resposta 401 deve disparar o evento global de logout (`konnix:auth-unauthorized`).
 *
 * Regras:
 * 1. Falhas em /auth/login (ex: credenciais incorretas) nunca devem derrubar a sessão ou disparar logout.
 * 2. Falhas em /auth/logout ou /push/unsubscribe não devem gerar ciclos de logout reentrante.
 * 3. Endpoints públicos (/api/public/*) não requerem autenticação e não devem desautenticar.
 */
export function shouldDispatchUnauthorized(path?: string): boolean {
  if (!path) return false
  const cleanPath = path.split('?')[0].toLowerCase()

  if (cleanPath.endsWith('/auth/login')) {
    return false
  }

  if (cleanPath.endsWith('/auth/logout') || cleanPath.endsWith('/push/unsubscribe')) {
    return false
  }

  if (cleanPath.includes('/api/public/')) {
    return false
  }

  return true
}
