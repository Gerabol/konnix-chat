import { IconMessage } from '../icons'
import { SuiteCard } from './SuiteCard'
import { NexusCard } from './NexusCard'

export interface EmptyStateProps {
  onOpenSidebar?: () => void
}

export function EmptyState({ onOpenSidebar }: EmptyStateProps) {
  return (
    <div className="kx-empty-state-wrap">
      <div className="kx-empty-state-center">
        {onOpenSidebar && (
          <button
            type="button"
            className="btn-primary empty-chat-action"
            onClick={onOpenSidebar}
            aria-label="Abrir conversas"
          >
            <IconMessage size={18} />
            <span>Conversar</span>
          </button>
        )}
        <div className="kx-empty-state-stack">
          <SuiteCard />
          <NexusCard />
        </div>
      </div>

      <footer className="kx-empty-state-footer">
        Konnix © 2026 · Geraldo Valencia &amp; Colaboradores
      </footer>
    </div>
  )
}
