import { useEffect, useState } from 'react'
import { ApiError } from '../../api'
import { isTauri } from '../../platform'
import { IconBell } from '../icons'
import { isPushSupported, syncPushSubscription, unsubscribePush } from '../../utils/push'

export { urlBase64ToUint8Array, uint8ArrayToBase64Url } from '../../utils/push'

export function NotificationButton() {
  const [supported] = useState(() => isPushSupported())
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
      const success = await syncPushSubscription()
      if (success) {
        setSubscribed(true)
        setNativeOn(true)
      } else {
        setError('Não foi possível registrar as notificações push no servidor.')
      }
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
      await unsubscribePush()
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
