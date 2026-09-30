import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { roomAvatarPath, userAvatarPath } from '../../api'
import type { DirectoryUser, PresenceStatus, Room, Theme, User } from '../../api'
import type { DmPartner, TypingUser } from '../../types'
import { presenceLabel } from '../../utils/presence'
import { getRoomIcon, roomDisplayName } from '../../utils/room'
import { isTauri } from '../../platform'
import { isMobilePlatform } from '../../utils/pwa'
import { isWhiteSidebarLogoTheme } from '../../utils/theme'
import {
  IconCheck,
  IconChevronDown,
  IconMail,
  IconSearch,
  IconSettings,
  IconStar,
  IconStarFilled,
} from '../icons'
import { PresenceSelector } from '../settings/PresenceSelector'
import { UserSettingsMenuContent } from '../settings/UserSettingsMenuContent'
import { AvatarImage, initials } from './AvatarImage'
import { SidebarInstallCard } from './SidebarInstallCard'
import { formatTypingText } from './TypingIndicator'
import {
  isRoomUnread,
  countUniqueUnreadRooms,
  countUniqueMentionedRooms,
  filterRoomsByMode,
  type SidebarFilterMode,
} from '../../utils/sidebarFilter'

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
  avatarVersions?: Record<string, string>
  onClose?: () => void
  onMarkRoomUnread?: (roomId: string) => void
  onMarkRoomRead?: (roomId: string) => void
  onToggleRoomFavorite?: (roomId: string) => void
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
  avatarVersions,
  onClose,
  onMarkRoomUnread,
  onMarkRoomRead,
  onToggleRoomFavorite,
}: SidebarProps) {
  const sidebarLogo = isWhiteSidebarLogoTheme(theme) ? '/icons/Konnix dark.png' : '/icons/Konnix white.png'
  const sidebarLogoSrc = `${sidebarLogo}?theme=${theme}`
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [footerMenuOpen, setFooterMenuOpen] = useState(false)
  const [channelsOpen, setChannelsOpen] = useState(true)
  const [adminOpen, setAdminOpen] = useState(true)
  const [favoritesOpen, setFavoritesOpen] = useState(true)
  const [conversationsOpen, setConversationsOpen] = useState(true)
  const [filter, setFilter] = useState<SidebarFilterMode>('all')
  const [filterDirection, setFilterDirection] = useState<'left' | 'right'>('left')

  const handleFilterChange = (newFilter: SidebarFilterMode) => {
    if (newFilter === filter) return
    setRoomContextMenu(null)
    const order: Record<SidebarFilterMode, number> = { all: 0, unread: 1, mentions: 2 }
    const currentIdx = order[filter] ?? 0
    const newIdx = order[newFilter] ?? 0
    setFilterDirection(newIdx >= currentIdx ? 'left' : 'right')
    setFilter(newFilter)
  }

  const [roomContextMenu, setRoomContextMenu] = useState<{
    roomId: string
    x: number
    y: number
  } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null)
  const longPressFiredRef = useRef(false)
  const headerMenuRef = useRef<HTMLDivElement>(null)
  const footerUserRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isAdmin = me.roles.includes('ADMIN')
  const SYSTEM_CHANNEL_NAMES = ['bug-reports']
  const systemChannels = channels.filter((room) => SYSTEM_CHANNEL_NAMES.includes(room.name))
  const regularChannels = channels.filter((room) => !SYSTEM_CHANNEL_NAMES.includes(room.name))
  const allRooms = useMemo(() => {
    const map = new Map<string, Room>()
    favoriteRooms.forEach((r) => map.set(r.id, r))
    channels.forEach((r) => map.set(r.id, r))
    regularConversations.forEach((r) => map.set(r.id, r))
    return Array.from(map.values())
  }, [favoriteRooms, channels, regularConversations])

  const totalUnreadRoomsCount = useMemo(
    () => countUniqueUnreadRooms([favoriteRooms, channels, regularConversations]),
    [favoriteRooms, channels, regularConversations],
  )

  const totalMentionedRoomsCount = useMemo(
    () => countUniqueMentionedRooms([favoriteRooms, channels, regularConversations]),
    [favoriteRooms, channels, regularConversations],
  )

  const contextRoom = useMemo(() => {
    if (!roomContextMenu) return null
    return allRooms.find((r) => r.id === roomContextMenu.roomId) ?? null
  }, [roomContextMenu, allRooms])

  const favoritesHaveUnread = favoriteRooms.some(isRoomUnread)
  const adminHaveUnread = systemChannels.some(isRoomUnread)
  const channelsHaveUnread = regularChannels.some(isRoomUnread)
  const conversationsHaveUnread = regularConversations.some(isRoomUnread)
  const query = search.trim().toLowerCase()
  const showResults = query.length > 0
  const matchesQuery = (room: Room) => {
    if (!query) return true
    return (room.displayName || room.name || '').toLowerCase().includes(query)
  }
  const filteredFavorites = filterRoomsByMode(favoriteRooms.filter(matchesQuery), filter)
  const filteredRegularChannels = filterRoomsByMode(regularChannels.filter(matchesQuery), filter)
  const filteredConversations = filterRoomsByMode(regularConversations.filter(matchesQuery), filter)
  const filteredUserResults = filter === 'all' ? userResults : []
  const hasSearchResults =
    filteredUserResults.length > 0 ||
    filteredFavorites.length > 0 ||
    filteredRegularChannels.length > 0 ||
    filteredConversations.length > 0

  const displayFavorites = filterRoomsByMode(favoriteRooms, filter)
  const displaySystemChannels = filterRoomsByMode(systemChannels, filter)
  const displayRegularChannels = filterRoomsByMode(regularChannels, filter)
  const displayConversations = filterRoomsByMode(regularConversations, filter)
  const hasAnyInNav =
    displayFavorites.length > 0 ||
    displaySystemChannels.length > 0 ||
    displayRegularChannels.length > 0 ||
    displayConversations.length > 0

  useEffect(() => {
    if (!roomContextMenu) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node
      if ((target as Element).closest?.('.room-item-arrow-btn')) {
        return
      }
      if (contextMenuRef.current && !contextMenuRef.current.contains(target)) {
        setRoomContextMenu(null)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRoomContextMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [roomContextMenu])

  const handleTouchStart = (roomId: string, e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (!touch) return
    longPressFiredRef.current = false
    longPressStartRef.current = { x: touch.clientX, y: touch.clientY }
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true
      setRoomContextMenu({ roomId, x: touch.clientX, y: touch.clientY })
      longPressTimerRef.current = null
    }, 450)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (!touch || !longPressStartRef.current) return
    if (
      Math.abs(touch.clientX - longPressStartRef.current.x) > 10 ||
      Math.abs(touch.clientY - longPressStartRef.current.y) > 10
    ) {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
    }
  }

  const handleTouchEnd = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const handleContextMenu = (roomId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const menuHeight = 90
    const menuWidth = 190
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 8)
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8)
    setRoomContextMenu({ roomId, x, y })
  }

  const handleMoreClick = (roomId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const menuHeight = 90
    const menuWidth = 190
    const y = rect.bottom + menuHeight > window.innerHeight
      ? Math.max(8, rect.top - menuHeight - 4)
      : rect.bottom + 4
    const x = Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8)
    setRoomContextMenu((prev) => (prev?.roomId === roomId ? null : { roomId, x, y }))
  }

  const renderRoomBadge = (room: Room) => {
    const hasMention = Boolean(room.unreadMentionsCount && room.unreadMentionsCount > 0)
    const hasUnread = room.unreadCount > 0
    const isMarked = room.markedUnread

    if (!hasMention && !hasUnread && !isMarked) return null

    return (
      <span className="room-badges" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        {hasMention && (
          <span
            className="room-mention-symbol"
            title={`${room.unreadMentionsCount} menção(ões) não lida(s)`}
            aria-label="Você foi mencionado"
          >
            @{room.unreadMentionsCount! > 1 ? room.unreadMentionsCount : ''}
          </span>
        )}
        {hasUnread ? (
          <span className="badge">{room.unreadCount}</span>
        ) : isMarked ? (
          <span className="badge badge-dot" aria-label="Não lida" title="Não lida" />
        ) : null}
      </span>
    )
  }

  const renderRoomActions = (room: Room) => (
    <div className="room-item-actions">
      {renderRoomBadge(room)}
      <span
        className="room-item-arrow-btn"
        role="button"
        tabIndex={0}
        title="Opções da conversa"
        aria-label="Opções da conversa"
        onClick={(e) => {
          e.stopPropagation()
          handleMoreClick(room.id, e)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation()
            e.preventDefault()
            handleMoreClick(room.id, e as unknown as React.MouseEvent)
          }
        }}
      >
        <IconChevronDown size={12} />
      </span>
    </div>
  )

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
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false
      return
    }
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

        <div className="sidebar-filter-tabs" role="tablist" aria-label="Filtrar conversas">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            className={`sidebar-filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => handleFilterChange('all')}
          >
            Todos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'unread'}
            className={`sidebar-filter-tab ${filter === 'unread' ? 'active' : ''}`}
            onClick={() => handleFilterChange('unread')}
          >
            <span>Não lidas</span>
            {totalUnreadRoomsCount > 0 && (
              <span className="sidebar-filter-dot" aria-label="Há conversas não lidas" />
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'mentions'}
            className={`sidebar-filter-tab ${filter === 'mentions' ? 'active' : ''}`}
            onClick={() => handleFilterChange('mentions')}
          >
            <span>Menções</span>
            {totalMentionedRoomsCount > 0 && (
              <span className="sidebar-filter-dot" aria-label="Há menções não lidas" />
            )}
          </button>
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
                        className={`room-item ${room.id === activeRoomId ? 'active' : ''} ${roomContextMenu?.roomId === room.id ? 'menu-open' : ''}`}
                        onClick={() => handleSelectRoom(room.id)}
                        onContextMenu={(e) => handleContextMenu(room.id, e)}
                        onTouchStart={(e) => handleTouchStart(room.id, e)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
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
                        {renderRoomActions(room)}
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
                        className={`room-item ${room.id === activeRoomId ? 'active' : ''} ${roomContextMenu?.roomId === room.id ? 'menu-open' : ''}`}
                        onClick={() => handleSelectRoom(room.id)}
                        onContextMenu={(e) => handleContextMenu(room.id, e)}
                        onTouchStart={(e) => handleTouchStart(room.id, e)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
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
                        {renderRoomActions(room)}
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
                        className={`room-item ${room.id === activeRoomId ? 'active' : ''} ${roomContextMenu?.roomId === room.id ? 'menu-open' : ''}`}
                        onClick={() => handleSelectRoom(room.id)}
                        onContextMenu={(e) => handleContextMenu(room.id, e)}
                        onTouchStart={(e) => handleTouchStart(room.id, e)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
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
                        {renderRoomActions(room)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )
        ) : (
          <div key={filter} className={`sidebar-filter-content slide-${filterDirection}`}>
            {displayFavorites.length > 0 && (
              <div className="nav-section">
                <div className="nav-section-head">
                  <button
                    type="button"
                    className="nav-section-toggle"
                    onClick={() => setFavoritesOpen((open) => !open)}
                    aria-expanded={favoritesOpen}
                    aria-controls="favorites-list"
                  >
                    <span className={`nav-chevron${favoritesOpen ? ' open' : ''}`}>›</span>
                    <span className="nav-section-title">Favoritos</span>
                  </button>
                  {!favoritesOpen && favoritesHaveUnread && (
                    <span className="badge badge-dot" aria-label="Há mensagens não lidas" title="Há mensagens não lidas" />
                  )}
                </div>
                {favoritesOpen && (
                  <div className="nav-list" id="favorites-list">
                    {displayFavorites.map((room) => (
                      <button
                        key={room.id}
                        className={`room-item ${room.id === activeRoomId ? 'active' : ''} ${roomContextMenu?.roomId === room.id ? 'menu-open' : ''}`}
                        onClick={() => handleSelectRoom(room.id)}
                        onContextMenu={(e) => handleContextMenu(room.id, e)}
                        onTouchStart={(e) => handleTouchStart(room.id, e)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                      >
                        {room.type === 'DIRECT' ? (
                          <span className="room-icon direct">
                            <span className="sidebar-avatar-wrap">
                              <AvatarImage
                                path={
                                  room.directPartner
                                    ? `${userAvatarPath(room.directPartner.userId)}${
                                        avatarVersions?.[room.directPartner.userId]
                                          ? `?v=${encodeURIComponent(avatarVersions[room.directPartner.userId])}`
                                          : ''
                                      }`
                                    : null
                                }
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
                        )}
                        <span className="room-name">{roomDisplayName(room)}</span>
                        {renderRoomActions(room)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isAdmin && displaySystemChannels.length > 0 && (
              <div className="nav-section">
                <div className="nav-section-head">
                  <button
                    type="button"
                    className="nav-section-toggle admin-section-toggle"
                    onClick={() => setAdminOpen((open) => !open)}
                    aria-expanded={adminOpen}
                    aria-controls="admin-channels-list"
                  >
                    <span className={`nav-chevron${adminOpen ? ' open' : ''}`}>›</span>
                    <span className="nav-section-title">Administração</span>
                  </button>
                  {!adminOpen && adminHaveUnread && (
                    <span className="badge badge-dot" aria-label="Há mensagens não lidas" title="Há mensagens não lidas" />
                  )}
                </div>
                {adminOpen && (
                  <div className="nav-list" id="admin-channels-list">
                    {displaySystemChannels.map((room) => {
                      const typingText = formatTypingText(typingByRoom[room.id], false)
                      return (
                        <button
                          key={room.id}
                          className={`room-item ${room.id === activeRoomId ? 'active' : ''} ${roomContextMenu?.roomId === room.id ? 'menu-open' : ''}`}
                          onClick={() => handleSelectRoom(room.id)}
                          onContextMenu={(e) => handleContextMenu(room.id, e)}
                          onTouchStart={(e) => handleTouchStart(room.id, e)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
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
                          {renderRoomActions(room)}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {filter === 'unread' && !hasAnyInNav ? (
              <div className="sidebar-filter-empty">
                <div className="sidebar-filter-empty-icon">✓</div>
                <p className="sidebar-filter-empty-title">Nenhuma conversa não lida</p>
                <span className="sidebar-filter-empty-subtitle">Você está em dia com todas as conversas</span>
              </div>
            ) : filter === 'mentions' && !hasAnyInNav ? (
              <div className="sidebar-filter-empty">
                <div className="sidebar-filter-empty-icon">@</div>
                <p className="sidebar-filter-empty-title">Nenhuma menção pendente</p>
                <span className="sidebar-filter-empty-subtitle">Você não possui menções não lidas</span>
              </div>
            ) : (
              <>
                {(filter === 'all' || displayRegularChannels.length > 0) && (
                  <div className="nav-section">
                    <div className="nav-section-head">
                      <button
                        type="button"
                        className="nav-section-toggle"
                        onClick={() => setChannelsOpen((open) => !open)}
                        aria-expanded={channelsOpen}
                        aria-controls="channels-list"
                      >
                        <span className={`nav-chevron${channelsOpen ? ' open' : ''}`}>›</span>
                        <span className="nav-section-title">Canais e grupos</span>
                      </button>
                      <div className="nav-section-actions">
                        {!channelsOpen && channelsHaveUnread && (
                          <span className="badge badge-dot" aria-label="Há mensagens não lidas" title="Há mensagens não lidas" />
                        )}
                        <button className="nav-add" onClick={onNewRoom} title="Criar grupo">
                          +
                        </button>
                      </div>
                    </div>
                    {channelsOpen && (
                      <div className="nav-list" id="channels-list">
                        {displayRegularChannels.length === 0 && (
                          <span className="nav-empty">
                            {filter === 'unread' ? 'Nenhum canal não lido' : filter === 'mentions' ? 'Nenhum canal com menções' : 'Nenhum grupo'}
                          </span>
                        )}
                        {displayRegularChannels.map((room) => {
                          const typingText = formatTypingText(typingByRoom[room.id], false)
                          return (
                            <button
                              key={room.id}
                              className={`room-item ${room.id === activeRoomId ? 'active' : ''} ${roomContextMenu?.roomId === room.id ? 'menu-open' : ''}`}
                              onClick={() => handleSelectRoom(room.id)}
                              onContextMenu={(e) => handleContextMenu(room.id, e)}
                              onTouchStart={(e) => handleTouchStart(room.id, e)}
                              onTouchMove={handleTouchMove}
                              onTouchEnd={handleTouchEnd}
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
                              {renderRoomActions(room)}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {(filter === 'all' || displayConversations.length > 0) && (
                  <div className="nav-section">
                    <div className="nav-section-head">
                      <button
                        type="button"
                        className="nav-section-toggle"
                        onClick={() => setConversationsOpen((open) => !open)}
                        aria-expanded={conversationsOpen}
                        aria-controls="conversations-list"
                      >
                        <span className={`nav-chevron${conversationsOpen ? ' open' : ''}`}>›</span>
                        <span className="nav-section-title">Conversas</span>
                      </button>
                      <div className="nav-section-actions">
                        {!conversationsOpen && conversationsHaveUnread && (
                          <span className="badge badge-dot" aria-label="Há mensagens não lidas" title="Há mensagens não lidas" />
                        )}
                        <button className="nav-add" onClick={onNewDm} title="Nova conversa">
                          +
                        </button>
                      </div>
                    </div>
                    {conversationsOpen && (
                      <div className="nav-list" id="conversations-list">
                        {displayConversations.length === 0 && (
                          <span className="nav-empty">
                            {filter === 'unread' ? 'Nenhuma conversa não lida' : filter === 'mentions' ? 'Nenhuma conversa com menções' : 'Nenhuma conversa'}
                          </span>
                        )}
                        {displayConversations.map((room) => {
                          const typingText = formatTypingText(typingByRoom[room.id], true)
                          return (
                            <button
                              key={room.id}
                              className={`room-item ${room.id === activeRoomId ? 'active' : ''} ${roomContextMenu?.roomId === room.id ? 'menu-open' : ''}`}
                              onClick={() => handleSelectRoom(room.id)}
                              onContextMenu={(e) => handleContextMenu(room.id, e)}
                              onTouchStart={(e) => handleTouchStart(room.id, e)}
                              onTouchMove={handleTouchMove}
                              onTouchEnd={handleTouchEnd}
                            >
                              <span className="room-icon direct">
                                <span className="sidebar-avatar-wrap">
                                  <AvatarImage
                                    path={
                                      room.directPartner
                                        ? `${userAvatarPath(room.directPartner.userId)}${
                                            avatarVersions?.[room.directPartner.userId]
                                              ? `?v=${encodeURIComponent(avatarVersions[room.directPartner.userId])}`
                                              : ''
                                          }`
                                        : null
                                    }
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
                              {renderRoomActions(room)}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </nav>

      {!isTauri && !isMobilePlatform() && !standalone && !appInstalled && !installCardDismissed && onInstallApp && (
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

      {roomContextMenu && contextRoom && (
        <div
          ref={contextMenuRef}
          className="room-context-menu"
          style={{
            top: Math.min(roomContextMenu.y, window.innerHeight - 120),
            left: Math.min(roomContextMenu.x, window.innerWidth - 200),
          }}
        >
          {isRoomUnread(contextRoom) ? (
            <button
              type="button"
              className="room-context-menu-item"
              onClick={() => {
                const id = contextRoom.id
                setRoomContextMenu(null)
                onMarkRoomRead?.(id)
              }}
            >
              <span className="room-context-menu-icon">
                <IconCheck size={16} />
              </span>
              <span>Marcar como lida</span>
            </button>
          ) : (
            <button
              type="button"
              className="room-context-menu-item"
              onClick={() => {
                const id = contextRoom.id
                setRoomContextMenu(null)
                onMarkRoomUnread?.(id)
              }}
            >
              <span className="room-context-menu-icon">
                <IconMail size={16} />
              </span>
              <span>Marcar como não lida</span>
            </button>
          )}
          {onToggleRoomFavorite && (
            <button
              type="button"
              className="room-context-menu-item"
              onClick={() => {
                const id = contextRoom.id
                setRoomContextMenu(null)
                onToggleRoomFavorite(id)
              }}
            >
              <span className="room-context-menu-icon">
                {contextRoom.favorite ? <IconStarFilled size={16} /> : <IconStar size={16} />}
              </span>
              <span>{contextRoom.favorite ? 'Remover dos favoritos' : 'Favoritar conversa'}</span>
            </button>
          )}
        </div>
      )}
    </aside>
  )
})
