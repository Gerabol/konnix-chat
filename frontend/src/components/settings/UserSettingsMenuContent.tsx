import { isTauri } from '../../platform'
import { isMobilePlatform } from '../../utils/pwa'
import type { User } from '../../api'
import {
  IconAlertTriangle,
  IconDownload,
  IconInfo,
  IconLogout,
  IconShield,
  PaletteIcon,
  PersonIcon,
} from '../icons'
import { AutostartButton } from './AutostartButton'
import { NotificationButton } from './NotificationButton'

export function UserSettingsMenuContent({
  me,
  onTheme,
  onEditProfile,
  onReportIssue,
  onAbout,
  onLogout,
  onClose,
  onInstallApp,
  standalone,
  appInstalled,
}: {
  me: User
  onTheme: () => void
  onEditProfile: () => void
  onReportIssue: () => void
  onAbout: () => void
  onLogout: () => void
  onClose: () => void
  onInstallApp?: () => void
  standalone?: boolean
  appInstalled?: boolean
}) {
  return (
    <>
      <div className="menu-label">Configurações</div>
      <NotificationButton />
      <AutostartButton />
      <button
        type="button"
        className="user-menu-item user-menu-action"
        onClick={() => {
          onClose()
          onTheme()
        }}
      >
        <PaletteIcon />
        <span>Tema</span>
      </button>
      <button
        type="button"
        className="user-menu-item user-menu-action"
        onClick={() => {
          onClose()
          onEditProfile()
        }}
      >
        <PersonIcon size={16} />
        <span>Editar meu perfil</span>
      </button>
      <button
        type="button"
        className="user-menu-item user-menu-action"
        onClick={() => {
          onClose()
          onReportIssue()
        }}
      >
        <IconAlertTriangle size={16} />
        <span>Relatar Problema</span>
      </button>
      {!isTauri && !isMobilePlatform() && !standalone && !appInstalled && onInstallApp && (
        <button
          type="button"
          className="user-menu-item user-menu-action"
          onClick={() => {
            onClose()
            onInstallApp()
          }}
        >
          <IconDownload size={16} />
          <span style={{ flex: 1 }}>Baixar aplicativo</span>
        </button>
      )}
      <button
        type="button"
        className="user-menu-item user-menu-action"
        onClick={() => {
          onClose()
          onAbout()
        }}
      >
        <IconInfo size={16} />
        <span>Sobre</span>
      </button>
      {me.roles.includes('ADMIN') && (
        <button
          type="button"
          className="user-menu-item user-menu-action"
          onClick={() => {
            onClose()
            window.history.pushState({}, '', '/admin')
            window.dispatchEvent(new PopStateEvent('popstate'))
          }}
        >
          <IconShield size={16} />
          <span>Administração</span>
        </button>
      )}
      <button
        type="button"
        className="user-menu-item user-menu-action user-menu-logout"
        onClick={() => onLogout()}
      >
        <IconLogout size={16} />
        <span>Sair</span>
      </button>
    </>
  )
}
