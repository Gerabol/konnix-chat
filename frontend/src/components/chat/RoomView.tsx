import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react'
import { api, ApiError, formatDay, roomAvatarPath, userAvatarPath } from '../../api'
import type { Message, PresenceStatus, PublicProfile, Room, RoomFile, RoomMember, User } from '../../api'
import { detectLanguage, formatHtml, formatJson } from '../../CodeBlock'
import type { DmPartner, TypingUser } from '../../types'
import { getRoomIcon, ROOM_ICON, roomDisplayName, roomSubtitle } from '../../utils/room'
import { isMobilePlatform } from '../../utils/pwa'
import {
  IconArrowLeft,
  IconClip,
  IconCode,
  IconPencil,
  IconPlus,
  IconSearch,
  IconSend,
  IconStop,
  IconTrash,
  NoEntryIcon,
  PersonIcon,
} from '../icons'
import { ForwardMessageModal } from '../modals/ForwardMessageModal'
import { AddMembersModal, MembersModal, RemoveMembersModal } from '../modals/MembersModal'
import { CreatePollModal } from '../modals/PollModals'
import { ReadReceiptsModal } from '../modals/ReadReceiptsModal'
import { RespondToReportModal } from '../modals/ReportIssueModal'
import { RoomEditModal } from '../modals/RoomEditModal'
import { AudioRecordButton, useAudioRecorder } from './AudioRecordButton'
import { AvatarImage, initials } from './AvatarImage'
import { ComposerActionBox, ComposerPendingAttachments } from './ComposerActionBox'
import { EmojiButton } from './EmojiButton'
import { MessageRow } from './MessageRow'
import { RoomFilesPanel } from './RoomFilesPanel'
import { formatRecordingTime, formatTypingText, TypingDots } from './TypingIndicator'
import { RoomInfoCard, UserProfileCard } from './UserProfileCard'

const SEARCH_DEBOUNCE_MS = 400

export interface RoomViewProps {
  room: Room
  rooms: Room[]
  messages: Message[]
  loading: boolean
  forceScrollRequest: number
  hasMore: boolean
  loadMore: () => void
  composing: boolean
  online: boolean
  me: User
  myAvatarVersion: string
  avatarVersions: Record<string, string>
  typingUsers?: Record<string, TypingUser>
  onTyping?: (isTyping: boolean) => void
  onBack: () => void
  onSend: (content: string, parentMessageId?: string, attachments?: File[]) => Promise<boolean>
  onInitialPositioned: () => void
  onDelete: (msg: Message) => void
  onMessageUpdated: (message: Message) => void
  onReaction: (message: Message, emoji: string) => void
  onStartDm: (userId: string, partner?: Omit<DmPartner, 'userId'>) => void
  notify: (text: string, anchor?: 'content' | 'modal') => void
  readReceiptsEnabled: boolean
  onSearchResult: (message: Message) => void
  onPollUpdated: (message: Message) => void
  onRoomUpdated: (room: Room) => void
  onOpenRoom: (roomId: string) => void
}

export function RoomView({
  room,
  rooms,
  messages,
  loading,
  forceScrollRequest,
  hasMore,
  loadMore,
  composing,
  online,
  me,
  myAvatarVersion,
  avatarVersions,
  typingUsers,
  onTyping,
  onBack,
  onSend,
  onInitialPositioned,
  onDelete,
  onMessageUpdated,
  onReaction,
  onStartDm,
  notify,
  readReceiptsEnabled,
  onSearchResult,
  onPollUpdated,
  onRoomUpdated,
  onOpenRoom,
}: RoomViewProps) {
  const isPendingDm = room.id.startsWith('pending:')
  const typingText = formatTypingText(typingUsers, room.type === 'DIRECT')
  const modalNotify = useCallback((text: string) => notify(text, 'modal'), [notify])
  const lastTypingSentRef = useRef(0)
  const typingTimeoutRef = useRef<number | null>(null)
  const stopTypingTimeoutRef = useRef<number | null>(null)

  const stopTyping = useCallback((immediate: boolean = false) => {
    if (typingTimeoutRef.current !== null) {
      window.clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }
    if (stopTypingTimeoutRef.current !== null) {
      window.clearTimeout(stopTypingTimeoutRef.current)
      stopTypingTimeoutRef.current = null
    }
    lastTypingSentRef.current = 0
    if (immediate) {
      onTyping?.(false)
    } else {
      stopTypingTimeoutRef.current = window.setTimeout(() => {
        onTyping?.(false)
      }, 1500)
    }
  }, [onTyping])

  const notifyTyping = useCallback(() => {
    if (stopTypingTimeoutRef.current !== null) {
      window.clearTimeout(stopTypingTimeoutRef.current)
      stopTypingTimeoutRef.current = null
    }
    const now = Date.now()
    if (now - lastTypingSentRef.current > 1800) {
      lastTypingSentRef.current = now
      onTyping?.(true)
    }
    if (typingTimeoutRef.current !== null) {
      window.clearTimeout(typingTimeoutRef.current)
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      stopTyping(false)
    }, 4000)
  }, [onTyping, stopTyping])

  useEffect(() => {
    return () => {
      stopTyping(true)
    }
  }, [room.id, stopTyping])

  const [draft, setDraft] = useState('')
  const [composerExpanded, setComposerExpanded] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([])
  const [pendingAttachmentUrls, setPendingAttachmentUrls] = useState<string[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [readMessageId, setReadMessageId] = useState<string | null>(null)
  const [quotedMessage, setQuotedMessage] = useState<Message | null>(null)
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null)
  const [respondMessage, setRespondMessage] = useState<Message | null>(null)
  const [pinnedActionId, setPinnedActionId] = useState<string | null>(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [profileCommonRooms, setProfileCommonRooms] = useState<Room[]>([])
  const [profileCommonRoomsLoading, setProfileCommonRoomsLoading] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profilePosition, setProfilePosition] = useState({ top: 80, left: 24 })
  const [roomInfoOpen, setRoomInfoOpen] = useState(false)
  const [roomInfoPosition, setRoomInfoPosition] = useState({ top: 80, left: 24 })
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([])
  const [mention, setMention] = useState<{ start: number; end: number; query: string } | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [codeBlock, setCodeBlock] = useState<{ start: number; end: number; text: string } | null>(null)
  const [pollOpen, setPollOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Message[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null)
  const searchTimeoutRef = useRef<number | null>(null)
  const searchRequestIdRef = useRef(0)
  const isSearchLoadingRef = useRef(false)
  const inFlightSearchQueryRef = useRef<string | null>(null)
  const [filesOpen, setFilesOpen] = useState(false)
  const [roomFiles, setRoomFiles] = useState<RoomFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesError, setFilesError] = useState<string | null>(null)
  const [filesQuery, setFilesQuery] = useState('')
  const [filesType, setFilesType] = useState('ALL')
  const messageListRef = useRef<HTMLDivElement>(null)
  const pendingOlderScrollRef = useRef<{ oldScrollHeight: number; oldScrollTop: number } | null>(null)
  const scrollToBottomOnLoadRef = useRef(true)
  const forceScrollToBottomRef = useRef(false)
  const wasNearBottomRef = useRef(true)
  const [loadingPrevious, setLoadingPrevious] = useState(false)
  const [audioResetKey, setAudioResetKey] = useState(0)
  const [audioMode, setAudioMode] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [conversationReady, setConversationReady] = useState(false)
  const [dragDepth, setDragDepth] = useState(0)
  const isDragActive = dragDepth > 0
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const roomHeaderMenuRef = useRef<HTMLDivElement>(null)
  const [roomHeaderMenuOpen, setRoomHeaderMenuOpen] = useState(false)
  const readOnlyAccount = me.accountStatus === 'READ_ONLY'
  const isRoomOwner =
    room.type !== 'DIRECT' &&
    roomMembers.some((member) => member.userId === me.id && member.active && member.role === 'OWNER')
  const isAdmin = me.roles.includes('ADMIN')
  const muted = readOnlyAccount || (room.readOnly && !isAdmin && !isRoomOwner) || !online
  const emptyCodeBlock = /^```\s*\n\s*\n?\s*```$/.test(draft.trim())
  const canSubmit = (!!draft.trim() || pendingAttachments.length > 0) && !emptyCodeBlock
  const isBugReportsRoom = room.name === 'bug-reports'
  const canWriteInRoom = !readOnlyAccount && (!room.readOnly || isAdmin || isRoomOwner)
  const canRespondToReport = isBugReportsRoom && isAdmin
  const canManageRoom = room.type !== 'DIRECT' && (isRoomOwner || isAdmin)
  const isMember = roomMembers.some((member) => member.userId === me.id)

  useEffect(() => {
    const handlePresence = (e: Event) => {
      const detail = (e as CustomEvent<{ userId: string; status: PresenceStatus }>).detail
      if (detail?.userId) {
        setProfile((current) =>
          current && current.id === detail.userId ? { ...current, presenceStatus: detail.status } : current,
        )
      }
    }
    window.addEventListener('konnix:presence', handlePresence)
    return () => window.removeEventListener('konnix:presence', handlePresence)
  }, [])

  useEffect(() => {
    if (!roomHeaderMenuOpen) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (roomHeaderMenuRef.current && !roomHeaderMenuRef.current.contains(e.target as Node)) {
        setRoomHeaderMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [roomHeaderMenuOpen])

  const onRecordingChange = useCallback((recording: boolean, elapsedSeconds: number) => {
    setAudioMode(recording)
    setRecordingSeconds(recording ? elapsedSeconds : 0)
  }, [])

  const addPendingAttachments = useCallback((files: File[]) => {
    if (files.length === 0 || editingMessage) return
    setPendingAttachments((current) => {
      const next = [...current]
      for (const file of files) {
        if (next.length >= 10) break
        if (
          !next.some(
            (item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified,
          )
        ) {
          next.push(file)
        }
      }
      return next
    })
  }, [editingMessage])

  const audioRecorder = useAudioRecorder({
    resetKey: audioResetKey,
    onRecordingChange,
    onDone: (file) => {
      addPendingAttachments([file])
      setAudioMode(false)
    },
    onError: notify,
  })

  useEffect(() => {
    setAudioResetKey((key) => key + 1)
  }, [room.id])

  useEffect(() => {
    const urls = pendingAttachments.map((file) => URL.createObjectURL(file))
    setPendingAttachmentUrls(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [pendingAttachments])

  useEffect(() => {
    setPendingAttachments([])
  }, [room.id])

  useEffect(() => {
    if (room.type === 'DIRECT') {
      setRoomMembers([])
      return
    }
    let active = true
    api
      .members(room.id)
      .then((members) => {
        if (active) setRoomMembers(members)
      })
      .catch(() => {
        if (active) setRoomMembers([])
      })
    return () => {
      active = false
    }
  }, [room.id, room.type])

  const mentionOptions = useMemo(() => {
    if (!mention || room.type === 'DIRECT') return []
    const query = mention.query.toLowerCase()
    return roomMembers
      .filter((member) => member.active && member.userId !== me.id)
      .filter((member) => `${member.username} ${member.name}`.toLowerCase().includes(query))
      .slice(0, 8)
  }, [mention, room.type, roomMembers, me.id])

  useLayoutEffect(() => {
    scrollToBottomOnLoadRef.current = true
    forceScrollToBottomRef.current = false
    wasNearBottomRef.current = true
    pendingOlderScrollRef.current = null
    setConversationReady(false)
  }, [room.id])

  useEffect(() => {
    // Não expandir teclado ao entrar numa conversa em dispositivos mobile/touch
    const isTouchOrMobile =
      typeof window !== 'undefined' &&
      (isMobilePlatform() ||
        window.matchMedia('(pointer: coarse)').matches ||
        window.matchMedia('(max-width: 768px)').matches)
    if (isTouchOrMobile) return

    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [room.id])

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onViewportChange = () => {
      if (wasNearBottomRef.current && messageListRef.current) {
        messageListRef.current.scrollTop = messageListRef.current.scrollHeight
      }
    }
    vv.addEventListener('resize', onViewportChange)
    vv.addEventListener('scroll', onViewportChange)
    return () => {
      vv.removeEventListener('resize', onViewportChange)
      vv.removeEventListener('scroll', onViewportChange)
    }
  }, [])

  useEffect(() => {
    if (forceScrollRequest > 0) forceScrollToBottomRef.current = true
  }, [forceScrollRequest])

  useLayoutEffect(() => {
    if (loading) return
    const container = messageListRef.current
    if (!container) return

    if (messages.length === 0) {
      if (scrollToBottomOnLoadRef.current) {
        scrollToBottomOnLoadRef.current = false
        setConversationReady(true)
        onInitialPositioned()
      }
      return
    }

    if (pendingOlderScrollRef.current) {
      const { oldScrollHeight, oldScrollTop } = pendingOlderScrollRef.current
      pendingOlderScrollRef.current = null
      container.scrollTop = container.scrollHeight - oldScrollHeight + oldScrollTop
      setLoadingPrevious(false)
      return
    }

    const scrollToBottom = () => {
      if (container) container.scrollTop = container.scrollHeight
    }

    const observeMediaAndLayout = () => {
      let active = true
      let lastScrollHeight = container.scrollHeight
      const boundMedia = new Set<HTMLElement>()

      const wasAtBottomBeforeGrowth = () => {
        return container.scrollTop + container.clientHeight >= lastScrollHeight - 150
      }

      const adjustIfNeeded = () => {
        if (!active || !container) return
        const newScrollHeight = container.scrollHeight
        if (newScrollHeight > lastScrollHeight && wasAtBottomBeforeGrowth()) {
          container.scrollTop = newScrollHeight
          wasNearBottomRef.current = true
        }
        lastScrollHeight = newScrollHeight
      }

      const onMediaLoad = () => adjustIfNeeded()

      const bindMedia = (elements: HTMLElement[]) => {
        elements.forEach((el) => {
          if (!boundMedia.has(el)) {
            boundMedia.add(el)
            el.addEventListener('load', onMediaLoad)
            el.addEventListener('error', onMediaLoad)
            el.addEventListener('loadeddata', onMediaLoad)
          }
        })
      }

      const scanAndBindMedia = () => {
        const elements = Array.from(container.querySelectorAll<HTMLElement>('img, video, audio'))
        bindMedia(elements)
      }

      scanAndBindMedia()

      const mutationObserver =
        typeof MutationObserver !== 'undefined'
          ? new MutationObserver(() => {
              if (!active) return
              scanAndBindMedia()
              adjustIfNeeded()
            })
          : null
      mutationObserver?.observe(container, { childList: true, subtree: true })

      const resizeObserver =
        typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => adjustIfNeeded()) : null
      resizeObserver?.observe(container)
      const content = container.querySelector('.message-list-content')
      if (content) resizeObserver?.observe(content)

      return () => {
        active = false
        mutationObserver?.disconnect()
        resizeObserver?.disconnect()
        boundMedia.forEach((el) => {
          el.removeEventListener('load', onMediaLoad)
          el.removeEventListener('error', onMediaLoad)
          el.removeEventListener('loadeddata', onMediaLoad)
        })
        boundMedia.clear()
      }
    }

    if (scrollToBottomOnLoadRef.current) {
      scrollToBottomOnLoadRef.current = false
      forceScrollToBottomRef.current = false
      wasNearBottomRef.current = true
      scrollToBottom()
      setConversationReady(true)
      onInitialPositioned()
      return observeMediaAndLayout()
    }

    if (forceScrollToBottomRef.current) {
      forceScrollToBottomRef.current = false
      wasNearBottomRef.current = true
      scrollToBottom()
      return observeMediaAndLayout()
    }

    if (wasNearBottomRef.current) {
      scrollToBottom()
      return observeMediaAndLayout()
    }
  }, [loading, messages, room.id, onInitialPositioned])

  useEffect(() => {
    setDraft('')
    setComposerExpanded(false)
    setQuotedMessage(null)
    setForwardMessage(null)
    setPinnedActionId(null)
    setHighlightedMessageId(null)
    setSearchOpen(false)
    setSearchQuery('')
    setSearchResults([])
    setSearchedQuery(null)
    if (searchTimeoutRef.current !== null) {
      window.clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = null
    }
    searchRequestIdRef.current++
    isSearchLoadingRef.current = false
    inFlightSearchQueryRef.current = null
    setFilesOpen(false)
    setRoomFiles([])
    setFilesError(null)
    setFilesQuery('')
    setFilesType('ALL')
    setRoomInfoOpen(false)
  }, [room.id])

  const loadRoomFiles = useCallback(async () => {
    setFilesLoading(true)
    setFilesError(null)
    try {
      setRoomFiles(await api.roomFiles(room.id))
    } catch (error) {
      setRoomFiles([])
      setFilesError(error instanceof ApiError ? error.message : 'Não foi possível carregar os arquivos da conversa')
    } finally {
      setFilesLoading(false)
    }
  }, [room.id])

  const toggleFiles = () => {
    setFilesOpen((open) => {
      const next = !open
      if (next) void loadRoomFiles()
      return next
    })
  }

  useEffect(() => {
    if (searchOpen) requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [searchOpen])

  const jumpToMessage = useCallback((messageId: string) => {
    const element = document.querySelector(`[data-message-id="${messageId}"]`)
    if (!element) {
      notify('A mensagem original não está carregada neste trecho')
      return
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedMessageId(messageId)
    window.setTimeout(() => setHighlightedMessageId(null), 2200)
  }, [notify])

  const executeSearch = useCallback(
    async (rawQuery: string) => {
      if (searchTimeoutRef.current !== null) {
        window.clearTimeout(searchTimeoutRef.current)
        searchTimeoutRef.current = null
      }
      const query = rawQuery.trim()
      if (!query) {
        setSearchResults([])
        setSearchedQuery(null)
        isSearchLoadingRef.current = false
        setSearchLoading(false)
        inFlightSearchQueryRef.current = null
        return
      }
      if (isSearchLoadingRef.current && inFlightSearchQueryRef.current === query) {
        return
      }
      const requestId = ++searchRequestIdRef.current
      inFlightSearchQueryRef.current = query
      isSearchLoadingRef.current = true
      setSearchLoading(true)
      try {
        const results = await api.searchMessages(room.id, query)
        if (searchRequestIdRef.current === requestId) {
          setSearchResults(results)
          setSearchedQuery(query)
        }
      } catch {
        if (searchRequestIdRef.current === requestId) {
          notify('Não foi possível pesquisar nesta conversa')
          setSearchResults([])
          setSearchedQuery(query)
        }
      } finally {
        if (searchRequestIdRef.current === requestId) {
          inFlightSearchQueryRef.current = null
          isSearchLoadingRef.current = false
          setSearchLoading(false)
        }
      }
    },
    [room.id, notify],
  )

  useEffect(() => {
    if (!searchOpen) {
      if (searchTimeoutRef.current !== null) {
        window.clearTimeout(searchTimeoutRef.current)
        searchTimeoutRef.current = null
      }
      return
    }

    const query = searchQuery.trim()
    if (!query) {
      if (searchTimeoutRef.current !== null) {
        window.clearTimeout(searchTimeoutRef.current)
        searchTimeoutRef.current = null
      }
      setSearchResults([])
      setSearchedQuery(null)
      isSearchLoadingRef.current = false
      setSearchLoading(false)
      inFlightSearchQueryRef.current = null
      return
    }

    if (searchTimeoutRef.current !== null) {
      window.clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = window.setTimeout(() => {
      searchTimeoutRef.current = null
      void executeSearch(query)
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (searchTimeoutRef.current !== null) {
        window.clearTimeout(searchTimeoutRef.current)
        searchTimeoutRef.current = null
      }
    }
  }, [searchQuery, searchOpen, executeSearch])

  const searchConversation = useCallback(() => {
    void executeSearch(searchQuery)
  }, [executeSearch, searchQuery])

  const openSearchResult = (result: Message) => {
    onSearchResult(result)
    setSearchOpen(false)
    setSearchResults([])
    setSearchedQuery(null)
    requestAnimationFrame(() => requestAnimationFrame(() => jumpToMessage(result.id)))
  }

  const canManagePin = room.type !== 'DIRECT' && (isRoomOwner || me.roles.includes('ADMIN'))

  const handlePin = useCallback(async (message: Message) => {
    try {
      const updated = await api.pinMessage(room.id, message.id)
      onRoomUpdated(updated)
      notify('Mensagem fixada')
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Não foi possível fixar a mensagem')
    }
  }, [room.id, onRoomUpdated, notify])

  const handleUnpin = useCallback(async () => {
    try {
      const updated = await api.unpinMessage(room.id)
      onRoomUpdated(updated)
      notify('Mensagem desafixada')
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Não foi possível desafixar a mensagem')
    }
  }, [room.id, onRoomUpdated, notify])

  const handleJumpToPinned = () => {
    if (!room.pinnedMessage) return
    const msg = room.pinnedMessage
    if (!messages.some((m) => m.id === msg.id)) {
      onSearchResult(msg)
    }
    requestAnimationFrame(() => requestAnimationFrame(() => jumpToMessage(msg.id)))
  }

  const grouped = useMemo(() => {
    const out: { day: string; items: Message[] }[] = []
    for (const m of messages) {
      const day = formatDay(m.createdAt)
      const last = out[out.length - 1]
      if (last && last.day === day) last.items.push(m)
      else out.push({ day, items: [m] })
    }
    return out
  }, [messages])

  const hasDragFiles = (e: ReactDragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

  const handleDragEnter = (e: ReactDragEvent) => {
    if (!hasDragFiles(e)) return
    e.preventDefault()
    setDragDepth((depth) => depth + 1)
  }

  const handleDragOver = (e: ReactDragEvent) => {
    if (hasDragFiles(e)) e.preventDefault()
  }

  const handleDragLeave = (e: ReactDragEvent) => {
    if (!hasDragFiles(e)) return
    setDragDepth((depth) => Math.max(0, depth - 1))
  }

  const handleDrop = (e: ReactDragEvent) => {
    setDragDepth(0)
    if (!hasDragFiles(e)) return
    e.preventDefault()
    addPendingAttachments(Array.from(e.dataTransfer?.files ?? []).slice(0, 10))
  }

  const submit = async () => {
    stopTyping(true)
    if ((!draft.trim() && pendingAttachments.length === 0) || muted || composing) return
    const sendingAttachments = pendingAttachments.length > 0
    if (editingMessage) {
      try {
        const updated = await api.updateMessage(editingMessage.id, draft.trim())
        onMessageUpdated(updated)
        setEditingMessage(null)
        setDraft('')
        setComposerExpanded(false)
        requestAnimationFrame(() => inputRef.current?.focus())
      } catch (error) {
        notify(error instanceof ApiError ? error.message : 'Não foi possível editar a mensagem')
      }
      return
    }
    forceScrollToBottomRef.current = true
    const content = draft
    const attachmentList = pendingAttachments
    const quoted = quotedMessage
    setDraft('')
    setPendingAttachments([])
    setCodeBlock(null)
    setQuotedMessage(null)
    setComposerExpanded(false)
    const sent = await onSend(content, quoted?.id, attachmentList)
    if (!sent) {
      forceScrollToBottomRef.current = false
      setDraft(content)
      setPendingAttachments(attachmentList)
      setQuotedMessage(quoted)
    } else if (sendingAttachments) {
      forceScrollToBottomRef.current = true
    }
  }

  const startEditing = useCallback((message: Message) => {
    setEditingMessage(message)
    setDraft(message.content)
    setPendingAttachments([])
    setCodeBlock(null)
    setQuotedMessage(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const cancelEditing = () => {
    stopTyping()
    setEditingMessage(null)
    setDraft('')
    setComposerExpanded(false)
    setCodeBlock(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const showProfile = useCallback(async (userId: string, event?: ReactMouseEvent) => {
    const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0
    if (event) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      const vw = window.innerWidth
      const width = Math.min(560, vw - 24)
      if (vw <= 760) {
        setProfilePosition({
          top: Math.max(12 + safeTop, Math.min(rect.bottom + 8, 24 + safeTop)),
          left: Math.max(12, Math.round((vw - width) / 2)),
        })
      } else {
        setProfilePosition({
          top: Math.min(window.innerHeight - 360, Math.max(12 + safeTop, rect.bottom + 8)),
          left: Math.min(vw - width - 12, Math.max(12, rect.left)),
        })
      }
    }
    setProfileLoading(true)
    setProfileCommonRoomsLoading(true)
    const currentRoomIsCommon =
      room.type !== 'DIRECT' && roomMembers.some((member) => member.userId === userId && member.active)
    setProfileCommonRooms(currentRoomIsCommon ? [room] : [])
    const [profileResult, commonRoomsResult] = await Promise.allSettled([
      api.userProfile(userId),
      api.commonRooms(userId),
    ])
    if (profileResult.status === 'fulfilled') setProfile(profileResult.value)
    else {
      setProfile(null)
      notify('Não foi possível carregar o perfil')
    }
    setProfileLoading(false)
    if (commonRoomsResult.status === 'fulfilled') {
      const roomsById = new Map(commonRoomsResult.value.map((commonRoom) => [commonRoom.id, commonRoom]))
      if (currentRoomIsCommon) roomsById.set(room.id, room)
      setProfileCommonRooms([...roomsById.values()])
    }
    setProfileCommonRoomsLoading(false)
  }, [room, roomMembers, notify])

  const showRoomInfo = (event: ReactMouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const vw = window.innerWidth
    const width = Math.min(560, vw - 24)
    const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0
    if (vw <= 760) {
      setRoomInfoPosition({
        top: Math.max(12 + safeTop, Math.min(rect.bottom + 8, 24 + safeTop)),
        left: Math.max(12, Math.round((vw - width) / 2)),
      })
    } else {
      setRoomInfoPosition({
        top: Math.min(window.innerHeight - 420, Math.max(12 + safeTop, rect.bottom + 8)),
        left: Math.min(vw - width - 12, Math.max(12, rect.left)),
      })
    }
    setProfile(null)
    void api.members(room.id).then(setRoomMembers).catch(() => undefined)
    setRoomInfoOpen(true)
  }

  const updateDraft = (value: string, cursor: number | null = null) => {
    setDraft(value)
    if (value.trim().length > 0) {
      notifyTyping()
    } else {
      stopTyping()
      setComposerExpanded(false)
      setCodeBlock(null)
    }
    if (room.type === 'DIRECT') {
      setMention(null)
      return
    }
    if (cursor === null) return
    const beforeCursor = value.slice(0, cursor)
    const match = beforeCursor.match(/(^|\s)@([a-zA-Z0-9._-]*)$/)
    if (!match) {
      setMention(null)
      return
    }
    setMention({ start: cursor - match[2].length - 1, end: cursor, query: match[2] })
    setMentionIndex(0)
  }

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const max = codeBlock ? 420 : composerExpanded ? 280 : 140
    const lineCap = draft.includes('\n') ? max : Math.max(max, 360)
    el.style.height = `${Math.min(el.scrollHeight, lineCap)}px`
  }, [draft, composerExpanded, codeBlock, room.id])

  const chooseMention = (member: RoomMember) => {
    if (!mention) return
    const replacement = `@${member.username} `
    const next = draft.slice(0, mention.start) + replacement + draft.slice(mention.end)
    setDraft(next)
    setMention(null)
    requestAnimationFrame(() => {
      const position = mention.start + replacement.length
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(position, position)
    })
  }

  const insertText = (text: string) => {
    const el = inputRef.current
    const start = el?.selectionStart ?? draft.length
    const end = el?.selectionEnd ?? start
    const next = draft.slice(0, start) + text + draft.slice(end)
    setDraft(next)
    requestAnimationFrame(() => {
      el?.focus()
      const pos = start + text.length
      el?.setSelectionRange(pos, pos)
    })
  }

  const toggleCode = () => {
    if (codeBlock && draft.slice(codeBlock.start, codeBlock.end) === codeBlock.text) {
      setDraft(draft.slice(0, codeBlock.start) + draft.slice(codeBlock.end))
      setCodeBlock(null)
      inputRef.current?.focus()
      return
    }
    const el = inputRef.current
    const start = el?.selectionStart ?? draft.length
    const sel = el?.selectionEnd ?? start
    const selected = draft.slice(start, sel)

    let content = selected
    let langTag = ''

    if (selected.trim().length > 0) {
      const detected = detectLanguage(selected)
      if (detected.lang === 'markup') {
        content = formatHtml(selected)
        langTag = 'html'
      } else if (detected.lang === 'json') {
        content = formatJson(selected)
        langTag = 'json'
      } else if (detected.lang !== 'plaintext') {
        langTag = detected.lang === 'javascript' ? 'js' : detected.lang === 'typescript' ? 'ts' : detected.lang
      }
    }

    const block = '```' + (langTag ? langTag + '\n' : '\n') + (content || ' ') + '\n```'
    const next = draft.slice(0, start) + block + draft.slice(sel)
    setDraft(next)
    setCodeBlock({ start, end: start + block.length, text: block })
    requestAnimationFrame(() => {
      el?.focus()
      const pos = start + 3 + (langTag ? langTag.length + 1 : 1)
      el?.setSelectionRange(pos, pos + (content || ' ').length)
    })
  }

  const clearDraft = () => {
    setDraft('')
    setPendingAttachments([])
    setEditingMessage(null)
    setComposerExpanded(false)
    setCodeBlock(null)
    setQuotedMessage(null)
    setAudioMode(false)
    setAudioResetKey((key) => key + 1)
    audioRecorder.stop()
    inputRef.current?.focus()
  }

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
    const clipboardFiles = files.length > 0 ? files : Array.from(e.clipboardData.files)
    if (clipboardFiles.length > 0) {
      e.preventDefault()
      addPendingAttachments(clipboardFiles)
    }
  }

  const visibleFiles = roomFiles.filter((file) => {
    const queryMatches =
      !filesQuery.trim() || file.originalName.toLowerCase().includes(filesQuery.trim().toLowerCase())
    if (filesType === 'IMAGES') return queryMatches && file.mimeType?.startsWith('image/')
    if (filesType === 'DOCUMENTS') {
      return (
        queryMatches &&
        (file.mimeType?.includes('pdf') ||
          file.mimeType?.includes('document') ||
          file.mimeType?.includes('word') ||
          /\.(pdf|docx?|odt|rtf|txt)$/i.test(file.originalName))
      )
    }
    if (filesType === 'AUDIO') return queryMatches && file.mimeType?.startsWith('audio/')
    if (filesType === 'VIDEO') return queryMatches && file.mimeType?.startsWith('video/')
    return queryMatches
  })

  // Stabilized callbacks for memoized MessageRow
  const handleQuote = useCallback((m: Message) => {
    setQuotedMessage(m)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const handleForward = useCallback((m: Message) => {
    setForwardMessage(m)
  }, [])

  const handlePinAction = useCallback((msgId: string, pinned: boolean) => {
    setPinnedActionId(pinned ? msgId : null)
  }, [])

  const handleShowReads = useCallback((msgId: string) => {
    setReadMessageId(msgId)
  }, [])

  const handleRespond = useCallback((m: Message) => {
    setRespondMessage(m)
  }, [])

  const handleReactionMessage = useCallback(
    (message: Message, emoji: string) => {
      onReaction(message, emoji)
    },
    [onReaction],
  )

  const handleVotePoll = useCallback(
    (message: Message, optionId: string) => {
      if (message.poll && onPollUpdated) {
        api.votePoll(message.poll.id, optionId)
          .then(onPollUpdated)
          .catch(() => notify('Não foi possível registrar o voto'))
      }
    },
    [onPollUpdated, notify],
  )

  const handleTogglePin = useCallback(
    (m: Message) => {
      if (room.pinnedMessage?.id === m.id) {
        void handleUnpin()
      } else {
        void handlePin(m)
      }
    },
    [room.pinnedMessage?.id, handleUnpin, handlePin],
  )

  return (
    <div
      className={`room-view ${filesOpen ? 'files-open' : ''} ${isDragActive ? 'room-drag-active' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={`room-header ${searchOpen ? 'room-header-search-mode' : ''}`}>
        {searchOpen ? (
          <div className="room-header-search-bar">
            <button
              type="button"
              className="icon-btn room-search-back"
              onClick={() => {
                setSearchOpen(false)
                setSearchResults([])
                setSearchedQuery(null)
              }}
              aria-label="Fechar pesquisa"
            >
              <IconArrowLeft size={20} />
            </button>
            <div className="room-search-input-wrap">
              <span className="room-search-icon">
                <IconSearch size={15} />
              </span>
              <input
                ref={searchInputRef}
                className="room-search-input"
                value={searchQuery}
                placeholder="Pesquisar nesta conversa…"
                aria-label="Pesquisar nesta conversa"
                autoFocus
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    searchConversation()
                  }
                  if (event.key === 'Escape') {
                    setSearchOpen(false)
                    setSearchResults([])
                    setSearchedQuery(null)
                  }
                }}
              />
              {searchQuery.trim().length > 0 && (
                <button
                  type="button"
                  className="search-clear room-search-clear"
                  onClick={() => {
                    setSearchQuery('')
                    setSearchResults([])
                    setSearchedQuery(null)
                    searchInputRef.current?.focus()
                  }}
                  aria-label="Limpar busca"
                >
                  ×
                </button>
              )}
            </div>
            <button
              type="button"
              className="icon-btn room-search-submit"
              onClick={searchConversation}
              disabled={searchLoading}
              aria-label="Pesquisar"
            >
              ⌕
            </button>
            {searchResults.length > 0 && (
              <div className="room-search-results">
                {searchResults.map((result) => (
                  <button type="button" key={result.id} onClick={() => openSearchResult(result)}>
                    <strong>{result.username}</strong>
                    <span>{result.content || result.attachment?.originalName || 'Anexo'}</span>
                    <small>{new Date(result.createdAt).toLocaleString('pt-BR')}</small>
                  </button>
                ))}
              </div>
            )}
            {searchQuery.trim() &&
              !searchLoading &&
              searchedQuery === searchQuery.trim() &&
              searchResults.length === 0 && (
                <div className="room-search-results room-search-empty">Nenhuma mensagem encontrada.</div>
              )}
          </div>
        ) : (
          <>
            <button className="room-back icon-btn" onClick={onBack} aria-label="Voltar à lista">
              ‹
            </button>
            {room.type === 'DIRECT' ? (
              <button
                type="button"
                className="direct-header-contact"
                onClick={(event) => room.directPartner && void showProfile(room.directPartner.userId, event)}
              >
                <span className="room-header-avatar-wrap">
                  <AvatarImage
                    path={room.directPartner ? userAvatarPath(room.directPartner.userId) : null}
                    className="room-header-avatar"
                    fallback={<div className="room-header-icon">{ROOM_ICON.DIRECT}</div>}
                    alt={roomDisplayName(room)}
                  />
                  {room.directPartner && (
                    <span
                      className={`direct-presence-dot presence-${room.directPartner.presenceStatus}`}
                      aria-label={`Status: ${room.directPartner.presenceStatus}`}
                    />
                  )}
                </span>
                <div className="room-header-text">
                  <h2>{roomDisplayName(room)}</h2>
                  {typingText ? (
                    <span className="room-type typing-active">
                      {typingText}
                      <TypingDots />
                    </span>
                  ) : (
                    <span className="room-type">{roomSubtitle(room)}</span>
                  )}
                </div>
              </button>
            ) : (
              <button
                type="button"
                className="room-header-room-contact"
                onClick={showRoomInfo}
                aria-label={`Informações de ${roomDisplayName(room)}`}
              >
                <AvatarImage
                  path={`${roomAvatarPath(room.id)}?v=${encodeURIComponent(room.updatedAt)}`}
                  className="room-header-avatar"
                  fallback={<div className="room-header-icon">{getRoomIcon(room)}</div>}
                  alt={roomDisplayName(room)}
                />
                <div className="room-header-text">
                  <h2>{roomDisplayName(room)}</h2>
                  {typingText ? (
                    <span className="room-type typing-active">
                      {typingText}
                      <TypingDots />
                    </span>
                  ) : (
                    <span className="room-type">{roomSubtitle(room)}</span>
                  )}
                </div>
              </button>
            )}
            {room.readOnly && <span className="chip-chip">Somente leitura</span>}
            <div className="room-header-actions">
              <div className="room-header-desktop-actions">
                {canManageRoom && (
                  <>
                    <button
                      className="icon-btn header-edit"
                      onClick={() => setEditOpen(true)}
                      title={`Editar ${room.type === 'CHANNEL' ? 'canal' : 'grupo'}`}
                      aria-label={`Editar ${room.type === 'CHANNEL' ? 'canal' : 'grupo'}`}
                    >
                      <IconPencil size={18} />
                    </button>
                    <button
                      className="icon-btn header-add"
                      onClick={() => setAddOpen(true)}
                      title="Adicionar membros"
                      aria-label="Adicionar membros"
                    >
                      <PersonIcon size={20} />
                    </button>
                    <button
                      className="icon-btn header-remove"
                      onClick={() => setRemoveOpen(true)}
                      title="Remover membros"
                      aria-label="Remover membros"
                    >
                      <NoEntryIcon size={24} />
                    </button>
                  </>
                )}
                {room.type !== 'DIRECT' && !canManageRoom && isMember && (
                  <button
                    className="icon-btn header-add"
                    onClick={() => setMembersOpen(true)}
                    title="Ver membros"
                    aria-label="Ver membros"
                  >
                    <PersonIcon size={20} />
                  </button>
                )}
                <button
                  type="button"
                  className={`icon-btn favorite-room-trigger ${room.favorite ? 'active' : ''}`}
                  disabled={isPendingDm}
                  onClick={
                    isPendingDm
                      ? undefined
                      : () =>
                          void api
                            .toggleRoomFavorite(room.id)
                            .then((updated) =>
                              onRoomUpdated({
                                ...room,
                                favorite: updated.favorite,
                                directPartner: updated.directPartner ?? room.directPartner,
                              }),
                            )
                            .catch(() => notify('Não foi possível atualizar o favorito'))
                  }
                  title={room.favorite ? 'Remover dos favoritos' : 'Favoritar conversa'}
                  aria-label={room.favorite ? 'Remover dos favoritos' : 'Favoritar conversa'}
                  aria-pressed={room.favorite}
                >
                  {room.favorite ? '★' : '☆'}
                </button>
                <button
                  type="button"
                  className="icon-btn room-files-trigger"
                  disabled={isPendingDm}
                  onClick={isPendingDm ? undefined : toggleFiles}
                  title="Arquivos da conversa"
                  aria-label="Arquivos da conversa"
                  aria-pressed={filesOpen}
                >
                  <IconClip size={18} />
                </button>
              </div>

              <button
                type="button"
                className="icon-btn room-search-trigger"
                disabled={isPendingDm}
                onClick={
                  isPendingDm
                    ? undefined
                    : () => {
                        setSearchOpen(true)
                        requestAnimationFrame(() => searchInputRef.current?.focus())
                      }
                }
                title="Pesquisar na conversa"
                aria-label="Pesquisar na conversa"
              >
                <IconSearch size={17} />
              </button>

              <div className="room-header-mobile-menu" ref={roomHeaderMenuRef}>
                <button
                  type="button"
                  className={`icon-btn room-header-plus-btn ${roomHeaderMenuOpen ? 'active' : ''}`}
                  disabled={isPendingDm}
                  onClick={() => setRoomHeaderMenuOpen((v) => !v)}
                  title="Mais opções"
                  aria-label="Mais opções"
                  aria-expanded={roomHeaderMenuOpen}
                >
                  <IconPlus size={18} />
                </button>
                {roomHeaderMenuOpen && (
                  <div className="room-header-dropdown">
                    {canManageRoom && (
                      <button
                        className="room-header-dropdown-item"
                        onClick={() => {
                          setRoomHeaderMenuOpen(false)
                          setEditOpen(true)
                        }}
                      >
                        <IconPencil size={16} />
                        <span>Editar {room.type === 'CHANNEL' ? 'canal' : 'grupo'}</span>
                      </button>
                    )}
                    {canManageRoom && (
                      <button
                        className="room-header-dropdown-item"
                        onClick={() => {
                          setRoomHeaderMenuOpen(false)
                          setAddOpen(true)
                        }}
                      >
                        <PersonIcon size={16} />
                        <span>Adicionar membros</span>
                      </button>
                    )}
                    {canManageRoom && (
                      <button
                        className="room-header-dropdown-item"
                        onClick={() => {
                          setRoomHeaderMenuOpen(false)
                          setRemoveOpen(true)
                        }}
                      >
                        <NoEntryIcon size={18} />
                        <span>Remover membros</span>
                      </button>
                    )}
                    {room.type !== 'DIRECT' && !canManageRoom && isMember && (
                      <button
                        className="room-header-dropdown-item"
                        onClick={() => {
                          setRoomHeaderMenuOpen(false)
                          setMembersOpen(true)
                        }}
                      >
                        <PersonIcon size={16} />
                        <span>Ver membros</span>
                      </button>
                    )}
                    <button
                      className="room-header-dropdown-item"
                      disabled={isPendingDm}
                      onClick={() => {
                        setRoomHeaderMenuOpen(false)
                        void api
                          .toggleRoomFavorite(room.id)
                          .then((updated) =>
                            onRoomUpdated({
                              ...room,
                              favorite: updated.favorite,
                              directPartner: updated.directPartner ?? room.directPartner,
                            }),
                          )
                          .catch(() => notify('Não foi possível atualizar o favorito'))
                      }}
                    >
                      <span aria-hidden="true" style={{ fontSize: '1rem' }}>
                        {room.favorite ? '★' : '☆'}
                      </span>
                      <span>{room.favorite ? 'Remover dos favoritos' : 'Favoritar conversa'}</span>
                    </button>
                    <button
                      className="room-header-dropdown-item"
                      disabled={isPendingDm}
                      onClick={() => {
                        if (isPendingDm) return
                        setRoomHeaderMenuOpen(false)
                        toggleFiles()
                      }}
                    >
                      <IconClip size={16} />
                      <span>Arquivos da conversa</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {room.pinnedMessage && !room.pinnedMessage.deletedAt && (
        <div className="pinned-message-banner" role="region" aria-label="Mensagem fixada">
          <button
            type="button"
            className="pinned-message-content"
            onClick={handleJumpToPinned}
            title="Ir para a mensagem fixada"
          >
            <span className="pinned-icon" aria-hidden="true">
              📌
            </span>
            <div className="pinned-text-wrap">
              <span className="pinned-label">
                Mensagem fixada {room.pinnedMessage.username ? `• ${room.pinnedMessage.username}` : ''}
              </span>
              <span className="pinned-snippet">
                {room.pinnedMessage.content
                  ? room.pinnedMessage.content.replace(/\s+/g, ' ').trim()
                  : room.pinnedMessage.attachment
                  ? room.pinnedMessage.attachment.originalName || 'Anexo'
                  : room.pinnedMessage.poll
                  ? `📊 Enquete: ${room.pinnedMessage.poll.question}`
                  : 'Mensagem fixada'}
              </span>
            </div>
          </button>
          {canManagePin && (
            <button
              type="button"
              className="pinned-unpin-btn"
              onClick={(e) => {
                e.stopPropagation()
                void handleUnpin()
              }}
              title="Desafixar mensagem"
              aria-label="Desafixar mensagem"
            >
              ×
            </button>
          )}
        </div>
      )}

      <div
        className={`message-list ${conversationReady ? '' : 'message-list-initializing'}`}
        data-message-list
        ref={messageListRef}
        onScroll={(event) => {
          const container = event.currentTarget
          if (!conversationReady || scrollToBottomOnLoadRef.current) {
            wasNearBottomRef.current = true
            return
          }
          const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120
          wasNearBottomRef.current = nearBottom
        }}
      >
        <div className="message-list-content">
          {loading && <div className="loading-row">Carregando…</div>}
          {hasMore && (
            <button
              className="btn-link"
              disabled={loadingPrevious}
              onClick={async (event) => {
                if (loadingPrevious) return
                event.currentTarget.blur()
                const container = messageListRef.current
                if (container) {
                  pendingOlderScrollRef.current = {
                    oldScrollHeight: container.scrollHeight,
                    oldScrollTop: container.scrollTop,
                  }
                }
                setLoadingPrevious(true)
                await loadMore()
                setLoadingPrevious(false)
              }}
            >
              {loadingPrevious ? 'Carregando mensagens anteriores…' : 'Carregar mensagens anteriores'}
            </button>
          )}
          {grouped.map((g) => (
            <div key={g.day} className="day-group">
              <div className="day-divider">
                <span>{g.day}</span>
              </div>
              {g.items.map((m) => (
                <MessageRow
                  key={m.id}
                  msg={m}
                  isMine={m.userId === me.id}
                  currentUsername={me.username}
                  myAvatarVersion={myAvatarVersion}
                  avatarVersions={avatarVersions}
                  canWrite={!readOnlyAccount}
                  onDelete={onDelete}
                  onEdit={startEditing}
                  onShowProfile={showProfile}
                  onQuote={handleQuote}
                  onForward={handleForward}
                  onRespond={canRespondToReport ? handleRespond : undefined}
                  onReaction={handleReactionMessage}
                  actionPinned={pinnedActionId === m.id}
                  onPinAction={handlePinAction}
                  highlighted={highlightedMessageId === m.id}
                  onJumpToQuoted={jumpToMessage}
                  readReceiptsEnabled={readReceiptsEnabled}
                  onShowReads={handleShowReads}
                  onVotePoll={handleVotePoll}
                  canPin={canManagePin}
                  isPinned={room.pinnedMessage?.id === m.id}
                  onTogglePin={handleTogglePin}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {canWriteInRoom ? (
        <div className={`composer ${readOnlyAccount ? 'account-read-only' : ''}`} data-composer>
          {readOnlyAccount && (
            <div className="account-read-only-message">
              <strong>Modo somente leitura</strong>
              <span>Você pode consultar esta conversa, mas não enviar mensagens.</span>
            </div>
          )}
          <ComposerPendingAttachments
            files={pendingAttachments}
            urls={pendingAttachmentUrls}
            onRemove={(index) => setPendingAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
          />
          {quotedMessage && (
            <div className="quote-preview">
              <div>
                <strong>Respondendo a {quotedMessage.username || 'usuário'}</strong>
                <span>{quotedMessage.content || 'Anexo'}</span>
              </div>
              <button type="button" onClick={() => setQuotedMessage(null)} aria-label="Desvincular citação">
                ×
              </button>
            </div>
          )}
          {audioMode && (
            <div className="audio-recording-bar" role="status" aria-live="polite">
              <span className="audio-recording-label">
                <span className="audio-recording-indicator" aria-hidden="true" />
                Gravando áudio
              </span>
              <time className="audio-recording-time" dateTime={`PT${recordingSeconds}S`}>
                {formatRecordingTime(recordingSeconds)}
              </time>
              <button type="button" className="audio-recording-stop" onClick={audioRecorder.stop}>
                <IconStop size={15} /> <span>Parar</span>
              </button>
            </div>
          )}
          {typingText && (
            <div className="typing-indicator-bar" role="status" aria-live="polite">
              <TypingDots />
              <span>{typingText}</span>
            </div>
          )}
          <div className="composer-top">
            <EmojiButton disabled={muted} onPick={insertText} />
            <input
              ref={fileInputRef}
              type="file"
              className="file-input"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []).slice(0, 10)
                if (files.length > 0) {
                  addPendingAttachments(files)
                }
                e.target.value = ''
              }}
            />
            <textarea
              ref={inputRef}
              className={`composer-input ${composerExpanded ? 'composer-input-expanded' : ''} ${codeBlock ? 'composer-input-code' : ''} ${draft.includes('\n') ? 'composer-input-multiline' : ''}`}
              value={draft}
              onChange={(e) => updateDraft(e.target.value, e.target.selectionStart)}
              onKeyDown={(e) => {
                if (mention && mentionOptions.length > 0 && e.key === 'ArrowDown') {
                  e.preventDefault()
                  setMentionIndex((index) => (index + 1) % mentionOptions.length)
                  return
                }
                if (mention && mentionOptions.length > 0 && e.key === 'ArrowUp') {
                  e.preventDefault()
                  setMentionIndex((index) => (index - 1 + mentionOptions.length) % mentionOptions.length)
                  return
                }
                if (mention && mentionOptions.length > 0 && e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  chooseMention(mentionOptions[mentionIndex])
                  return
                }
                if (mention && e.key === 'Escape') {
                  e.preventDefault()
                  setMention(null)
                  return
                }
                if (e.key === 'Tab') {
                  e.preventDefault()
                  const el = inputRef.current
                  if (!el) return
                  const start = el.selectionStart
                  const end = el.selectionEnd
                  const val = draft

                  if (start !== end && val.slice(start, end).includes('\n')) {
                    const lineStart = val.lastIndexOf('\n', start - 1) + 1
                    const lineEnd = val.indexOf('\n', end) === -1 ? val.length : val.indexOf('\n', end)
                    const selectedText = val.slice(lineStart, lineEnd)
                    const lines = selectedText.split('\n')

                    if (e.shiftKey) {
                      const newLines = lines.map((l) => (l.startsWith('  ') ? l.slice(2) : l.startsWith(' ') ? l.slice(1) : l))
                      const newBlock = newLines.join('\n')
                      const next = val.slice(0, lineStart) + newBlock + val.slice(lineEnd)
                      updateDraft(next, start)
                      requestAnimationFrame(() => {
                        el.setSelectionRange(lineStart, lineStart + newBlock.length)
                      })
                    } else {
                      const newLines = lines.map((l) => '  ' + l)
                      const newBlock = newLines.join('\n')
                      const next = val.slice(0, lineStart) + newBlock + val.slice(lineEnd)
                      updateDraft(next, start + 2)
                      requestAnimationFrame(() => {
                        el.setSelectionRange(lineStart, lineStart + newBlock.length)
                      })
                    }
                  } else {
                    if (e.shiftKey) {
                      const lineStart = val.lastIndexOf('\n', start - 1) + 1
                      const beforeInLine = val.slice(lineStart, start)
                      if (beforeInLine.endsWith('  ')) {
                        const next = val.slice(0, start - 2) + val.slice(start)
                        updateDraft(next, start - 2)
                        requestAnimationFrame(() => {
                          el.setSelectionRange(start - 2, start - 2)
                        })
                      } else if (beforeInLine.endsWith(' ')) {
                        const next = val.slice(0, start - 1) + val.slice(start)
                        updateDraft(next, start - 1)
                        requestAnimationFrame(() => {
                          el.setSelectionRange(start - 1, start - 1)
                        })
                      }
                    } else {
                      const indent = '  '
                      const next = val.slice(0, start) + indent + val.slice(end)
                      updateDraft(next, start + indent.length)
                      requestAnimationFrame(() => {
                        el.setSelectionRange(start + indent.length, start + indent.length)
                      })
                    }
                  }
                  return
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                } else if (e.key === 'Enter' && e.shiftKey) {
                  setComposerExpanded(true)
                  const el = inputRef.current
                  if (el) {
                    const start = el.selectionStart
                    const end = el.selectionEnd
                    const lineStart = draft.lastIndexOf('\n', start - 1) + 1
                    const currentLine = draft.slice(lineStart, start)
                    const indentMatch = currentLine.match(/^[ \t]+/)
                    if (indentMatch && indentMatch[0].length > 0) {
                      e.preventDefault()
                      const indent = indentMatch[0]
                      const next = draft.slice(0, start) + '\n' + indent + draft.slice(end)
                      updateDraft(next, start + 1 + indent.length)
                      requestAnimationFrame(() => {
                        el.setSelectionRange(start + 1 + indent.length, start + 1 + indent.length)
                      })
                    }
                  }
                }
              }}
              onFocus={() => {
                if (typeof window !== 'undefined') {
                  window.scrollTo(0, 0)
                  requestAnimationFrame(() => window.scrollTo(0, 0))
                  setTimeout(() => window.scrollTo(0, 0), 100)
                  setTimeout(() => window.scrollTo(0, 0), 300)
                }
                if (wasNearBottomRef.current && messageListRef.current) {
                  const list = messageListRef.current
                  requestAnimationFrame(() => {
                    list.scrollTop = list.scrollHeight
                  })
                  setTimeout(() => {
                    list.scrollTop = list.scrollHeight
                  }, 150)
                  setTimeout(() => {
                    list.scrollTop = list.scrollHeight
                  }, 350)
                }
              }}
              onPaste={handlePaste}
              placeholder={muted ? 'Sem conexão — envio desabilitado' : 'Escreva sua mensagem…'}
              disabled={muted}
              maxLength={10000}
              rows={1}
            />
            {mention && mentionOptions.length > 0 && (
              <div className="mention-menu" role="listbox" aria-label="Membros mencionáveis">
                {mentionOptions.map((member, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === mentionIndex}
                    className={`mention-option ${index === mentionIndex ? 'selected' : ''}`}
                    key={member.userId}
                    onMouseEnter={() => setMentionIndex(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => chooseMention(member)}
                  >
                    <AvatarImage
                      path={`${userAvatarPath(member.userId)}${
                        avatarVersions?.[member.userId]
                          ? `?v=${encodeURIComponent(avatarVersions[member.userId])}`
                          : member.joinedAt
                          ? `?v=${encodeURIComponent(member.joinedAt)}`
                          : ''
                      }`}
                      className="mini-avatar"
                      fallback={<span className="mini-avatar">{initials(member.name || member.username)}</span>}
                      alt={member.name || member.username}
                    />
                    <span className="picker-item-text">
                      <strong>{member.name || member.username}</strong>
                      <small>@{member.username}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <ComposerActionBox
              roomType={room.type}
              readOnlyAccount={readOnlyAccount}
              roomReadOnly={room.readOnly}
              muted={muted}
              clearDisabled={muted || (!draft && pendingAttachments.length === 0 && !audioMode)}
              editing={Boolean(editingMessage)}
              recordingAudio={audioRecorder.recording}
              onAttach={() => fileInputRef.current?.click()}
              onRecordAudio={audioRecorder.toggle}
              onCode={toggleCode}
              onPoll={() => setPollOpen(true)}
              onClear={clearDraft}
              onCancelEdit={cancelEditing}
            />
            <button className="btn-primary send-btn" onClick={submit} disabled={muted || composing || !canSubmit}>
              {editingMessage ? <IconPencil size={15} /> : <IconSend size={15} />}
              <span>{editingMessage ? 'Editar' : 'Enviar'}</span>
            </button>
          </div>
          <div className="composer-actions">
            <button
              type="button"
              className={`composer-action ${codeBlock ? 'on' : ''}`}
              onClick={toggleCode}
              disabled={muted}
              title={codeBlock ? 'Remover bloco de código' : 'Inserir bloco de código'}
            >
              <IconCode size={15} />
              <span>Código</span>
            </button>
            <button
              type="button"
              className="composer-action"
              onClick={() => fileInputRef.current?.click()}
              disabled={muted || Boolean(editingMessage)}
              title="Anexar arquivo"
            >
              <IconClip size={15} />
              <span>Anexar</span>
            </button>
            <AudioRecordButton
              recording={audioRecorder.recording}
              disabled={muted || Boolean(editingMessage)}
              onClick={audioRecorder.toggle}
            />
            {(room.type === 'PRIVATE_GROUP' || room.type === 'PUBLIC_GROUP' || room.type === 'CHANNEL') &&
              canWriteInRoom && (
                <button
                  type="button"
                  className="composer-action poll-action"
                  onClick={() => setPollOpen(true)}
                  title="Criar enquete"
                >
                  <span aria-hidden="true">▣</span>
                  <span>Enquete</span>
                </button>
              )}
            <button
              type="button"
              className="composer-action clear-draft"
              onClick={clearDraft}
              disabled={muted || (!draft && pendingAttachments.length === 0 && !audioMode)}
              title="Limpar mensagem"
            >
              <IconTrash size={15} />
              <span>Limpar</span>
            </button>
            {editingMessage && (
              <button
                type="button"
                className="composer-action clear-draft"
                onClick={cancelEditing}
                disabled={muted}
                title="Cancelar edição"
              >
                Cancelar edição
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="composer account-read-only" data-composer>
          <div className="account-read-only-message">
            <strong>Canal de comunicação</strong>
            <span>Este canal é somente leitura. Apenas usuários com permissão podem enviar mensagens.</span>
          </div>
        </div>
      )}

      {filesOpen && (
        <RoomFilesPanel
          files={visibleFiles}
          loading={filesLoading}
          error={filesError}
          query={filesQuery}
          type={filesType}
          onQueryChange={setFilesQuery}
          onTypeChange={setFilesType}
          onClose={() => setFilesOpen(false)}
          onRetry={() => void loadRoomFiles()}
        />
      )}

      {addOpen && (
        <AddMembersModal room={room} onClose={() => setAddOpen(false)} notify={modalNotify} />
      )}
      {removeOpen && (
        <RemoveMembersModal room={room} onClose={() => setRemoveOpen(false)} notify={modalNotify} />
      )}
      {membersOpen && <MembersModal room={room} onClose={() => setMembersOpen(false)} />}
      {editOpen && (
        <RoomEditModal
          room={room}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            onRoomUpdated(updated)
            setEditOpen(false)
          }}
          notify={modalNotify}
        />
      )}
      {readMessageId &&
        (() => {
          const readMessage = messages.find((message) => message.id === readMessageId)
          return readMessage ? (
            <ReadReceiptsModal message={readMessage} onClose={() => setReadMessageId(null)} />
          ) : null
        })()}
      {(profileLoading || profile) && (
        <UserProfileCard
          profile={profile}
          loading={profileLoading}
          commonRooms={profileCommonRooms}
          commonRoomsLoading={profileCommonRoomsLoading}
          position={profilePosition}
          onClose={() => setProfile(null)}
          onContact={
            profile
              ? () => {
                  setProfile(null)
                  void onStartDm(profile.id, {
                    username: profile.username,
                    name: profile.name,
                    presenceStatus: profile.presenceStatus,
                  })
                }
              : undefined
          }
          onOpenRoom={(roomId) => {
            setProfile(null)
            void onOpenRoom(roomId)
          }}
        />
      )}
      {roomInfoOpen && room.type !== 'DIRECT' && (
        <RoomInfoCard
          room={room}
          members={roomMembers}
          position={roomInfoPosition}
          onClose={() => setRoomInfoOpen(false)}
        />
      )}
      {forwardMessage && (
        <ForwardMessageModal
          message={forwardMessage}
          rooms={rooms}
          onClose={() => setForwardMessage(null)}
          notify={modalNotify}
        />
      )}
      {respondMessage && (
        <RespondToReportModal
          message={respondMessage}
          onClose={() => setRespondMessage(null)}
          onResponded={() => setRespondMessage(null)}
          notify={modalNotify}
        />
      )}
      {pollOpen && (
        <CreatePollModal
          roomId={room.id}
          onClose={() => setPollOpen(false)}
          onCreated={(message) => {
            onPollUpdated(message)
            setPollOpen(false)
          }}
          notify={modalNotify}
        />
      )}
      {isDragActive && (
        <div className="room-drag-overlay" role="presentation">
          <div className="room-drag-overlay-box">
            <IconClip size={26} />
            <strong>Solte para anexar</strong>
            <span>O arquivo será adicionado ao envio desta conversa</span>
          </div>
        </div>
      )}
    </div>
  )
}
