import { memo, useEffect, useRef, useState } from 'react'
import { roomAvatarPath, userAvatarPath } from '../../api'
import type { DirectoryUser, PresenceStatus, Room, Theme, User } from '../../api'
import type { DmPartner, TypingUser } from '../../types'
import { presenceLabel } from '../../utils/presence'
import { getRoomIcon, roomDisplayName } from '../../utils/room'
import { isTauri } from '../../platform'
import { isWhiteSidebarLogoTheme } from '../../utils/theme'
import { IconSearch, IconSettings } from '../icons'
import { PresenceSelector } from '../settings/PresenceSelector'
import { UserSettingsMenuContent } from '../settings/UserSettingsMenuContent'
import { AvatarImage, initials } from './AvatarImage'
import { SidebarInstallCard } from './SidebarInstallCard'
import { formatTypingText } from './TypingIndicator'

export interface SidebarProps {
  me: User
  theme: Theme
  channels: Room[]
  favoriteRooms: Room[]
  regularConversations: Room[]
  activeRoomId: string | null
  search: string
  userResults: DirectoryUser[]
  onSearch: (q: string) => void
  onOpenRoom: (roomId: string) => void
  onNewRoom: () => void
  onNewDm: () => void
  onStartUserDm: (userId: string, partner?: Omit<DmPartner, 'userId'>) => void | Promise<void>
  onLogout: () => void
  onTheme: () => void
  onEditProfile: () => void
  onAbout: () => void
  onReportIssue: () => void
  myAvatarVersion: string
  onInstallApp: () => void
  standalone?: boolean
  appInstalled?: boolean
  installCardDismissed?: boolean
  onDismissInstallCard?: () => void
  onPresenceChange: (status: PresenceStatus) => Promise<User>
  onPresenceError: (message: string) => void
  typingByRoom: Record<string, Record<string, TypingUser>>
  onClose?: () => void
}

export const Sidebar = memo(function Sidebar({
  me,
  theme,
  channels,
  favoriteRooms,
  regularConversations,
  activeRoomId,
  search,
  userResults,
  onSearch,
  onOpenRoom,
  onNewRoom,
  onNewDm,
  onStartUserDm,
  onLogout,
  onTheme,
  onEditProfile,
  onAbout,
  onReportIssue,
  myAvatarVersion,
  onInstallApp,
  standalone,
  appInstalled,
  installCardDismissed,
  onDismissInstallCard,
  onPresenceChange,
  onPresenceError,
  typingByRoom,
  onClose,
}: SidebarProps) {
  const sidebarLogo = isWhiteSidebarLogoTheme(theme) ? '/icons/Konnix dark.png' : '/icons/Konnix white.png'
  const sidebarLogoSrc = `${sidebarLogo}?theme=${theme}`
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [footerMenuOpen, setFooterMenuOpen] = useState(false)
  const [channelsOpen, setChannelsOpen] = useState(true)
  const [adminOpen, setAdminOpen] = useState(true)
  const [favoritesOpen, setFavoritesOpen] = useState(true)
  const [conversationsOpen, setConversationsOpen] = useState(true)
  const headerMenuRef = useRef<HTMLDivElement>(null)
  const footerUserRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isAdmin = me.roles.includes('ADMIN')
  const SYSTEM_CHANNEL_NAMES = ['bug-reports']
  const systemChannels = channels.filter((room) => SYSTEM_CHANNEL_NAMES.includes(room.name))
  const regularChannels = channels.filter((room) => !SYSTEM_CHANNEL_NAMES.includes(room.name))
  const query = search.trim().toLowerCase()
  const showResults = query.length > 0
  const matchesQuery = (room: Room) => {
    if (!query) return true
    return (room.displayName || room.name || '').toLowerCase().includes(query)
  }
  const filteredFavorites = favoriteRooms.filter(matchesQuery)
  const filteredRegularChannels = regularChannels.filter(matchesQuery)
  const filteredConversations = regularConversations.filter(matchesQuery)
  const hasSearchResults =
    userResults.length > 0 ||
    filteredFavorites.length > 0 ||
    filteredRegularChannels.length > 0 ||
    filteredConversations.length > 0

  useEffect(() => {
    if (!headerMenuOpen && !footerMenuOpen) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node
      if (headerMenuOpen && headerMenuRef.current && !headerMenuRef.current.contains(target)) {
        setHeaderMenuOpen(false)
      }
      if (footerMenuOpen && footerUserRef.current && !footerUserRef.current.contains(target)) {
        setFooterMenuOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHeaderMenuOpen(false)
        setFooterMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [headerMenuOpen, footerMenuOpen])

  const handleSelectRoom = (roomId: string) => {
    onSearch('')
    onOpenRoom(roomId)
  }

  const handleSelectUser = async (userId: string) => {
    onSearch('')
    const user = userResults.find((item) => item.id === userId)
    await onStartUserDm(
      userId,
      user
        ? {
            username: user.username,
            name: user.name || user.username,
            presenceStatus: user.presenceStatus,
          }
        : undefined,
    )
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <button
          type="button"
          className="sidebar-brand-btn"
          onClick={onClose}
          aria-label="Voltar para tela de descanso"
        >
          <img key={sidebarLogoSrc} src={sidebarLogoSrc} alt="Konnix" className="sidebar-logo" />
          <div className="sidebar-wordmark">
            <strong>Konnix</strong>
            <span>Chat</span>
          </div>
        </button>

        <div className="sidebar-header-actions" ref={headerMenuRef}>
          <button
            type="button"
            className={`icon-btn sidebar-settings-toggle ${headerMenuOpen ? 'active' : ''}`}
            onClick={() => {
              setFooterMenuOpen(false)
              setHeaderMenuOpen((open) => !open)
            }}
            title="Configurações"
            aria-label="Configurações"
            aria-expanded={headerMenuOpen}
          >
            <IconSettings size={18} />
          </button>
          <PresenceSelector status={me.presenceStatus} onChange={onPresenceChange} onError={onPresenceError} />
          {headerMenuOpen && (
            <div className="user-menu sidebar-header-dropdown">
              <UserSettingsMenuContent
                me={me}
                onTheme={onTheme}
                onEditProfile={onEditProfile}
                onReportIssue={onReportIssue}
                onAbout={onAbout}
                onLogout={onLogout}
                onClose={() => setHeaderMenuOpen(false)}
                onInstallApp={onInstallApp}
                standalone={standalone}
                appInstalled={appInstalled}
              />
            </div>
          )}
        </div>
      </div>

      <div className="sidebar-persistent-search">
        <div className="sidebar-search-input-wrap">
          <IconSearch size={15} />
          <input
            ref={searchInputRef}
            className="sidebar-search-page-input"
            placeholder="Buscar conversas e usuários…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onSearch('')
            }}
          />
          {search.trim().length > 0 && (
            <button
              type="button"
              className="search-clear"
              onClick={() => {
                onSearch('')
                searchInputRef.current?.focus()
              }}
              aria-label="Limpar busca"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <nav className="sidebar-nav">
        {showResults ? (
          !hasSearchResults ? (
            <div className="sidebar-search-empty">
              <p>Nenhum resultado encontrado para &ldquo;{search}&rdquo;</p>
            </div>
          ) : (
            <>
              {userResults.length > 0 && (
                <div className="nav-section search-users-section">
                  <div className="nav-section-head">
                    <span className="nav-section-title">Usuários ({userResults.length})</span>
                  </div>
                  <div className="nav-list">
                    {userResults.map((user) => (
                      <button
                        key={user.id}
                        className="room-item search-user-item"
                        onClick={() => void handleSelectUser(user.id)}
                      >
                        <span className="sidebar-avatar-wrap">
                          <AvatarImage
                            path={userAvatarPath(user.id)}
                            className="mini-avatar"
                            fallback={<span className="mini-avatar">{initials(user.name || user.username)}</span>}
                            alt={user.name || user.username}
                          />
                          {user.presenceStatus && (
                            <span
                              className={`sidebar-presence-dot presence-${user.presenceStatus}`}
                              title={presenceLabel(user.presenceStatus)}
                              aria-label={`Status: ${presenceLabel(user.presenceStatus)}`}
                            />
                          )}
                        </span>
                        <span className="picker-item-text">
                          <strong>{user.name || user.username}</strong>
                          <small>
                            @{user.username}
                            {user.email ? ` · ${user.email}` : ''}
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredFavorites.length > 0 && (
                <div className="nav-section">
                  <div className="nav-section-head">
                    <span className="nav-section-title">Favoritos ({filteredFavorites.length})</span>
                  </div>
                  <div className="nav-list">
                    {filteredFavorites.map((room) => (
                      <button
                        key={room.id}
                        className={`room-item ${room.id === activeRoomId ? 'active' : ''}`}
                        onClick={() => handleSelectRoom(room.id)}
                      >
                        {room.type === 'DIRECT' ? (
                          <span className="room-icon direct">
                            <span className="sidebar-avatar-wrap">
                              <AvatarImage
                                path={room.directPartner ? userAvatarPath(room.directPartner.userId) : null}
                                className="mini-avatar"
                                fallback={<span className="mini-avatar">{initials(roomDisplayName(room))}</span>}
                                alt={roomDisplayName(room)}
                              />
                              {room.directPartner?.presenceStatus && (
                                <span
                                  className={`sidebar-presence-dot presence-${room.directPartner.presenceStatus}`}
                                  title={presenceLabel(room.directPartner.presenceStatus)}
                                  aria-label={`Status: ${presenceLabel(room.directPartner.presenceStatus)}`}
                                />
                              )}
                            </span>
                          </span>
                        ) : (
                          <span className={`room-icon ${room.type === 'CHANNEL' ? 'channel' : 'group'}`}>
                            {getRoomIcon(room)}
                          </span>
                        )}
                        <span className="room-name">{roomDisplayName(room)}</span>
                        {!!room.unreadCount && <span className="badge">{room.unreadCount}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredRegularChannels.length > 0 && (
                <div className="nav-section">
                  <div className="nav-section-head">
                    <span className="nav-section-title">Grupos & Canais ({filteredRegularChannels.length})</span>
                  </div>
                  <div className="nav-list">
                    {filteredRegularChannels.map((room) => (
                      <button
                        key={room.id}
                        className={`room-item ${room.id === activeRoomId ? 'active' : ''}`}
                        onClick={() => handleSelectRoom(room.id)}
                      >
                        <AvatarImage
                          path={`${roomAvatarPath(room.id)}?v=${encodeURIComponent(room.updatedAt)}`}
                          className="room-thumb"
                          fallback={
                            <span className={`room-icon ${room.type === 'CHANNEL' ? 'channel' : 'group'}`}>
                              {getRoomIcon(room)}
                            </span>
                          }
                          alt={roomDisplayName(room)}
                        />
                        <span className="room-name">{roomDisplayName(room)}</span>
                        {!!room.unreadCount && <span className="badge">{room.unreadCount}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredConversations.length > 0 && (
                <div className="nav-section">
                  <div className="nav-section-head">
                    <span className="nav-section-title">Conversas ({filteredConversations.length})</span>
                  </div>
                  <div className="nav-list">
                    {filteredConversations.map((room) => (
                      <button
                        key={room.id}
                        className={`room-item ${room.id === activeRoomId ? 'active' : ''}`}
                        onClick={() => handleSelectRoom(room.id)}
                      >
                        <span className="room-icon direct">
                          <span className="sidebar-avatar-wrap">
                            <AvatarImage
                              path={room.directPartner ? userAvatarPath(room.directPartner.userId) : null}
                              className="mini-avatar"
                              fallback={<span className="mini-avatar">{initials(roomDisplayName(room))}</span>}
                              alt={roomDisplayName(room)}
                            />
                            {room.directPartner?.presenceStatus && (
                              <span
                                className={`sidebar-presence-dot presence-${room.directPartner.presenceStatus}`}
                                title={presenceLabel(room.directPartner.presenceStatus)}
                                aria-label={`Status: ${presenceLabel(room.directPartner.presenceStatus)}`}
                              />
                            )}
                          </span>
                        </span>
                        <span className="room-name">{roomDisplayName(room)}</span>
                        {!!room.unreadCount && <span className="badge">{room.unreadCount}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )
        ) : (
          <>
            {favoriteRooms.length > 0 && (
              <div className="nav-section">
                <div className="nav-section-head">
                  <button
                    type="button"
                    className="nav-section-toggle"
                    onClick={() => setFavoritesOpen((open) => !open)}
                    aria-expanded={favoritesOpen}
                    aria-controls="favorites-list"
                  >
                    <span className="nav-chevron">{favoritesOpen ? '⌄' : '›'}</span>
                    <span className="nav-section-title">Favoritos</span>
                  </button>
                </div>
                {favoritesOpen && (
                  <div className="nav-list" id="favorites-list">
                    {favoriteRooms.map((room) => (
                      <button
                        key={room.id}
                        className={`room-item ${room.id === activeRoomId ? 'active' : ''}`}
                        onClick={() => handleSelectRoom(room.id)}
                      >
                        {room.type === 'DIRECT' ? (
                          <span className="room-icon direct">
                            <span className="sidebar-avatar-wrap">
                              <AvatarImage
                                path={room.directPartner ? userAvatarPath(room.directPartner.userId) : null}
                                className="mini-avatar"
                                fallback={<span className="mini-avatar">{initials(roomDisplayName(room))}</span>}
                                alt={roomDisplayName(room)}
                              />
                              {room.directPartner?.presenceStatus && (
                                <span
                                  className={`sidebar-presence-dot presence-${room.directPartner.presenceStatus}`}
                                  title={presenceLabel(room.directPartner.presenceStatus)}
                                  aria-label={`Status: ${presenceLabel(room.directPartner.presenceStatus)}`}
                                />
                              )}
                            </span>
                          </span>
                        ) : (
                          <span className={`room-icon ${room.type === 'CHANNEL' ? 'channel' : 'group'}`}>
                            {getRoomIcon(room)}
                          </span>
                        )}
                        <span className="room-name">{roomDisplayName(room)}</span>
                        {!!room.unreadCount && <span className="badge">{room.unreadCount}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isAdmin && systemChannels.length > 0 && (
              <div className="nav-section">
                <div className="nav-section-head">
                  <button
                    type="button"
                    className="nav-section-toggle admin-section-toggle"
                    onClick={() => setAdminOpen((open) => !open)}
                    aria-expanded={adminOpen}
                    aria-controls="admin-channels-list"
                  >
                    <span className="nav-chevron">{adminOpen ? '⌄' : '›'}</span>
                    <span className="nav-section-title">Administração</span>
                  </button>
                </div>
                {adminOpen && (
                  <div className="nav-list" id="admin-channels-list">
                    {systemChannels.map((room) => {
                      const typingText = formatTypingText(typingByRoom[room.id], false)
                      return (
                        <button
                          key={room.id}
                          className={`room-item ${room.id === activeRoomId ? 'active' : ''}`}
                          onClick={() => handleSelectRoom(room.id)}
                        >
                          <AvatarImage
                            path={`${roomAvatarPath(room.id)}?v=${encodeURIComponent(room.updatedAt)}`}
                            className="room-thumb"
                            fallback={
                              <span className={`room-icon ${room.type === 'CHANNEL' ? 'channel' : 'group'}`}>
                                {getRoomIcon(room)}
                              </span>
                            }
                            alt={roomDisplayName(room)}
                          />
                          <span className="room-name">
                            {roomDisplayName(room)}
                            {typingText && (
                              <span
                                className="room-type typing-active"
                                style={{ display: 'block', fontSize: '0.72rem' }}
                              >
                                {typingText}
                              </span>
                            )}
                          </span>
                          {!!room.unreadCount && <span className="badge">{room.unreadCount}</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="nav-section">
              <div className="nav-section-head">
                <button
                  type="button"
                  className="nav-section-toggle"
                  onClick={() => setChannelsOpen((open) => !open)}
                  aria-expanded={channelsOpen}
                  aria-controls="channels-list"
                >
                  <span className="nav-chevron">{channelsOpen ? '⌄' : '›'}</span>
                  <span className="nav-section-title">Canais e grupos</span>
                </button>
                <button className="nav-add" onClick={onNewRoom} title="Criar grupo">
                  +
                </button>
              </div>
              {channelsOpen && (
                <div className="nav-list" id="channels-list">
                  {regularChannels.length === 0 && <span className="nav-empty">Nenhum grupo</span>}
                  {regularChannels.map((room) => {
                    const typingText = formatTypingText(typingByRoom[room.id], false)
                    return (
                      <button
                        key={room.id}
                        className={`room-item ${room.id === activeRoomId ? 'active' : ''}`}
                        onClick={() => handleSelectRoom(room.id)}
                      >
                        <AvatarImage
                          path={`${roomAvatarPath(room.id)}?v=${encodeURIComponent(room.updatedAt)}`}
                          className="room-thumb"
                          fallback={
                            <span className={`room-icon ${room.type === 'CHANNEL' ? 'channel' : 'group'}`}>
                              {getRoomIcon(room)}
                            </span>
                          }
                          alt={roomDisplayName(room)}
                        />
                        <span className="room-name">
                          {roomDisplayName(room)}
                          {typingText && (
                            <span
                              className="room-type typing-active"
                              style={{ display: 'block', fontSize: '0.72rem' }}
                            >
                              {typingText}
                            </span>
                          )}
                        </span>
                        {!!room.unreadCount && <span className="badge">{room.unreadCount}</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="nav-section">
              <div className="nav-section-head">
                <button
                  type="button"
                  className="nav-section-toggle"
                  onClick={() => setConversationsOpen((open) => !open)}
                  aria-expanded={conversationsOpen}
                  aria-controls="conversations-list"
                >
                  <span className="nav-chevron">{conversationsOpen ? '⌄' : '›'}</span>
                  <span className="nav-section-title">Conversas</span>
                </button>
                <button className="nav-add" onClick={onNewDm} title="Nova conversa">
                  +
                </button>
              </div>
              {conversationsOpen && (
                <div className="nav-list" id="conversations-list">
                  {regularConversations.length === 0 && <span className="nav-empty">Nenhuma conversa</span>}
                  {regularConversations.map((room) => {
                    const typingText = formatTypingText(typingByRoom[room.id], true)
                    return (
                      <button
                        key={room.id}
                        className={`room-item ${room.id === activeRoomId ? 'active' : ''}`}
                        onClick={() => handleSelectRoom(room.id)}
                      >
                        <span className="room-icon direct">
                          <span className="sidebar-avatar-wrap">
                            <AvatarImage
                              path={room.directPartner ? userAvatarPath(room.directPartner.userId) : null}
                              className="mini-avatar"
                              fallback={<span className="mini-avatar">{initials(roomDisplayName(room))}</span>}
                              alt={roomDisplayName(room)}
                            />
                            {room.directPartner?.presenceStatus && (
                              <span
                                className={`sidebar-presence-dot presence-${room.directPartner.presenceStatus}`}
                                title={presenceLabel(room.directPartner.presenceStatus)}
                                aria-label={`Status: ${presenceLabel(room.directPartner.presenceStatus)}`}
                              />
                            )}
                          </span>
                        </span>
                        <span className="room-name">
                          {roomDisplayName(room)}
                          {typingText && (
                            <span
                              className="room-type typing-active"
                              style={{ display: 'block', fontSize: '0.72rem' }}
                            >
                              {typingText}
                            </span>
                          )}
                        </span>
                        {!!room.unreadCount && <span className="badge">{room.unreadCount}</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </nav>

      {!isTauri && !standalone && !appInstalled && !installCardDismissed && onInstallApp && (
        <SidebarInstallCard
          onInstall={() => {
            onClose?.()
            onInstallApp()
          }}
          onDismiss={() => {
            onDismissInstallCard?.()
          }}
        />
      )}

      <div className="sidebar-footer" ref={footerUserRef}>
        <div
          className="user-menu-trigger"
          role="button"
          tabIndex={0}
          aria-expanded={footerMenuOpen}
          aria-label="Abrir configurações do usuário"
          onClick={() => {
            setHeaderMenuOpen(false)
            setFooterMenuOpen((o) => !o)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setHeaderMenuOpen(false)
              setFooterMenuOpen((o) => !o)
            }
          }}
        >
          <AvatarImage
            path={`${userAvatarPath(me.id)}?v=${encodeURIComponent(myAvatarVersion)}`}
            className="user-avatar"
            fallback={<span className="user-avatar">{initials(me.name)}</span>}
            alt={me.name}
          />
          <span className="user-chip-text">
            <strong>{me.name}</strong>
            <small>@{me.username}</small>
          </span>
          <span className="settings-btn" aria-hidden="true">
            ⚙
          </span>
        </div>
        {footerMenuOpen && (
          <div className="user-menu">
            <UserSettingsMenuContent
              me={me}
              onTheme={onTheme}
              onEditProfile={onEditProfile}
              onReportIssue={onReportIssue}
              onAbout={onAbout}
              onLogout={onLogout}
              onClose={() => setFooterMenuOpen(false)}
              onInstallApp={onInstallApp}
              standalone={standalone}
              appInstalled={appInstalled}
            />
          </div>
        )}
      </div>
    </aside>
  )
})
