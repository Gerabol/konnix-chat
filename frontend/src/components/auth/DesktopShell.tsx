import { useState } from 'react'
import type { ReactNode } from 'react'
import ServerSwitcher from '../../desktop/servers/ServerSwitcher'
import type { getDesktopServers } from '../../desktop/servers/serverStore'
import { isTauri } from '../../platform'
import { AboutModal } from '../modals/AboutModal'

export function DesktopShell({
  children,
  servers,
  activeId,
  onChange,
  onServersChange,
}: {
  children: ReactNode
  servers: ReturnType<typeof getDesktopServers>
  activeId: string | null
  onChange: (server: { id: string; url: string }) => void
  onServersChange: (servers: ReturnType<typeof getDesktopServers>) => void
}) {
  const [aboutOpen, setAboutOpen] = useState(false)
  if (!isTauri) return <>{children}</>
  return (
    <div className="desktop-shell">
      <div className="desktop-shell-content">{children}</div>
      <ServerSwitcher
        servers={servers}
        activeId={activeId}
        onChange={onChange}
        onServersChange={onServersChange}
        onAbout={() => setAboutOpen(true)}
      />
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </div>
  )
}
