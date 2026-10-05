import { useEffect, useState } from 'react'
import { isDarkTheme, readThemeCookie, cachedTheme } from '../../utils/theme'
import type { Theme } from '../../api'

export interface AppLoadingScreenProps {
  message?: string
  subMessage?: string
  slowNoticeTimeout?: number
  slowMessage?: string
  fullscreen?: boolean
  className?: string
}

export function AppLoadingScreen({
  message = 'Carregando o Konnix Chat…',
  subMessage,
  slowNoticeTimeout = 10000,
  slowMessage = 'Sua conexão parece estar um pouco lenta. Aguarde só mais um momento…',
  fullscreen = true,
  className = '',
}: AppLoadingScreenProps) {
  const [isSlow, setIsSlow] = useState(false)
  const [showReload, setShowReload] = useState(false)

  const currentTheme = (readThemeCookie() || cachedTheme() || 'DEFAULT') as Theme
  const isDark = isDarkTheme(currentTheme)
  const logoSrc = isDark ? '/icons/Konnix dark.png' : '/icons/Konnix white.png'

  useEffect(() => {
    if (!slowNoticeTimeout || slowNoticeTimeout <= 0) return
    const timer = setTimeout(() => setIsSlow(true), slowNoticeTimeout)
    const reloadTimer = setTimeout(() => setShowReload(true), 25000)
    return () => {
      clearTimeout(timer)
      clearTimeout(reloadTimer)
    }
  }, [slowNoticeTimeout])

  return (
    <div
      className={`kx-loading-screen ${fullscreen ? 'fullscreen' : ''} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div className="kx-loading-card">
        <div className="kx-loading-brand">
          <div className="kx-loading-logo-wrap" aria-hidden="true">
            <img
              src={logoSrc}
              alt="Konnix"
              className="kx-loading-logo"
              width={56}
              height={56}
            />
          </div>
          <div className="kx-loading-wordmark">
            <strong className="kx-loading-title">Konnix</strong>
            <span className="kx-loading-subtitle">Chat</span>
          </div>
        </div>

        <div className="kx-loading-bar-wrap" aria-hidden="true">
          <div className="kx-loading-bar"></div>
        </div>

        <div className="kx-loading-message">{message}</div>
        {subMessage && <div className="kx-loading-submessage">{subMessage}</div>}

        {isSlow && (
          <div className="kx-loading-slow-card">
            <svg className="kx-loading-slow-icon" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>{slowMessage}</span>
          </div>
        )}

        {showReload && (
          <button
            type="button"
            className="kx-loading-reload-btn"
            onClick={() => window.location.reload()}
          >
            Tentar recarregar
          </button>
        )}
      </div>
    </div>
  )
}
export default AppLoadingScreen
