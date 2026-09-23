import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError, wsUrl } from '../../api'
import type { DirectoryUser, Message, MessageReaction, PresenceStatus, ReadReceipt, Room, Theme, User } from '../../api'
import { useOnline } from '../../hooks/useOnline'
import { usePwaInstall } from '../../hooks/usePwaInstall'
import { isTauri, notifyDesktop, updateAppBadge } from '../../platform'
import type { DmPartner, Session, TypingUser } from '../../types'
import { attachmentBlobCache } from '../../utils/attachmentCache'
import { isMobilePlatform } from '../../utils/pwa'
import { syncPushSubscription } from '../../utils/push'
import { MANUAL_PRESENCE_KEY, readManualPresence } from '../../utils/presence'
import { roomActivityTime, roomDisplayName } from '../../utils/room'
import { AboutModal } from '../modals/AboutModal'
import { ConfirmModal } from '../modals/ConfirmModal'
import { DownloadAppModal } from '../modals/DownloadAppModal'
import { registerModalToastDismiss } from '../modals/Modal'
import { NewDmModal } from '../modals/NewDmModal'
import { NewRoomModal } from '../modals/NewRoomModal'
import { ProfileEditModal } from '../modals/ProfileEditModal'
import { ReportIssueModal } from '../modals/ReportIssueModal'
import { ThemeModal } from '../modals/ThemeModal'
import { EmptyState } from './EmptyState'
import { RoomView } from './RoomView'
import { Sidebar } from './Sidebar'

export interface ChatViewProps {
  session: Session
  avatarRevision: number
  onLogout: () => void
  onPresenceChange: (status: PresenceStatus) => Promise<User>
  onProfileUpdated: (userOrUpdater: User | ((prev: User) => User)) => void
  onThemeUpdated: (user: User) => void
}

export function ChatView({
  session,
  avatarRevision,
  onLogout,
  onPresenceChange,
  onProfileUpdated,
  onThemeUpdated,
}: ChatViewProps) {
  const online = useOnline()
  const [rooms, setRooms] = useState<Room[]>([])
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [pendingDm, setPendingDm] = useState<DmPartner | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true)
  const [toast, setToast] = useState<{ id: number; text: string; anchor: 'content' | 'modal' } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Message | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [searchUsers, setSearchUsers] = useState<DirectoryUser[]>([])
  const [forceScrollRequest, setForceScrollRequest] = useState(0)
  const [newRoomOpen, setNewRoomOpen] = useState(false)
  const [newDmOpen, setNewDmOpen] = useState(false)
  const [profileEditOpen, setProfileEditOpen] = useState(false)
  const [reportIssueOpen, setReportIssueOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [downloadModalOpen, setDownloadModalOpen] = useState(false)
  const [previewTheme, setPreviewTheme] = useState<Theme | null>(null)
  const [loadingRoom, setLoadingRoom] = useState(false)
  const [composing, setComposing] = useState(false)
  const [typingByRoom, setTypingByRoom] = useState<Record<string, Record<string, TypingUser>>>({})
  const {
    installEvent,
    standalone,
    appInstalled,
    installCardDismissed,
    dismissInstallCard,
    installApp,
  } = usePwaInstall()
  const [avatarVersions, setAvatarVersions] = useState<Record<string, string>>({})
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  const activeRoomIdRef = useRef(activeRoomId)
  activeRoomIdRef.current = activeRoomId
  const sidebarOpenRef = useRef(sidebarOpen)
  sidebarOpenRef.current = sidebarOpen
  const pendingDmRef = useRef(pendingDm)
  pendingDmRef.current = pendingDm
  const roomsRef = useRef(rooms)
  roomsRef.current = rooms
  const onlineRef = useRef(online)
  onlineRef.current = online
  const wsRef = useRef<WebSocket | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const roomLoadRequestRef = useRef(0)
  const isInitializingConversationRef = useRef(false)

  const me = session.user
  const effectiveTheme = themeOpen ? previewTheme ?? me.theme : me.theme

  const presenceStatusRef = useRef(me.presenceStatus)
  presenceStatusRef.current = me.presenceStatus
  const presenceUpdateInFlightRef = useRef(false)
  const onPresenceChangeRef = useRef(onPresenceChange)
  onPresenceChangeRef.current = onPresenceChange

  const changePresenceManually = useCallback(
    async (status: PresenceStatus) => {
      try {
        if (status === 'online') localStorage.removeItem(MANUAL_PRESENCE_KEY)
        else localStorage.setItem(MANUAL_PRESENCE_KEY, status)
      } catch {
        /* armazenamento indisponível */
      }
      return onPresenceChange(status)
    },
    [onPresenceChange],
  )

  const registerInteraction = useCallback(() => {
    if (presenceStatusRef.current !== 'away' || presenceUpdateInFlightRef.current) return
    presenceUpdateInFlightRef.current = true
    void onPresenceChange('online')
      .catch(() => undefined)
      .finally(() => {
        presenceUpdateInFlightRef.current = false
      })
  }, [onPresenceChange])

  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let lastInteraction = Date.now()

    const scheduleAway = () => {
      if (idleTimer) clearTimeout(idleTimer)
      const remaining = Math.max(0, 10 * 60 * 1000 - (Date.now() - lastInteraction))
      idleTimer = setTimeout(() => {
        if (presenceStatusRef.current === 'online' && !presenceUpdateInFlightRef.current) {
          presenceUpdateInFlightRef.current = true
          void onPresenceChangeRef.current('away')
            .catch(() => undefined)
            .finally(() => {
              presenceUpdateInFlightRef.current = false
            })
        }
      }, remaining)
    }

    const onInteraction = () => {
      lastInteraction = Date.now()
      scheduleAway()
      registerInteraction()
    }

    const events: (keyof DocumentEventMap)[] = ['pointerdown', 'keydown', 'input', 'touchstart']
    events.forEach((event) => document.addEventListener(event, onInteraction, true))

    let lastMouseMove = 0
    const onMouseMove = () => {
      const now = Date.now()
      if (now - lastMouseMove < 1000) return
      lastMouseMove = now
      onInteraction()
    }
    document.addEventListener('mousemove', onMouseMove, true)

    scheduleAway()
    return () => {
      if (idleTimer) clearTimeout(idleTimer)
      events.forEach((event) => document.removeEventListener(event, onInteraction, true))
      document.removeEventListener('mousemove', onMouseMove, true)
    }
  }, [registerInteraction, onPresenceChange])

  const myAvatarVersion = `${me.updatedAt}|r${avatarRevision}`

  const activeRoom = useMemo(() => {
    const found = rooms.find((r) => r.id === activeRoomId)
    if (found) return found
    if (activeRoomId?.startsWith('pending:') && pendingDm) {
      return {
        id: `pending:${pendingDm.userId}`,
        name: pendingDm.username,
        displayName: pendingDm.name,
        type: 'DIRECT' as const,
        createdBy: null,
        readOnly: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActivityAt: null,
        unreadCount: 0,
        favorite: false,
        directPartner: {
          userId: pendingDm.userId,
          username: pendingDm.username,
          name: pendingDm.name,
          email: null,
          accountStatus: 'ACTIVE',
          presenceStatus: pendingDm.presenceStatus ?? 'offline',
        },
        pinnedMessage: null,
      } as Room
    }
    return null
  }, [rooms, activeRoomId, pendingDm])

  const showToast = useCallback((text: string, anchor: 'content' | 'modal' = 'content') => {
    setToast({ id: Date.now(), text, anchor })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }, [])

  const modalNotify = useCallback((text: string) => showToast(text, 'modal'), [showToast])

  useEffect(() => {
    registerModalToastDismiss(() => setToast((current) => (current && current.anchor === 'modal' ? null : current)))
    return () => registerModalToastDismiss(null)
  }, [])

  const sendTypingStatus = useCallback((roomId: string, isTyping: boolean) => {
    if (roomId.startsWith('pending:')) return
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'chat.typing', roomId, isTyping }))
      } catch {
        /* ignora erro */
      }
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setTypingByRoom((prev) => {
        let changed = false
        const next: Record<string, Record<string, TypingUser>> = {}
        for (const [roomId, users] of Object.entries(prev)) {
          const activeUsers: Record<string, TypingUser> = {}
          for (const [userId, user] of Object.entries(users)) {
            if (now - user.timestamp < 4500) {
              activeUsers[userId] = user
            } else {
              changed = true
            }
          }
          if (Object.keys(activeUsers).length > 0) {
            next[roomId] = activeUsers
          } else if (Object.keys(users).length > 0) {
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const loadRooms = useCallback(async () => {
    try {
      const nextRooms = await api.rooms()
      setRooms(nextRooms.map((room) => (room.id === activeRoomIdRef.current ? { ...room, unreadCount: 0 } : room)))
    } catch {
      showToast('Falha ao carregar salas')
    }
  }, [showToast])

  useEffect(() => {
    loadRooms()
  }, [loadRooms])

  useEffect(() => {
    const query = search.trim()
    if (!query) {
      setSearchUsers([])
      return
    }
    let active = true
    api
      .userDirectory(query)
      .then((users) => {
        if (active) setSearchUsers(users.filter((user) => user.accountStatus !== 'DISABLED'))
      })
      .catch(() => {
        if (active) setSearchUsers([])
      })
    return () => {
      active = false
    }
  }, [search, me.id])

  const openRoom = useCallback(
    async (roomId: string) => {
      setPendingDm(null)
      const requestId = ++roomLoadRequestRef.current
      isInitializingConversationRef.current = true
      setActiveRoomId(roomId)
      window.history.pushState({ konnix: 'room' }, '')
      setMessages([])
      setHasMore(false)
      setNextBefore(null)
      setSidebarOpen(false)
      setRooms((prev) => prev.map((room) => (room.id === roomId ? { ...room, unreadCount: 0 } : room)))
      setLoadingRoom(true)
      try {
        const res = await api.messages(roomId, 50)
        if (requestId !== roomLoadRequestRef.current) return
        setMessages(res.messages)
        setHasMore(res.hasMore)
        setNextBefore(res.nextBefore)
        setLoadingRoom(false)
        void api.markRoomRead(roomId).catch(() => undefined)
      } catch {
        if (requestId !== roomLoadRequestRef.current) return
        setMessages([])
        setHasMore(false)
        showToast('Falha ao carregar mensagens')
      } finally {
        if (requestId === roomLoadRequestRef.current) setLoadingRoom(false)
      }
    },
    [showToast],
  )

  const openSidebar = useCallback(() => {
    if (isMobilePlatform()) {
      window.history.pushState({ konnix: 'sidebar' }, '')
    }
    setSidebarOpen(true)
  }, [])

  const closeSidebar = useCallback(() => {
    if (isMobilePlatform() && window.history.state && window.history.state.konnix === 'sidebar') {
      window.history.back()
    } else {
      setSidebarOpen(false)
    }
  }, [])

  const closeRoom = useCallback(() => {
    roomLoadRequestRef.current += 1
    setActiveRoomId(null)
    setMessages([])
    setLoadingRoom(false)
    setHasMore(false)
    setNextBefore(null)
    setPendingDm(null)
    setSidebarOpen(true)
  }, [])

  const requestBack = useCallback(() => {
    if (window.history.state && window.history.state.konnix === 'room') {
      window.history.back()
    } else {
      closeRoom()
    }
  }, [closeRoom])

  useEffect(() => {
    const handleBack = () => {
      if (activeRoomIdRef.current) {
        closeRoom()
        return
      }
      if (isMobilePlatform() && sidebarOpenRef.current) {
        setSidebarOpen(false)
      }
    }
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [closeRoom])

  useEffect(() => {
    api
      .readReceiptSetting()
      .then((setting) => setReadReceiptsEnabled(setting.enabled))
      .catch(() => undefined)
  }, [])

  const loadMore = useCallback(async () => {
    if (isInitializingConversationRef.current || !activeRoomId || !nextBefore) {
      return
    }
    try {
      const res = await api.messages(activeRoomId, 50, nextBefore)
      setMessages((prev) => [...res.messages, ...prev])
      setHasMore(res.hasMore)
      setNextBefore(res.nextBefore)
    } catch {
      showToast('Falha ao carregar mais mensagens')
    }
  }, [activeRoomId, nextBefore, showToast])

  useEffect(() => {
    if (!session.token) return
    let ws: WebSocket | null = null
    let closedByUser = false
    let retry: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      ws = new WebSocket(wsUrl())
      wsRef.current = ws
      ws.onopen = () => {
        const manual = readManualPresence()
        if (manual) {
          if (manual !== presenceStatusRef.current && !presenceUpdateInFlightRef.current) {
            presenceUpdateInFlightRef.current = true
            void onPresenceChangeRef.current(manual)
              .catch(() => undefined)
              .finally(() => {
                presenceUpdateInFlightRef.current = false
              })
          }
        } else if (presenceStatusRef.current === 'offline') {
          presenceUpdateInFlightRef.current = true
          void onPresenceChangeRef.current('online')
            .catch(() => undefined)
            .finally(() => {
              presenceUpdateInFlightRef.current = false
            })
        }
        void loadRooms()
      }
      ws.onmessage = (event) => {
        try {
          const evt = JSON.parse(event.data as string) as {
            type: string
            roomId: string
            data: Message
          }
          if (evt.type === 'message.created') {
            const msg = evt.data
            if (msg.userId) {
              setTypingByRoom((prev) => {
                if (!prev[msg.roomId] || !prev[msg.roomId][msg.userId!]) return prev
                const roomTyping = { ...prev[msg.roomId] }
                delete roomTyping[msg.userId!]
                return { ...prev, [msg.roomId]: roomTyping }
              })
            }
            const appInBackground = document.visibilityState !== 'visible' || !document.hasFocus()
            const isActiveRoom = msg.roomId === activeRoomIdRef.current
            const isIncomingRelevant = msg.messageType !== 'SYSTEM' && msg.userId !== me.id
            const shouldUnread = isIncomingRelevant && !isActiveRoom
            setRooms((prev) => {
              const exists = prev.some((room) => room.id === msg.roomId)
              if (!exists) {
                void loadRooms()
                return prev
              }
              const updated = prev.map((room) =>
                room.id === msg.roomId
                  ? {
                      ...room,
                      lastActivityAt: msg.createdAt,
                      unreadCount: isActiveRoom
                        ? 0
                        : shouldUnread
                        ? (room.unreadCount ?? 0) + 1
                        : room.unreadCount ?? 0,
                    }
                  : room,
              )
              return updated.sort((a, b) => roomActivityTime(b) - roomActivityTime(a))
            })
            if (msg.roomId === activeRoomIdRef.current) {
              setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
              if (isIncomingRelevant && !appInBackground) {
                api.markRoomRead(msg.roomId).catch(() => undefined)
              }
            }
            if (isIncomingRelevant) {
              const room = roomsRef.current.find((r) => r.id === msg.roomId)
              const label = room ? roomDisplayName(room) : 'Chat'
              const isDirect = room?.type === 'DIRECT'
              const notifTitle = isDirect ? (msg.username || 'Konnix Chat') : `${label} • ${msg.username}`

              let snippet = msg.content?.replace(/\s+/g, ' ').trim() || ''
              if (!snippet && msg.attachment) {
                if (msg.attachment.mimeType?.startsWith('audio/')) {
                  snippet = '🎤 Mensagem de áudio'
                } else if (msg.attachment.mimeType?.startsWith('image/')) {
                  snippet = '📷 Enviou uma foto'
                } else {
                  snippet = `📎 Arquivo: ${msg.attachment.originalName || 'Anexo'}`
                }
              } else if (!snippet && msg.poll) {
                snippet = `📊 Enquete: ${msg.poll.question}`
              }
              const notifBody = snippet || 'Nova mensagem'

              // Respeitar status de presença: se ocupado ou em missão, só notifica DM ou menção direta
              const currentPresence = presenceStatusRef.current
              const isMentioned = Boolean(
                msg.content &&
                  me.username &&
                  msg.content.toLowerCase().includes(`@${me.username.toLowerCase()}`)
              )
              const suppressNotification =
                (currentPresence === 'busy' || currentPresence === 'mission') && !isDirect && !isMentioned

              if (appInBackground && !suppressNotification) {
                let enabled = false
                try {
                  enabled = localStorage.getItem('konnix-system-notifications') === 'true'
                } catch {
                  /* preferência opcional */
                }
                if (enabled) {
                  if (isTauri) {
                    void notifyDesktop(notifTitle, notifBody, msg.roomId).catch(() => undefined)
                  } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    void notifyDesktop(notifTitle, notifBody, msg.roomId).catch(() => undefined)
                  }
                }
              } else if (!isActiveRoom && !suppressNotification) {
                showToast(`${notifTitle}: ${notifBody}`)
              }
            }
          } else if (evt.type === 'chat.typing') {
            const payload = evt.data as unknown as {
              userId: string
              username: string
              name: string
              isTyping: boolean
            }
            const roomId = evt.roomId
            if (roomId && payload?.userId && payload.userId !== me.id) {
              if (payload.isTyping) {
                setTypingByRoom((prev) => {
                  const currentRoomTyping = { ...(prev[roomId] ?? {}) }
                  currentRoomTyping[payload.userId] = {
                    userId: payload.userId,
                    username: payload.username,
                    name: payload.name,
                    timestamp: Date.now(),
                  }
                  return { ...prev, [roomId]: currentRoomTyping }
                })
              } else {
                setTimeout(() => {
                  setTypingByRoom((prev) => {
                    const currentRoomTyping = prev[roomId]
                    if (!currentRoomTyping || !currentRoomTyping[payload.userId]) return prev
                    const user = currentRoomTyping[payload.userId]
                    if (Date.now() - user.timestamp < 1200) return prev
                    const updated = { ...currentRoomTyping }
                    delete updated[payload.userId]
                    return { ...prev, [roomId]: updated }
                  })
                }, 1200)
              }
            }
          } else if (evt.type === 'message.read') {
            const receipt = evt.data as unknown as ReadReceipt & { messageId: string }
            if (receipt.messageId) {
              setMessages((prev) => {
                const index = prev.findIndex((message) => message.id === receipt.messageId)
                if (index < 0) return prev
                const message = prev[index]
                if (message.readBy?.some((reader) => reader.userId === receipt.userId)) return prev
                const next = prev.slice()
                next[index] = { ...message, readBy: [...(message.readBy ?? []), receipt] }
                return next
              })
            }
          } else if (evt.type === 'message.reaction') {
            const reaction = evt.data as unknown as MessageReaction & { removed: boolean }
            setMessages((prev) => {
              const index = prev.findIndex((message) => message.id === reaction.messageId)
              if (index < 0) return prev
              const message = prev[index]
              const current = message.reactions ?? []
              const nextReactions = reaction.removed
                ? current.filter((entry) => !(entry.userId === reaction.userId && entry.emoji === reaction.emoji))
                : [
                    ...current.filter(
                      (entry) => !(entry.userId === reaction.userId && entry.emoji === reaction.emoji),
                    ),
                    reaction,
                  ]
              if (nextReactions.length === current.length && reaction.removed) return prev
              const next = prev.slice()
              next[index] = { ...message, reactions: nextReactions }
              return next
            })
          } else if (evt.type === 'message.updated' || evt.type === 'message.deleted') {
            const msg = evt.data
            if (msg.roomId === activeRoomIdRef.current) {
              setMessages((prev) => {
                const index = prev.findIndex((message) => message.id === msg.id)
                if (index < 0) return prev
                const next = prev.slice()
                next[index] = msg
                return next
              })
            }
          } else if (evt.type === 'presence.updated') {
            const presence = evt.data as unknown as { userId: string; status: PresenceStatus }
            if (presence.userId === me.id) {
              onProfileUpdated((prev) => ({ ...prev, presenceStatus: presence.status }))
            }
            setRooms((prev) =>
              prev.map((room) =>
                room.directPartner?.userId === presence.userId
                  ? { ...room, directPartner: { ...room.directPartner, presenceStatus: presence.status } }
                  : room,
              ),
            )
            setSearchUsers((prev) =>
              prev.map((user) => (user.id === presence.userId ? { ...user, presenceStatus: presence.status } : user)),
            )
            window.dispatchEvent(new CustomEvent('konnix:presence', { detail: presence }))
          } else if (evt.type === 'avatar.updated') {
            const payload = evt.data as unknown as { userId: string }
            if (payload?.userId) {
              setAvatarVersions((prev) => ({ ...prev, [payload.userId]: `${Date.now()}` }))
            }
          } else if (evt.type === 'room.added') {
            const room = evt.data as unknown as Room
            if (room?.id) {
              setRooms((prev) => (prev.some((item) => item.id === room.id) ? prev : [room, ...prev]))
            }
          } else if (evt.type === 'room.removed') {
            const removedRoomId = evt.roomId
            if (removedRoomId) {
              setRooms((prev) => prev.filter((room) => room.id !== removedRoomId))
              if (activeRoomIdRef.current === removedRoomId) {
                roomLoadRequestRef.current += 1
                setActiveRoomId(null)
                setMessages([])
                setLoadingRoom(false)
                setHasMore(false)
                setNextBefore(null)
              }
            }
          } else if (evt.type === 'room.pinned_message') {
            const payload = evt.data as unknown as { roomId: string; pinnedMessage: Message | null }
            if (payload?.roomId) {
              setRooms((prev) =>
                prev.map((room) =>
                  room.id === payload.roomId ? { ...room, pinnedMessage: payload.pinnedMessage } : room,
                ),
              )
            }
          } else if (evt.type === 'room.updated') {
            const updated = evt.data as unknown as Room
            if (updated?.id) {
              setRooms((prev) =>
                prev.map((room) =>
                  room.id === updated.id
                    ? {
                        ...room,
                        name: updated.name,
                        displayName: updated.displayName,
                        readOnly: updated.readOnly,
                        type: updated.type,
                        updatedAt: updated.updatedAt,
                      }
                    : room,
                ),
              )
            }
          } else if (evt.type === 'room.favorite.updated') {
            const payload = evt.data as unknown as { roomId: string; favorite: boolean }
            if (payload?.roomId) {
              setRooms((prev) =>
                prev.map((room) => (room.id === payload.roomId ? { ...room, favorite: payload.favorite } : room)),
              )
            }
          }
        } catch {
          /* ignora payloads inválidos */
        }
      }
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null
        if (!closedByUser) {
          retry = setTimeout(connect, 1000)
        }
      }
      ws.onerror = () => ws?.close()
    }

    connect()

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        const currentWs = wsRef.current
        if (!currentWs || currentWs.readyState === WebSocket.CLOSED) {
          connect()
        }
        const activeRoom = activeRoomIdRef.current
        if (activeRoom && !activeRoom.startsWith('pending:')) {
          setRooms((prev) => prev.map((room) => (room.id === activeRoom ? { ...room, unreadCount: 0 } : room)))
          void api.markRoomRead(activeRoom).catch(() => undefined)
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibilityOrFocus)
    window.addEventListener('focus', onVisibilityOrFocus)

    return () => {
      closedByUser = true
      document.removeEventListener('visibilitychange', onVisibilityOrFocus)
      window.removeEventListener('focus', onVisibilityOrFocus)
      if (retry) clearTimeout(retry)
      ws?.close()
    }
  }, [session.token, showToast, loadRooms, me.id, onProfileUpdated])

  useEffect(() => {
    if (!session.token) return
    const interval = setInterval(() => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        void loadRooms()
      }
    }, 60_000)
    return () => clearInterval(interval)
  }, [session.token, loadRooms])

  useEffect(() => {
    if (!session.token) return
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      const activeRoom = activeRoomIdRef.current
      if (activeRoom && !activeRoom.startsWith('pending:')) {
        setRooms((prev) => prev.map((room) => (room.id === activeRoom ? { ...room, unreadCount: 0 } : room)))
        void api.markRoomRead(activeRoom).catch(() => undefined)
      }
    }, 10_000)
    return () => clearInterval(interval)
  }, [session.token])

  useEffect(() => {
    if (!session.token) return
    void syncPushSubscription().catch(() => undefined)
  }, [session.token])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; roomId?: string } | null
      if (data && data.type === 'konnix:navigate' && typeof data.roomId === 'string' && data.roomId) {
        openRoom(data.roomId)
      }
    }
    const onDesktopNotification = (e: Event) => {
      const roomId = (e as CustomEvent<{ roomId?: string }>).detail?.roomId
      if (roomId) openRoom(roomId)
    }
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', onMessage)
    window.addEventListener('konnix:navigate', onDesktopNotification)
    return () => {
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', onMessage)
      window.removeEventListener('konnix:navigate', onDesktopNotification)
    }
  }, [openRoom])

  useEffect(() => {
    const totalUnread = rooms.reduce((acc, r) => acc + (r.unreadCount || 0), 0)
    updateAppBadge(totalUnread)
  }, [rooms])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let active = true
    navigator.serviceWorker.ready
      .then((reg) => {
        if (!active) return
        const check = () => {
          if (reg.waiting) setWaitingWorker(reg.waiting)
        }
        reg.addEventListener('updatefound', () => {
          const w = reg.installing
          if (w) {
            w.addEventListener('statechange', () => {
              if (w.state === 'installed' && navigator.serviceWorker.controller) {
                setWaitingWorker(w)
              }
            })
          }
        })
        check()
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!waitingWorker) return
    const onControllerChange = () => window.location.reload()
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }, [waitingWorker])

  const installAppDirectly = useCallback(async () => {
    if (standalone) {
      setDownloadModalOpen(true)
      return
    }
    const success = await installApp()
    if (!success) {
      setDownloadModalOpen(true)
    }
  }, [standalone, installApp])

  const sendMessage = async (
    content: string,
    parentMessageId?: string,
    attachments: File[] = [],
  ): Promise<boolean> => {
    let roomId = activeRoomId
    if (!roomId || (!content.trim() && attachments.length === 0) || !online || composing || me.accountStatus === 'READ_ONLY')
      return false
    if (roomId.startsWith('pending:')) {
      const user = pendingDmRef.current
      if (!user) return false
      try {
        setComposing(true)
        const room = await api.createDm(user.userId)
        roomId = room.id
        setPendingDm(null)
        setActiveRoomId(room.id)
        setRooms((previous) => (previous.some((item) => item.id === room.id) ? previous : [room, ...previous]))
        setMessages([])
        setHasMore(false)
        setNextBefore(null)
        void api.markRoomRead(room.id).catch(() => undefined)
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Não foi possível iniciar a conversa')
        setComposing(false)
        return false
      }
    }
    setComposing(true)
    try {
      let createdMessages: Message[]
      if (attachments.length === 0) {
        createdMessages = [await api.sendMessage(roomId, content.trim(), parentMessageId)]
      } else {
        createdMessages = await Promise.all(
          attachments.map(async (file, index) => {
            const created = await api.uploadFile(roomId, file, index === 0 ? content.trim() : undefined)
            if (created.attachment?.id) {
              const localUrl = URL.createObjectURL(file)
              attachmentBlobCache.set(created.attachment.id, localUrl)
            }
            return created
          }),
        )
      }
      for (const created of createdMessages) {
        setRooms((prev) =>
          prev.map((room) => (room.id === roomId ? { ...room, lastActivityAt: created.createdAt } : room)),
        )
        setMessages((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, created]))
      }
      return true
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Falha ao enviar mensagem')
      return false
    } finally {
      setComposing(false)
    }
  }

  const reactMessage = async (message: Message, emoji: string) => {
    if (me.accountStatus === 'READ_ONLY') return
    try {
      const reaction = await api.toggleReaction(message.id, emoji)
      setMessages((prev) =>
        prev.map((item) => {
          if (item.id !== message.id) return item
          const current = item.reactions ?? []
          const next =
            reaction.id === null
              ? current.filter((entry) => !(entry.userId === me.id && entry.emoji === emoji))
              : [...current.filter((entry) => !(entry.userId === me.id && entry.emoji === emoji)), reaction]
          return { ...item, reactions: next }
        }),
      )
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : 'Falha ao reagir à mensagem')
    }
  }

  const startDirectConversation = useCallback(
    (userId: string, partner?: Omit<DmPartner, 'userId'>) => {
      const existing = rooms.find((room) => room.type === 'DIRECT' && room.directPartner?.userId === userId)
      if (existing) {
        void openRoom(existing.id)
        return
      }
      setPendingDm({
        userId,
        username: partner?.username ?? 'usuário',
        name: partner?.name ?? 'Usuário',
        presenceStatus: partner?.presenceStatus,
      })
      setActiveRoomId(`pending:${userId}`)
      window.history.pushState({ konnix: 'room' }, '')
      setMessages([])
      setHasMore(false)
      setNextBefore(null)
      setSidebarOpen(false)
      setLoadingRoom(false)
      isInitializingConversationRef.current = false
    },
    [rooms, openRoom],
  )

  const startUserDmFromSearch = useCallback(
    (userId: string, partner?: Omit<DmPartner, 'userId'>) => {
      const user = searchUsers.find((item) => item.id === userId)
      startDirectConversation(
        userId,
        partner ??
          (user
            ? { username: user.username, name: user.name || user.username, presenceStatus: user.presenceStatus }
            : undefined),
      )
      setForceScrollRequest((request) => request + 1)
      setSearch('')
    },
    [startDirectConversation, searchUsers],
  )

  const openTheme = useCallback(() => {
    setPreviewTheme(me.theme)
    setThemeOpen(true)
  }, [me.theme])
  const openProfileEdit = useCallback(() => setProfileEditOpen(true), [])
  const openAbout = useCallback(() => setAboutOpen(true), [])
  const openReportIssue = useCallback(() => setReportIssueOpen(true), [])
  const openNewRoom = useCallback(() => setNewRoomOpen(true), [])
  const openNewDm = useCallback(() => setNewDmOpen(true), [])

  const handleDelete = async (msg: Message, notifier: (text: string) => void = showToast) => {
    if (msg.deletedAt || msg.userId !== me.id || me.accountStatus === 'READ_ONLY') return
    try {
      const deleted = await api.deleteMessage(msg.id)
      setMessages((prev) => prev.map((m) => (m.id === deleted.id ? deleted : m)))
    } catch (err) {
      notifier(err instanceof ApiError ? err.message : 'Falha ao excluir mensagem')
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const message = pendingDelete
    setPendingDelete(null)
    await handleDelete(message, modalNotify)
  }

  const handleRoomCreated = async (roomId: string) => {
    setNewRoomOpen(false)
    setNewDmOpen(false)
    await loadRooms()
    await openRoom(roomId)
  }

  const addSearchResult = useCallback((result: Message) => {
    setMessages((previous) =>
      previous.some((message) => message.id === result.id)
        ? previous
        : [...previous, result].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    )
  }, [])

  const q = search.trim().toLowerCase()
  const channels = useMemo(
    () =>
      rooms
        .filter(
          (r) =>
            r.type !== 'DIRECT' &&
            (!q || `${roomDisplayName(r)} ${r.name ?? ''}`.toLowerCase().includes(q)),
        )
        .sort((a, b) => roomActivityTime(b) - roomActivityTime(a)),
    [rooms, q],
  )
  const conversations = useMemo(
    () =>
      rooms
        .filter(
          (r) =>
            r.type === 'DIRECT' &&
            r.directPartner?.accountStatus !== 'DISABLED' &&
            (!q || `${roomDisplayName(r)} ${r.directPartner?.username ?? ''}`.toLowerCase().includes(q)),
        )
        .sort((a, b) => roomActivityTime(b) - roomActivityTime(a)),
    [rooms, q],
  )
  const favoriteRooms = useMemo(
    () => rooms.filter((room) => room.favorite && room.directPartner?.accountStatus !== 'DISABLED'),
    [rooms],
  )
  const regularConversations = useMemo(() => conversations.filter((room) => !room.favorite), [conversations])
  const regularChannels = useMemo(() => channels.filter((room) => !room.favorite), [channels])

  return (
    <div className="chat-shell">
      <div className={`chat-body ${sidebarOpen ? 'sidebar-open' : ''}`}>
        {sidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar} />}
        <Sidebar
          me={me}
          theme={effectiveTheme}
          channels={regularChannels}
          favoriteRooms={favoriteRooms}
          regularConversations={regularConversations}
          activeRoomId={activeRoomId}
          search={search}
          userResults={searchUsers}
          onSearch={setSearch}
          onOpenRoom={openRoom}
          onNewRoom={openNewRoom}
          onNewDm={openNewDm}
          onStartUserDm={startUserDmFromSearch}
          onLogout={onLogout}
          onTheme={openTheme}
          onEditProfile={openProfileEdit}
          onAbout={openAbout}
          onReportIssue={openReportIssue}
          myAvatarVersion={myAvatarVersion}
          onInstallApp={installAppDirectly}
          standalone={standalone}
          appInstalled={appInstalled}
          installCardDismissed={installCardDismissed}
          onDismissInstallCard={dismissInstallCard}
          onPresenceChange={changePresenceManually}
          onPresenceError={showToast}
          typingByRoom={typingByRoom}
          avatarVersions={avatarVersions}
          onClose={closeSidebar}
        />

        <main className="main">
          {!activeRoom ? (
            <EmptyState onOpenSidebar={openSidebar} />
          ) : (
            <RoomView
              room={activeRoom}
              rooms={rooms}
              messages={messages}
              loading={loadingRoom}
              forceScrollRequest={forceScrollRequest}
              hasMore={hasMore}
              loadMore={loadMore}
              composing={composing}
              online={online}
              me={me}
              myAvatarVersion={myAvatarVersion}
              avatarVersions={avatarVersions}
              typingUsers={typingByRoom[activeRoom.id]}
              onTyping={(isTyping) => sendTypingStatus(activeRoom.id, isTyping)}
              onBack={requestBack}
              onSend={sendMessage}
              onInitialPositioned={() => {
                isInitializingConversationRef.current = false
              }}
              onDelete={(message) => {
                if (!message.deletedAt && message.userId === me.id && me.accountStatus !== 'READ_ONLY') {
                  setPendingDelete(message)
                }
              }}
              onMessageUpdated={(updated) =>
                setMessages((current) => current.map((item) => (item.id === updated.id ? updated : item)))
              }
              onReaction={(message, emoji) => void reactMessage(message, emoji)}
              onStartDm={startDirectConversation}
              notify={showToast}
              readReceiptsEnabled={readReceiptsEnabled}
              onSearchResult={addSearchResult}
              onPollUpdated={addSearchResult}
              onRoomUpdated={(updated) =>
                setRooms((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
              }
              onOpenRoom={openRoom}
            />
          )}
        </main>
      </div>

      {newRoomOpen && (
        <NewRoomModal
          me={me}
          onClose={() => setNewRoomOpen(false)}
          onCreated={handleRoomCreated}
          showToast={modalNotify}
        />
      )}
      {newDmOpen && (
        <NewDmModal
          me={me}
          onClose={() => setNewDmOpen(false)}
          onSelect={(user) => {
            setNewDmOpen(false)
            startDirectConversation(user.id, {
              username: user.username,
              name: user.name || user.username,
              presenceStatus: user.presenceStatus,
            })
          }}
        />
      )}

      {profileEditOpen && (
        <ProfileEditModal
          me={me}
          myAvatarVersion={myAvatarVersion}
          onClose={() => setProfileEditOpen(false)}
          onSaved={(user) => {
            onProfileUpdated(user)
            setProfileEditOpen(false)
            void loadRooms()
          }}
          notify={modalNotify}
        />
      )}
      {themeOpen && (
        <ThemeModal
          theme={me.theme}
          onClose={() => setThemeOpen(false)}
          onPreview={setPreviewTheme}
          onSaved={(user) => {
            onThemeUpdated(user)
            setPreviewTheme(null)
            setThemeOpen(false)
          }}
          notify={modalNotify}
        />
      )}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {downloadModalOpen && (
        <DownloadAppModal
          onClose={() => setDownloadModalOpen(false)}
          installEvent={installEvent}
          onInstall={installApp}
          isInstalled={standalone || appInstalled}
        />
      )}
      {reportIssueOpen && <ReportIssueModal onClose={() => setReportIssueOpen(false)} notify={modalNotify} />}
      {pendingDelete && (
        <ConfirmModal
          title="Excluir mensagem"
          message="Esta ação não pode ser desfeita. Deseja excluir esta mensagem?"
          onClose={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}

      {!online && (
        <div className="offline-banner" role="alert">
          <strong>Você está offline.</strong> As mensagens anteriores ficaram disponíveis, mas não é
          possível enviar novas mensagens agora.
        </div>
      )}

      {waitingWorker && (
        <div className="update-banner">
          <span>Nova versão disponível.</span>
          <button
            onClick={() => {
              waitingWorker.postMessage({ type: 'konnix:skipWaiting' })
              setWaitingWorker(null)
            }}
          >
            Atualizar agora
          </button>
        </div>
      )}

      {toast && (
        <button
          className={`toast ${toast.anchor === 'modal' ? 'toast-modal' : ''}`}
          onClick={() => setToast(null)}
        >
          {toast.text}
        </button>
      )}
    </div>
  )
}
