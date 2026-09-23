import { memo, useState } from 'react'
import { IconBell } from '../icons'
import { isPushSupported, syncPushSubscription } from '../../utils/push'

export interface SidebarNotificationCardProps {
  onDismiss: () => void
  onActivated?: () => void
}

export const SidebarNotificationCard = memo(function SidebarNotificationCard({
  onDismiss,
  onActivated,
}: SidebarNotificationCardProps) {
  const [busy, setBusy] = useState(false)

  const handleEnable = async () => {
    if (busy || !isPushSupported()) return
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm === 'granted') {
        const success = await syncPushSubscription()
        if (success) {
          onActivated?.()
        }
      } else {
        onDismiss()
      }
    } catch {
      onDismiss()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sidebar-install-card" role="region" aria-label="Ativação de notificações">
      <button
        type="button"
        className="sidebar-install-dismiss"
        aria-label="Dispensar aviso de notificações"
        title="Dispensar"
        onClick={onDismiss}
      >
        ×
      </button>
      <div className="sidebar-install-copy">
        <strong>Ativar notificações</strong>
        <span>Receba mensagens em segundo plano</span>
      </div>
      <button
        type="button"
        className="btn-primary sidebar-install-btn"
        title="Ativar notificações push"
        aria-label="Ativar notificações push"
        disabled={busy}
        onClick={handleEnable}
        style={{ minWidth: '40px', height: '32px', padding: '0 8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
      >
        <IconBell size={14} />
        <span>{busy ? '…' : 'Ativar'}</span>
      </button>
    </div>
  )
})
