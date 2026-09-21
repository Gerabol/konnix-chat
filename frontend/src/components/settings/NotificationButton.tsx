import { useEffect, useState } from 'react'
import { api, ApiError } from '../../api'
import { isTauri } from '../../platform'
import { IconBell } from '../icons'

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/')
  const normalized = padded.padEnd(Math.ceil(padded.length / 4) * 4, '=')
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
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

export function NotificationButton() {
  const [supported] = useState(
    () => !isTauri && 'PushManager' in window && 'Notification' in window && 'serviceWorker' in navigator,
  )
  const [subscribed, setSubscribed] = useState(false)
  const [nativeOn, setNativeOn] = useState(() => {
    try {
      return localStorage.getItem('konnix-system-notifications') === 'true'
    } catch {
      return false
    }
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supported) return
    let active = true
    navigator.serviceWorker
      .ready.then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (active) setSubscribed(!!sub)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [supported])

  const enable = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (!supported) {
        setError('Seu navegador não suporta notificações do sistema.')
        return
      }
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setError('Permissão de notificação negada no navegador. Desbloqueie as notificações do site nas configurações do navegador para ativar esta opção.')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const key = await api.pushPublicKey()
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key.publicKey),
      })
      await api.pushSubscribe({
        endpoint: sub.endpoint,
        p256dh: uint8ArrayToBase64Url(new Uint8Array(sub.getKey('p256dh') ?? new ArrayBuffer(0))),
        auth: uint8ArrayToBase64Url(new Uint8Array(sub.getKey('auth') ?? new ArrayBuffer(0))),
      })
      try {
        localStorage.setItem('konnix-system-notifications', 'true')
      } catch {
        /* preferência opcional */
      }
      setSubscribed(true)
      setNativeOn(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao ativar')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
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
        /* preferência opcional */
      }
      setSubscribed(false)
      setNativeOn(false)
    } finally {
      setBusy(false)
    }
  }

  const toggleNative = async () => {
    if (busy) return
    const next = !nativeOn
    setBusy(true)
    setError(null)
    try {
      try {
        localStorage.setItem('konnix-system-notifications', String(next))
      } catch {
        /* preferência opcional */
      }
      setNativeOn(next)
    } finally {
      setBusy(false)
    }
  }

  const on = isTauri ? nativeOn : subscribed

  return (
    <div className="user-menu-item notification-row">
      <IconBell />
      <span className="notification-label">Notificações</span>
      {busy ? (
        <span className="status-pill">Processando…</span>
      ) : (
        <button
          type="button"
          className={`status-pill message-notification-toggle ${on ? 'notification-toggle-off' : 'notification-toggle-on'}`}
          onClick={isTauri ? toggleNative : on ? disable : enable}
          aria-pressed={on}
          title={on ? 'Desativar notificações' : 'Ativar notificações'}
        >
          {on ? 'Desativar' : 'Ativar'}
        </button>
      )}
      {error && <span className="notif-error">{error}</span>}
    </div>
  )
}
