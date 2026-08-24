import { useEffect, useState } from 'react'
import { validateKonnixServer, persistServer } from './serverManager'
import type { DesktopServer } from './serverStore'

export default function ServerSetup({ onConnected, onClose, modal = false, initialUrl = '', existingId }: { onConnected: (server: DesktopServer) => void; onClose?: () => void; modal?: boolean; initialUrl?: string; existingId?: string }) {
  const [url, setUrl] = useState(initialUrl)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!modal || !onClose) return
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [modal, onClose])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null); setStatus('Verificando servidor...')
    try { const result = await validateKonnixServer(url); onConnected(persistServer(result.url, result.info, existingId)); setStatus('Servidor Konnix encontrado.') }
    catch (err) { setStatus(null); setError(err instanceof Error ? err.message : 'Não foi possível conectar a este servidor Konnix.') }
  }
  return <div className={modal ? 'server-modal-card' : 'server-setup-screen'}>
    {modal && onClose && <button type="button" className="server-modal-close" onClick={onClose} aria-label="Fechar">×</button>}
    <img src="/icons/Konnix white.png" alt="Konnix" className="server-setup-logo" />
    <h1>{modal ? 'Adicionar servidor' : 'Konnix Chat'}</h1>
    {!modal && <p>Digite a URL do servidor</p>}
    <form onSubmit={submit} className="server-setup-form">
      <label>URL do servidor<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://chat.exemplo.gov.br" required /></label>
      {status && <p className="server-status">{status}</p>}
      {error && <p className="form-error">{error}</p>}
      <button className="btn-primary" type="submit" disabled={Boolean(status)}>{status ? 'Verificando...' : 'Conectar'}</button>
    </form>
  </div>
}
