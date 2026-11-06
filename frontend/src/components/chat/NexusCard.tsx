import { IconExternalLink } from '../icons'

export interface NexusCardProps {
  url?: string
}

export function NexusCard({ url }: NexusCardProps) {
  const targetUrl = url || import.meta.env.VITE_NEXUS_URL || 'http://localhost:3001'

  return (
    <section className="kx-nexus-banner" aria-label="Konnix Nexus">
      <div className="kx-nexus-identity">
        <img src="/icons/nexus-logo.svg" alt="" className="kx-nexus-icon" />
        <div className="kx-nexus-copy">
          <h2 className="kx-nexus-title">Konnix Nexus</h2>
          <p className="kx-nexus-description">
            Gestão, teste e execução segura de APIs.
          </p>
        </div>
      </div>

      <a
        href={targetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="kx-suits-btn kx-nexus-btn"
      >
        <span>Acessar Konnix Nexus</span>
        <IconExternalLink size={16} />
      </a>
    </section>
  )
}
