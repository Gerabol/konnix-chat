import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { api, getAuthToken, setActiveServer, setAuthToken } from './api'
import type { PresenceStatus, Theme, User } from './api'
import ServerSetup from './desktop/servers/ServerSetup'
import { activateDesktopServer } from './desktop/servers/serverManager'
import { getActiveServerId, getDesktopServers } from './desktop/servers/serverStore'
import { isTauri, listenDesktopNotificationAction } from './platform'
import type { Session } from './types'
import { applyTheme, cachedTheme, cacheTheme, clearCachedTheme, readThemeCookie } from './utils/theme'
import { DesktopShell } from './components/auth/DesktopShell'
import { LoginView } from './components/auth/LoginView'
import { RequiredPasswordChangeView } from './components/auth/RequiredPasswordChangeView'
import { ChatView } from './components/chat/ChatView'
import { useMobileViewport } from './hooks/useMobileViewport'

// Re-exports for backwards compatibility
export { AvatarImage, initials } from './components/chat/AvatarImage'
export {
  THEME_OPTIONS,
  applyCookieThemeEarly,
  applyTheme,
  cacheTheme,
  isDarkTheme,
  isWhiteSidebarLogoTheme,
} from './utils/theme'
export { PaletteIcon } from './components/icons'
export { ThemeModal } from './components/modals/ThemeModal'
export { TypingDots } from './components/chat/TypingIndicator'
export type { TypingUser } from './types'

const AdminView = lazy(() => import('./AdminView'))

const initialDesktopServers = isTauri ? getDesktopServers() : []
const initialDesktopId = isTauri ? getActiveServerId() : null
const initialDesktopServer = isTauri
  ? initialDesktopServers.find((server) => server.id === initialDesktopId) ?? initialDesktopServers[0] ?? null
  : null
if (isTauri) setActiveServer(initialDesktopServer?.url ?? null, initialDesktopServer?.id)

export default function App() {
  useMobileViewport()
  const [desktopServers, setDesktopServers] = useState(initialDesktopServers)
  const [activeDesktopId, setActiveDesktopId] = useState<string | null>(initialDesktopServer?.id ?? null)
  const [pathname, setPathname] = useState(() => window.location.pathname)
  const [authInitializing, setAuthInitializing] = useState(() => Boolean(getAuthToken()))
  const [session, setSession] = useState<Session | null>(() => {
    const token = getAuthToken()
    return token ? ({ token, user: null as unknown as User } as Session) : null
  })
  const meRequestRef = useRef<string | null>(null)

  useEffect(() => {
    let dispose: (() => void) | undefined
    void listenDesktopNotificationAction((roomId) => {
      window.dispatchEvent(new CustomEvent('konnix:navigate', { detail: { roomId } }))
    }).then((cleanup) => {
      dispose = cleanup
    })
    return () => dispose?.()
  }, [])

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (!session?.token) {
      setAuthInitializing(false)
      return
    }
    if (session.user) return
    const token = session.token
    if (meRequestRef.current === token) return
    meRequestRef.current = token
    setAuthInitializing(true)
    api
      .me()
      .then((user) => {
        const currentTheme = (readThemeCookie() || cachedTheme() || user.theme || 'DEFAULT') as Theme
        const preservedUser = { ...user, theme: currentTheme }
        cacheTheme(currentTheme)
        applyTheme(currentTheme)
        setSession({ token, user: preservedUser })
      })
      .catch(() => {
        setAuthToken(null)
        setSession(null)
      })
      .finally(() => {
        setAuthInitializing(false)
      })
  }, [session])

  const connectDesktopServer = useCallback((server: { id: string; url: string }) => {
    if (server.id === activeDesktopId && desktopServers.some((entry) => entry.id === server.id)) return
    const activated = activateDesktopServer(server.id)
    if (!activated) return
    setActiveServer(activated.url, activated.id)
    setActiveDesktopId(activated.id)
    setDesktopServers((current) =>
      current.some((entry) => entry.id === activated.id)
        ? current.map((entry) => ({ ...entry, lastUsed: entry.id === activated.id }))
        : [...current, activated].map((entry) => ({ ...entry, lastUsed: entry.id === activated.id })),
    )
    const nextToken = getAuthToken()
    setSession(nextToken ? { token: nextToken, user: null as unknown as User } : null)
    setAuthInitializing(Boolean(nextToken))
  }, [activeDesktopId, desktopServers])

  const handleLogout = useCallback(() => {
    void api.logout().catch(() => undefined)
    void (async () => {
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready
          const sub = await reg.pushManager.getSubscription()
          if (sub) {
            try {
              await api.pushUnsubscribe(sub.endpoint)
            } catch {
              /* best-effort */
            }
            await sub.unsubscribe().catch(() => undefined)
          }
        }
      } catch {
        /* best-effort */
      }
    })()
    setAuthToken(null)
    clearCachedTheme()
    applyTheme('DEFAULT')
    setSession(null)
  }, [])

  const handlePresenceChange = useCallback(async (status: PresenceStatus) => {
    const currentTheme = (readThemeCookie() || cachedTheme() || session?.user?.theme || 'DEFAULT') as Theme
    const user = await api.updatePresence(status)
    const preservedTheme = (currentTheme || user.theme || 'DEFAULT') as Theme
    setSession((current) => (current ? { ...current, user: { ...user, theme: preservedTheme } } : current))
    cacheTheme(preservedTheme)
    applyTheme(preservedTheme)
    return { ...user, theme: preservedTheme }
  }, [session?.user?.theme])

  const [profileRevision, setProfileRevision] = useState(0)

  const handleProfileUpdated = useCallback((userOrUpdater: User | ((prev: User) => User)) => {
    setSession((current) => {
      if (!current?.user) return current
      const nextUser = typeof userOrUpdater === 'function' ? userOrUpdater(current.user) : userOrUpdater
      const currentTheme = (readThemeCookie() || cachedTheme() || current.user.theme || nextUser.theme || 'DEFAULT') as Theme
      return { ...current, user: { ...nextUser, theme: nextUser.theme || currentTheme } }
    })
    setProfileRevision((revision) => revision + 1)
  }, [])

  const handleThemeUpdated = useCallback((user: User) => {
    setSession((current) => (current ? { ...current, user } : current))
    cacheTheme(user.theme)
  }, [])

  useEffect(() => {
    applyTheme(session?.user?.theme ?? readThemeCookie() ?? (session?.token ? cachedTheme() : 'DEFAULT'))
  }, [session?.token, session?.user?.theme])

  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<string>).detail as Theme
      applyTheme(next)
      setSession((current) => (current ? { ...current, user: { ...current.user!, theme: next } } : current))
    }
    window.addEventListener('konnix:theme-changed', handler)
    return () => window.removeEventListener('konnix:theme-changed', handler)
  }, [])

  if (isTauri && desktopServers.length === 0) {
    return <ServerSetup onConnected={(server) => connectDesktopServer(server)} />
  }

  if (authInitializing) {
    return <div className="app-splash" role="status">Carregando sessão…</div>
  }

  if (!session || !session.user) {
    return (
      <LoginView
        onLogin={(next) => {
          setAuthToken(next.token)
          cacheTheme(next.user.theme)
          setSession(next)
        }}
      />
    )
  }

  if (session.user.passwordChangeRequired) {
    return (
      <RequiredPasswordChangeView
        onLogout={handleLogout}
        onCompleted={(user) => setSession((current) => (current ? { ...current, user } : current))}
      />
    )
  }

  if (pathname === '/admin') {
    if (!session.user.roles.includes('ADMIN')) {
      return (
        <DesktopShell
          servers={desktopServers}
          activeId={activeDesktopId}
          onChange={connectDesktopServer}
          onServersChange={setDesktopServers}
        >
          <ChatView
            session={session}
            avatarRevision={profileRevision}
            onLogout={handleLogout}
            onPresenceChange={handlePresenceChange}
            onProfileUpdated={handleProfileUpdated}
            onThemeUpdated={handleThemeUpdated}
          />
        </DesktopShell>
      )
    }
    return (
      <DesktopShell
        servers={desktopServers}
        activeId={activeDesktopId}
        onChange={connectDesktopServer}
        onServersChange={setDesktopServers}
      >
        <div style={{ display: 'none' }} aria-hidden="true">
          <ChatView
            session={session}
            avatarRevision={profileRevision}
            onLogout={handleLogout}
            onPresenceChange={handlePresenceChange}
            onProfileUpdated={handleProfileUpdated}
            onThemeUpdated={handleThemeUpdated}
          />
        </div>
        <Suspense fallback={<div className="app-splash" role="status">Carregando painel de administração…</div>}>
          <AdminView
            me={session.user}
            onBack={() => {
              window.history.pushState({}, '', '/')
              window.dispatchEvent(new PopStateEvent('popstate'))
            }}
          />
        </Suspense>
      </DesktopShell>
    )
  }

  return (
    <DesktopShell
      servers={desktopServers}
      activeId={activeDesktopId}
      onChange={connectDesktopServer}
      onServersChange={setDesktopServers}
    >
      <ChatView
        session={session}
        avatarRevision={profileRevision}
        onLogout={handleLogout}
        onPresenceChange={handlePresenceChange}
        onProfileUpdated={handleProfileUpdated}
        onThemeUpdated={handleThemeUpdated}
      />
    </DesktopShell>
  )
}
