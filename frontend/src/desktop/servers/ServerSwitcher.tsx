import { memo, useEffect, useState } from 'react'
import ServerSetup from './ServerSetup'
import { removeDesktopServer } from './serverManager'
import type { DesktopServer } from './serverStore'

function ServerSwitcher({ servers, activeId, onChange, onServersChange, onAbout }: { servers: DesktopServer[]; activeId: string | null; onChange: (server: DesktopServer) => void; onServersChange: (servers: DesktopServer[]) => void; onAbout: () => void }) {
  const [adding, setAdding] = useState(false)
  const [menu, setMenu] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<DesktopServer | null>(null)
  useEffect(() => {
    const closeMenu = () => setMenu(null)
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(null)
        setRemoveTarget(null)
      }
    }
    window.addEventListener('pointerdown', closeMenu)
    window.addEventListener('keydown', closeWithEscape)
    return () => {
      window.removeEventListener('pointerdown', closeMenu)
      window.removeEventListener('keydown', closeWithEscape)
    }
  }, [])
  const remove = () => {
    if (!removeTarget) return
    const removedId = removeTarget.id
    const remaining = servers.filter((item) => item.id !== removedId)
    removeDesktopServer(removedId)
    onServersChange(remaining)
    if (removedId === activeId && remaining[0]) onChange(remaining[0])
    setRemoveTarget(null)
  }
  const reload = (server: DesktopServer) => {
    onChange(server)
    window.location.reload()
  }
  return <aside className="desktop-server-rail" aria-label="Servidores Konnix">
    {servers.map((server) => <div className="desktop-server-entry" key={server.id}>
      <button className={`desktop-server-button ${server.id === activeId ? 'active' : ''}`} title={`${server.name} - ${server.url}`} onClick={() => onChange(server)}><img src="/icons/Konnix white.png" alt={server.name} /></button>
      <button type="button" className="desktop-server-menu" aria-label={`Opções de ${server.name}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => setMenu(menu === server.id ? null : server.id)}>⋮</button>
      {menu === server.id && <div className="desktop-server-context" onPointerDown={(event) => event.stopPropagation()}><strong>{server.name}</strong><button type="button" onClick={() => reload(server)}>↻<span>Recarregamento Forçado</span></button><button type="button" className="destructive" onClick={() => { setRemoveTarget(server); setMenu(null) }}>▣<span>Remover Servidor</span></button><button type="button" onClick={() => { setMenu(null); onAbout() }}>ⓘ<span>Sobre</span></button></div>}
    </div>)}
    <button className="desktop-server-add" title="Adicionar servidor" onClick={() => setAdding(true)}>+</button>
    {adding && <div className="server-modal-backdrop"><ServerSetup modal onClose={() => setAdding(false)} onConnected={(server) => { onChange(server); setAdding(false) }} /></div>}
    {removeTarget && <div className="server-modal-backdrop"><div className="server-confirm-card"><button type="button" className="server-modal-close" onClick={() => setRemoveTarget(null)} aria-label="Fechar">×</button><h2>Remover servidor?</h2><p>Tem certeza que deseja remover este servidor deste aplicativo?</p><div className="server-confirm-actions"><button type="button" className="desktop-secondary" onClick={() => setRemoveTarget(null)}>Cancelar</button><button type="button" className="desktop-danger" onClick={remove}>Remover</button></div></div></div>}
  </aside>
}

export default memo(ServerSwitcher)
