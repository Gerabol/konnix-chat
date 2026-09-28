import { Modal } from './Modal'
import { IconDownload } from '../icons'
import { detectPlatform } from '../../utils/pwa'
import type { BeforeInstallPromptEvent } from '../../hooks/usePwaInstall'

export type { BeforeInstallPromptEvent }

export function DownloadAppModal({
  onClose,
  installEvent,
  onInstall,
  isInstalled,
}: {
  onClose: () => void
  installEvent: BeforeInstallPromptEvent | null
  onInstall: () => Promise<boolean> | void
  isInstalled?: boolean
}) {
  const platform = detectPlatform()

  return (
    <Modal title="Instalar Aplicativo" onClose={onClose} className="download-app-modal">
      <div className="download-app-body">
        <div className="download-app-hero">
          <img src="/icons/icon-192.png" alt="Konnix Chat" className="download-app-logo" />
          <div className="download-app-hero-text">
            <h3>Konnix Chat</h3>
            <p>Instale no seu dispositivo para acesso rápido em tela cheia e notificações instantâneas.</p>
          </div>
        </div>

        {isInstalled ? (
          <div className="download-app-installed">
            <div className="download-app-installed-notice" role="status">
              <span className="download-app-installed-check" aria-hidden="true">✓</span>
              <span>O Konnix Chat já está instalado neste dispositivo.</span>
            </div>
            <div className="download-platform-card">
              <div className="download-platform-header">
                <span className="download-platform-badge">
                  {platform === 'ios' ? 'iPhone / iPad' : platform === 'android' ? 'Android' : 'Computador'}
                </span>
                <strong>Como abrir o aplicativo</strong>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: '1.5', color: 'var(--konnix-ink-soft)' }}>
                {platform === 'ios' ? (
                  <>Volte para a <strong>Tela de Início</strong> do seu iPhone/iPad e toque no ícone do <strong>Konnix Chat</strong> para abrir o aplicativo instalado.</>
                ) : platform === 'android' ? (
                  <>Volte para a <strong>Tela de Início</strong> (ou abra a <strong>gaveta de aplicativos</strong>) e toque no ícone do <strong>Konnix Chat</strong> para abrir o aplicativo instalado.</>
                ) : (
                  <>Abra o <strong>Konnix Chat</strong> pelo atalho criado no <strong>menu Iniciar</strong>, na <strong>barra de tarefas</strong> ou na <strong>área de trabalho</strong> para abrir o aplicativo instalado.</>
                )}
              </p>
            </div>
          </div>
        ) : installEvent ? (
          <div className="download-app-cta-box">
            <button
              type="button"
              className="btn-primary download-app-install-btn"
              onClick={async () => {
                await onInstall()
                onClose()
              }}
            >
              <IconDownload size={18} />
              <span>Instalar com 1 Clique</span>
            </button>
            <small>Instalação nativa direta no seu dispositivo</small>
          </div>
        ) : platform === 'ios' ? (
          <div className="download-platform-card">
            <div className="download-platform-header">
              <span className="download-platform-badge">iPhone / iPad</span>
              <strong>Como instalar no Safari</strong>
            </div>
            <ol className="download-ios-steps" style={{ margin: '8px 0 0', paddingLeft: '1.2rem', fontSize: '0.82rem', lineHeight: '1.55', color: 'var(--konnix-ink-soft)' }}>
              <li>Toque no ícone de <strong>Compartilhar</strong> (quadrado com seta ⎋ na barra inferior do Safari).</li>
              <li>Role para baixo e selecione <strong>&ldquo;Adicionar à Tela de Início&rdquo;</strong> (⊕).</li>
              <li>Toque em <strong>&ldquo;Adicionar&rdquo;</strong> no topo direito para confirmar.</li>
            </ol>
          </div>
        ) : platform === 'android' ? (
          <div className="download-platform-card">
            <div className="download-platform-header">
              <span className="download-platform-badge">Android</span>
              <strong>Como instalar no Chrome</strong>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: '0.82rem', lineHeight: '1.5', color: 'var(--konnix-ink-soft)' }}>
              Toque no menu <strong>(⋮)</strong> no canto superior do navegador e selecione <strong>&ldquo;Instalar aplicativo&rdquo;</strong> ou <strong>&ldquo;Adicionar à tela inicial&rdquo;</strong>.
            </p>
            <small style={{ color: 'var(--konnix-ink-soft)', display: 'block', opacity: 0.85 }}>
              Dica: Se abriu pelo WhatsApp, toque em (⋮) e escolha &ldquo;Abrir no Chrome&rdquo;.
            </small>
          </div>
        ) : (
          <div className="download-platform-card">
            <div className="download-platform-header">
              <span className="download-platform-badge">Computador</span>
              <strong>Como instalar no Navegador</strong>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: '1.5', color: 'var(--konnix-ink-soft)' }}>
              Na barra de endereços do Chrome ou Edge, clique no ícone de instalar <strong>(⊕ Instalar)</strong> ou no menu <strong>(⋮) &gt; &ldquo;Instalar Konnix Chat&rdquo;</strong>.
            </p>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: '4px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default DownloadAppModal
