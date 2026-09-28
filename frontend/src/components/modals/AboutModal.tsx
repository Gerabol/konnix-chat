import { Modal } from './Modal'

export function AboutDetails({ className = '' }: { className?: string }) {
  return (
    <dl className={`about-details ${className}`}>
      <div>
        <dt>Ano de criação</dt>
        <dd>2026</dd>
      </div>
      <div>
        <dt>Desenvolvedor</dt>
        <dd>Geraldo Valencia</dd>
      </div>
      <div>
        <dt>Colaboradores</dt>
        <dd>Anderson Fabião, Kevin Kilmer, Sérgio Cauã e Matheus Bruno</dd>
      </div>
      <div>
        <dt>Local</dt>
        <dd>João Pessoa - Brasil</dd>
      </div>
    </dl>
  )
}

export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Sobre o Konnix Chat" onClose={onClose} className="about-modal">
      <div className="about-content">
        <img src="/icons/icon-192.png" alt="Konnix Chat" className="about-logo" />
        <h2>Konnix Chat</h2>
        <p className="about-version">Versão 1.0.0</p>
        <AboutDetails />
      </div>
    </Modal>
  )
}

export default AboutModal
