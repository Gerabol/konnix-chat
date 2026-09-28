import { useEffect, useState } from 'react'
import { desktopAutostartEnabled, isTauri, setDesktopAutostart } from '../../platform'

export function AutostartButton() {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isTauri) return
    void desktopAutostartEnabled().then(setEnabled).catch(() => undefined)
  }, [])

  if (!isTauri) return null

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      await setDesktopAutostart(!enabled)
      setEnabled(!enabled)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className="user-menu-item user-menu-action message-notifications-toggle"
      onClick={() => void toggle()}
      disabled={busy}
    >
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
      <span>Iniciar com o Windows</span>
      <small>{enabled ? 'Ativo' : 'Desativado'}</small>
    </button>
  )
}
