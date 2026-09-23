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

let syncInProgress: Promise<boolean> | null = null

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
 */
export async function syncPushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false
  if (Notification.permission !== 'granted') return false

  if (syncInProgress) {
    console.log('[Push Client] Sincronização já em andamento, aguardando conclusão...')
    return syncInProgress
  }

  syncInProgress = (async () => {
    try {
      console.log('[Push Client] Iniciando validação da subscrição Web Push...')
      const reg = await navigator.serviceWorker.ready
      const keyData = await api.pushPublicKey()
      if (!keyData?.publicKey) {
        console.warn('[Push Client] Servidor não retornou chave pública VAPID.')
        return false
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
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: serverKeyBytes,
          })
          console.log('[Push Client] Nova subscrição criada:', sub.endpoint)
        }
      } else {
        console.log('[Push Client] Nenhuma subscrição ativa encontrada. Inscrevendo no PushManager...')
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: serverKeyBytes,
        })
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
        return true
      }
    } catch (err) {
      console.warn('[Push Client] Falha na sincronização da subscrição push:', err)
    } finally {
      syncInProgress = null
    }
    return false
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
