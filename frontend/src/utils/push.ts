import { api } from '../api.ts'
import { isTauri } from '../platform.ts'

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/')
  const normalized = padded.padEnd(Math.ceil(padded.length / 4) * 4, '=')
  const binary = atob(normalized)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    !isTauri &&
    'PushManager' in window &&
    'Notification' in window &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator
  )
}

export const INSECURE_CONTEXT_MESSAGE =
  'Notificações push exigem HTTPS (ou localhost). O endereço que você abriu não é seguro, então o navegador não registra o aplicativo.'

export type PushSyncResult = { ok: true } | { ok: false; reason: string }

export const PUSH_SUBSCRIBE_ATTEMPTS = 3

const PUSH_RETRY_DELAYS_MS = [500, 1500]

/**
 * `AbortError` na inscrição costuma ser transitório: o navegador encerra a
 * tentativa quando o service worker é atualizado (`skipWaiting`) no meio da
 * operação, ou quando o serviço de push demora a responder. Nesses casos
 * repetir funciona; nos demais, a causa é definitiva e insistir só piora.
 */
export function shouldRetryPushSubscription(err: unknown, attempt: number, maxAttempts = PUSH_SUBSCRIBE_ATTEMPTS): boolean {
  if (attempt + 1 >= maxAttempts) return false
  return err instanceof Error && err.name === 'AbortError'
}

export function pushRetryDelayMs(attempt: number): number {
  return PUSH_RETRY_DELAYS_MS[Math.min(attempt, PUSH_RETRY_DELAYS_MS.length - 1)]
}

export const BRAVE_PUSH_STEPS = [
  'Abra brave://settings/privacy',
  'Ative "Usar serviços do Google para mensagens push"',
  'Recarregue a página e clique em "Ativar" de novo',
] as const

const PUSH_HOSTS =
  'Chrome, Edge e Brave precisam de fcm.googleapis.com e android.googleapis.com; o Firefox usa updates.push.services.mozilla.com; o Safari usa web.push.apple.com.'

/**
 * O Web Push do Chromium (Chrome, Edge, Brave) trafega pelos servidores do
 * Google, e o Brave ainda bloqueia esses endpoints por padrão. Alguns
 * navegadores escondem a identidade no user agent, então os passos do Brave
 * entram também no texto genérico: é a causa mais frequente aqui dentro.
 */
export function pushServiceHints(userAgent = ''): string {
  const ua = userAgent.toLowerCase()
  const steps = BRAVE_PUSH_STEPS.map((step, index) => `${index + 1}. ${step}`).join(' ')
  // Brave precisa ser testado antes de Chrome: o user agent dele também contém "chrome".
  if (ua.includes('brave/')) {
    return `O Brave usa os servidores do Google para Web Push e os bloqueia por padrão. Para corrigir: ${steps} Se preferir não alterar o navegador, use o Chrome ou o Firefox.`
  }
  if (ua.includes('firefox/')) {
    return `Verifique se updates.push.services.mozilla.com não está bloqueado na rede. Se usar o Brave, também é preciso ativar os servidores do Google.`
  }
  if (ua.includes('edg/') || ua.includes('chrome/')) {
    return `Verifique se fcm.googleapis.com e android.googleapis.com não estão bloqueados na rede. Se usar o Brave: ${steps}`
  }
  if (/safari|iphone|ipad/.test(ua)) {
    return 'No Safari e no iOS o push só funciona no aplicativo instalado na tela inicial.'
  }
  return `Verifique se a rede permite o serviço de push. ${PUSH_HOSTS} Se usar o Brave: ${steps}`
}

/**
 * Traduz o erro do navegador em uma causa reconhecível. O `name` da
 * DOMException é a única informação que o PushManager entrega, e cada um
 * significa uma correção diferente para quem usa o aplicativo.
 */
export function describePushError(err: unknown, userAgent = ''): string {
  const name = err instanceof Error ? err.name : ''
  switch (name) {
    case 'NotAllowedError':
      return 'O navegador bloqueou a inscrição em push. Em iPhone e iPad isso só funciona no aplicativo instalado na tela inicial, e em janela anônima não funciona. Confira também se o endereço está em HTTPS.'
    case 'NotSupportedError':
      return 'Este navegador não oferece Web Push. Use Chrome, Edge ou Firefox em uma janela normal.'
    case 'InvalidStateError':
      return 'Já existe uma inscrição feita com outra chave de servidor. Recarregue a página e ative novamente.'
    case 'AbortError':
      return `O navegador não conseguiu concluir a inscrição no serviço de push. ${pushServiceHints(userAgent)}`
    case 'TypeError':
      return 'A chave pública de push do servidor está inválida. Avise o suporte técnico.'
    default: {
      const message = err instanceof Error ? err.message : ''
      return message ? `Falha ao registrar o push: ${message}` : 'Falha ao registrar o push no navegador.'
    }
  }
}

/** Espera a atualização do service worker terminar: subscribe() aborta durante ela. */
function waitForRegistrationSettled(registration: ServiceWorkerRegistration): Promise<void> {
  const pending = registration.installing || registration.waiting
  if (!pending) return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => resolve()
    pending.addEventListener('statechange', () => {
      if (pending.state === 'activated' || pending.state === 'redundant') finish()
    })
    // Não segura a interface se o worker travar em um estado intermediário.
    setTimeout(finish, 5000)
  })
}

async function subscribeWithRetry(
  registration: ServiceWorkerRegistration,
  applicationServerKey: Uint8Array<ArrayBuffer>,
): Promise<PushSubscription> {
  let lastError: unknown
  for (let attempt = 0; attempt < PUSH_SUBSCRIBE_ATTEMPTS; attempt++) {
    await waitForRegistrationSettled(registration)
    try {
      return await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
    } catch (err) {
      lastError = err
      if (!shouldRetryPushSubscription(err, attempt)) throw err
      await new Promise((resolve) => setTimeout(resolve, pushRetryDelayMs(attempt)))
    }
  }
  throw lastError
}

let syncInProgress: Promise<PushSyncResult> | null = null

/**
 * Retorna true se houver uma subscrição push ativa no PushManager do navegador.
 */
export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}

/**
 * Sincroniza e garante que o dispositivo esteja registrado para receber notificações push.
 * Se a permissão já foi concedida, valida se a chave pública do servidor corresponde à da subscrição.
 * Se as chaves divergirem ou se não houver subscrição ativa, renova a subscrição transparentemente.
 * Utiliza trava em memória (mutex) para impedir concorrência entre eventos paralelos (ex: foco + montagem).
 * Em caso de falha devolve a causa, e não apenas "não deu certo", para que a interface
 * possa orientar quem está tentando ativar.
 */
export async function syncPushSubscription(): Promise<PushSyncResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: 'Este navegador não suporta notificações do sistema.' }
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    // Sem contexto seguro o service worker nunca registra e o PushManager não existe.
    return { ok: false, reason: INSECURE_CONTEXT_MESSAGE }
  }
  if (Notification.permission !== 'granted') {
    return { ok: false, reason: 'A permissão de notificação ainda não foi concedida ao site.' }
  }

  if (syncInProgress) {
    console.log('[Push Client] Sincronização já em andamento, aguardando conclusão...')
    return syncInProgress
  }

  syncInProgress = (async (): Promise<PushSyncResult> => {
    try {
      console.log('[Push Client] Iniciando validação da subscrição Web Push...')
      const reg = await navigator.serviceWorker.ready
      const keyData = await api.pushPublicKey()
      if (!keyData?.publicKey) {
        console.warn('[Push Client] Servidor não retornou chave pública VAPID.')
        return { ok: false, reason: 'O servidor não devolveu a chave pública de push (KONNIX_VAPID_PUBLIC_KEY).' }
      }

      const serverKeyBytes = urlBase64ToUint8Array(keyData.publicKey)
      let sub = await reg.pushManager.getSubscription()
      console.log('[Push Client] Subscrição atual no navegador:', sub ? sub.endpoint : 'nenhuma')

      if (sub) {
        const currentRawKey = sub.options.applicationServerKey
        let keyMatches = false
        if (currentRawKey) {
          const currentKeyBytes = new Uint8Array(currentRawKey)
          if (currentKeyBytes.length === serverKeyBytes.length) {
            keyMatches = currentKeyBytes.every((b, i) => b === serverKeyBytes[i])
          }
        }

        if (!keyMatches) {
          console.log('[Push Client] Chave VAPID alterada. Renovando subscrição push...')
          await sub.unsubscribe().catch(() => undefined)
          sub = await subscribeWithRetry(reg, serverKeyBytes)
          console.log('[Push Client] Nova subscrição criada:', sub.endpoint)
        }
      } else {
        console.log('[Push Client] Nenhuma subscrição ativa encontrada. Inscrevendo no PushManager...')
        sub = await subscribeWithRetry(reg, serverKeyBytes)
        console.log('[Push Client] Subscrição criada:', sub.endpoint)
      }

      if (sub) {
        await api.pushSubscribe({
          endpoint: sub.endpoint,
          p256dh: uint8ArrayToBase64Url(new Uint8Array(sub.getKey('p256dh') ?? new ArrayBuffer(0))),
          auth: uint8ArrayToBase64Url(new Uint8Array(sub.getKey('auth') ?? new ArrayBuffer(0))),
        })
        console.log('[Push Client] Subscrição salva com sucesso no backend:', sub.endpoint)
        try {
          localStorage.setItem('konnix-system-notifications', 'true')
        } catch {
          /* ignore */
        }
        return { ok: true }
      }
      return { ok: false, reason: 'O navegador não devolveu a inscrição de push.' }
    } catch (err) {
      console.warn('[Push Client] Falha na sincronização da subscrição push:', err)
      return { ok: false, reason: describePushError(err, navigator.userAgent) }
    } finally {
      syncInProgress = null
    }
  })()

  return syncInProgress
}

/**
 * Desinscreve o dispositivo das notificações push no navegador e no backend.
 */
export async function unsubscribePush(): Promise<void> {
  if (!isPushSupported()) return

  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      try {
        await api.pushUnsubscribe(sub.endpoint)
      } catch {
        /* best-effort */
      }
      await sub.unsubscribe().catch(() => undefined)
    }
    try {
      localStorage.setItem('konnix-system-notifications', 'false')
    } catch {
      /* ignore */
    }
  } catch (err) {
    console.warn('Falha ao desinscrever notificações push:', err)
  }
}

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'konnix:push-subscription-change') {
      console.log('[Push Client] Recebido aviso de push-subscription-change do Service Worker. Sincronizando...')
      void syncPushSubscription().catch(() => undefined)
    }
  })
}
