import { IconMessage } from '../icons'
import { AboutDetails } from '../modals/AboutModal'

export function EmptyState({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  return (
    <div className="empty-state">
      <img src="/icons/icon-192.png" alt="Konnix" className="empty-logo" />
      <h2>Konnix Chat</h2>
      <p>Comunicação corporativa segura e em tempo real.</p>
      <button type="button" className="btn-primary empty-chat-action" onClick={onOpenSidebar}>
        <IconMessage size={18} />
        <span>Conversar</span>
      </button>
      <AboutDetails className="empty-about-details" />
    </div>
  )
}
