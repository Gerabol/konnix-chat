import {
  IconExternalLink,
  IconMerge,
  IconSplit,
  IconSpreadsheet,
  IconSpreadsheetCheck,
} from '../icons'

export interface SuiteCardProps {
  url?: string
}

const suiteTools = [
  {
    id: 'validacao_ne',
    title: 'Validar NE',
    description: 'Notas de Empenho',
    Icon: IconSpreadsheetCheck,
  },
  {
    id: 'validacao_np',
    title: 'Validar NP',
    description: 'Notas de Pagamento',
    Icon: IconSpreadsheet,
  },
  {
    id: 'divisao',
    title: 'Dividir Planilha',
    description: 'Separe em lotes',
    Icon: IconSplit,
  },
  {
    id: 'pdf_merge',
    title: 'Juntar PDF',
    description: 'Combine documentos',
    Icon: IconMerge,
  },
]

function buildToolUrl(baseUrl: string, toolId: string) {
  try {
    const url = new URL(baseUrl)
    url.searchParams.set('ferramenta', toolId)
    return url.toString()
  } catch {
    const separator = baseUrl.includes('?') ? '&' : '?'
    return `${baseUrl}${separator}ferramenta=${encodeURIComponent(toolId)}`
  }
}

export function SuiteCard({ url }: SuiteCardProps) {
  const targetUrl = url || import.meta.env.VITE_AUTOMACAO_PLANILHAS_URL || 'http://localhost:5173'

  return (
    <section className="kx-suite-card" aria-label="Konnix Suite">
      <header className="kx-suite-head">
        <div className="kx-suite-identity">
          <div className="kx-suite-icon-wrap" aria-hidden="true">
            <img src="/icons/suite-logo.svg" alt="" className="kx-suite-icon" />
          </div>
          <div className="kx-suite-copy">
            <h2 className="kx-suite-title">Konnix Suite</h2>
            <p className="kx-suite-description">
              Automação inteligente de planilhas e documentos.
            </p>
          </div>
        </div>
      </header>

      <div className="kx-suite-tools">
        {suiteTools.map(({ id, title, description, Icon }) => (
          <a
            key={id}
            href={buildToolUrl(targetUrl, id)}
            target="_blank"
            rel="noopener noreferrer"
            className="kx-suite-tool"
            aria-label={`${title} no Konnix Suite`}
          >
            <span className="kx-suite-tool-icon" aria-hidden="true">
              <Icon size={18} />
            </span>
            <span className="kx-suite-tool-copy">
              <span className="kx-suite-tool-title">{title}</span>
              <span className="kx-suite-tool-description">{description}</span>
            </span>
            <span className="kx-suite-tool-arrow" aria-hidden="true">
              <IconExternalLink size={13} />
            </span>
          </a>
        ))}
      </div>

      <div className="kx-suite-footer">
        <a
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="kx-suits-btn"
        >
          <span>Acessar Konnix Suite</span>
          <IconExternalLink size={16} />
        </a>
      </div>
    </section>
  )
}
