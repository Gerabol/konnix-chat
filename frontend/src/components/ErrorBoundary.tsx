import React, { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Konnix ErrorBoundary] Erro capturado na interface:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="app-splash"
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '2rem',
            textAlign: 'center',
            minHeight: '100vh',
            background: 'var(--konnix-bg)',
            color: 'var(--konnix-ink)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
            Ocorreu uma instabilidade inesperada
          </h2>
          <p
            style={{
              margin: 0,
              maxWidth: '440px',
              fontSize: '0.9rem',
              color: 'var(--konnix-ink-soft)',
              lineHeight: 1.5,
            }}
          >
            O aplicativo encontrou um problema ao atualizar os dados após um período inativo.
            Clique no botão abaixo para restaurar a sessão normalmente.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={this.handleReload}
            style={{ marginTop: '0.5rem' }}
          >
            Recarregar aplicativo
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
