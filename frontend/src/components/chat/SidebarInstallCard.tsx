import { memo } from 'react'
import { IconDownload } from '../icons'

export interface SidebarInstallCardProps {
  onInstall: () => void
  onDismiss: () => void
}

export const SidebarInstallCard = memo(function SidebarInstallCard({
  onInstall,
  onDismiss,
}: SidebarInstallCardProps) {
  return (
    <div className="sidebar-install-card">
      <button
        type="button"
        className="sidebar-install-dismiss"
        aria-label="Fechar aviso"
        title="Fechar aviso"
        onClick={onDismiss}
      >
        ×
      </button>
      <div className="sidebar-install-copy">
        <strong>Baixar aplicativo</strong>
        <span>Instale o Konnix no seu dispositivo</span>
      </div>
      <button
        type="button"
        className="btn-primary sidebar-install-btn"
        title="Baixar aplicativo"
        aria-label="Baixar aplicativo"
        onClick={onInstall}
      >
        <IconDownload size={16} />
      </button>
    </div>
  )
})
