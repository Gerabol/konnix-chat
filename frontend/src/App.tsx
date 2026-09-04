import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ClipboardEvent, ReactNode } from 'react'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import {
  api,
  ApiError,
  formatBytes,
  formatDay,
  formatTime,
  getAuthToken,
  roomAvatarPath,
  setAuthToken,
  userAvatarPath,
  wsUrl,
} from './api'
import type { Attachment, DirectoryUser, Message, MessageReaction, PresenceStatus, PublicProfile, ReadReceipt, Room, RoomFile, RoomMember, Theme, User } from './api'
import AdminView from './AdminView'
import { desktopAutostartEnabled, isTauri, listenDesktopNotificationAction, notifyDesktop, saveDownloadedBlob, setDesktopAutostart } from './platform'
import ServerSetup from './desktop/servers/ServerSetup'
import ServerSwitcher from './desktop/servers/ServerSwitcher'
import { activateDesktopServer } from './desktop/servers/serverManager'
import { getActiveServerId, getDesktopServers } from './desktop/servers/serverStore'
import { setActiveServer } from './api'
import { validatePassword } from './passwordValidation'
import { RoleBadge } from './RoleBadge'

type EmojiSelection = { native?: string }

const initialDesktopServers = isTauri ? getDesktopServers() : []
const initialDesktopId = isTauri ? getActiveServerId() : null
const initialDesktopServer = isTauri
  ? initialDesktopServers.find((server) => server.id === initialDesktopId) ?? initialDesktopServers[0] ?? null
  : null
if (isTauri) setActiveServer(initialDesktopServer?.url ?? null, initialDesktopServer?.id)

const ROOM_ICON: Record<string, string> = {
  CHANNEL: '#',
  PRIVATE_GROUP: '🔒',
  PUBLIC_GROUP: '🔒',
  DIRECT: '@',
}

function getRoomIcon(room: Room): string {
  if (room.name === 'bug-reports') return '🐛'
  return ROOM_ICON[room.type] ?? '#'
}

const THEME_OPTIONS: { id: Theme; label: string; colors: string[] }[] = [
  { id: 'DEFAULT', label: 'Padrão', colors: ['#f7f8fc', '#ffffff', '#5b4cf0', '#22c7d6'] },
  { id: 'DARK', label: 'Dark clássico', colors: ['#121212', '#18181B', '#7C5CFF', '#23232A'] },
  { id: 'BLACK_GRAY', label: 'Cinza e preto', colors: ['#0F1115', '#161A20', '#4F7CFF', '#1E232B'] },
  { id: 'PINK', label: 'Rosa', colors: ['#FFF8FB', '#FDEEF5', '#E84D8A', '#FFFFFF'] },
  { id: 'GREEN', label: 'Verde', colors: ['#F5FBF7', '#EAF6EE', '#1FA463', '#FFFFFF'] },
  { id: 'RED', label: 'Vermelho', colors: ['#FFF7F7', '#FDECEC', '#D94141', '#FFFFFF'] },
  { id: 'GREEN_BLACK', label: 'Verde Black', colors: ['#0F1411', '#19221D', '#25BD70', '#A6C3B1'] },
  { id: 'PINK_BLACK', label: 'Rosa Black', colors: ['#140F13', '#241923', '#F05A9D', '#DDB5C9'] },
  { id: 'RED_BLACK', label: 'Vermelho Black', colors: ['#150E0E', '#251818', '#F05B5B', '#E0B1B1'] },
  { id: 'DEFAULT_STRONG', label: 'Padrão Forte', colors: ['#F7F8FC', '#5B4CF0', '#7C70F5', '#FFFFFF'] },
  { id: 'GREEN_STRONG', label: 'Verde Forte', colors: ['#F5FBF7', '#188A53', '#27B56E', '#FFFFFF'] },
  { id: 'PINK_STRONG', label: 'Rosa Forte', colors: ['#FFF8FB', '#D93E7C', '#F0629B', '#FFFFFF'] },
  { id: 'RED_STRONG', label: 'Vermelho Forte', colors: ['#FFF7F7', '#C83232', '#E15353', '#FFFFFF'] },
]
const THEME_CACHE_KEY = 'konnix-theme-cache'
const THEME_COOKIE_KEY = 'konnix_theme'

function normalizeTheme(theme: string | null | undefined): Theme {
  const normalized = theme?.trim().replace(/-/g, '_').toUpperCase()
  return THEME_OPTIONS.some((option) => option.id === normalized) ? normalized as Theme : 'DEFAULT'
}

export function isDarkTheme(theme: Theme): boolean {
  return theme === 'DARK' || theme === 'BLACK_GRAY' || theme.endsWith('_BLACK')
}

export function isWhiteSidebarLogoTheme(theme: Theme): boolean {
  return theme === 'DARK' || theme === 'BLACK_GRAY' || theme.endsWith('_BLACK') || theme.endsWith('_STRONG')
}

function readThemeCookie(): Theme | null {
  const value = document.cookie.split('; ').find((entry) => entry.startsWith(`${THEME_COOKIE_KEY}=`))?.split('=').slice(1).join('=')
  if (!value) return null
  const normalized = normalizeTheme(decodeURIComponent(value))
  return normalized === 'DEFAULT' && decodeURIComponent(value).trim().toUpperCase() !== 'DEFAULT' ? null : normalized
}

function writeThemeCookie(theme: string | null | undefined) {
  const normalized = normalizeTheme(theme)
  const cookieValue = normalized.toLowerCase().replace(/_/g, '-')
  document.cookie = `${THEME_COOKIE_KEY}=${encodeURIComponent(cookieValue)}; Max-Age=31536000; Path=/; SameSite=Lax`
}

export function applyCookieThemeEarly() {
  const theme = readThemeCookie()
  if (theme) applyTheme(theme)
}

function applyTheme(theme: string | null | undefined) {
  const normalized = normalizeTheme(theme)
  const attribute = normalized === 'DEFAULT' ? '' : normalized.toLowerCase().replace('_', '-')
  if (attribute) document.documentElement.dataset.theme = attribute
  else delete document.documentElement.dataset.theme
}

function cachedTheme(): Theme {
  try {
    return normalizeTheme(localStorage.getItem(THEME_CACHE_KEY))
  } catch {
    return 'DEFAULT'
  }
}

function cacheTheme(theme: string | null | undefined) {
  const normalized = normalizeTheme(theme)
  try {
    localStorage.setItem(THEME_CACHE_KEY, normalized)
  } catch {
    /* cache opcional */
  }
  writeThemeCookie(normalized)
}

function clearCachedTheme() {
  try {
    localStorage.removeItem(THEME_CACHE_KEY)
  } catch {
    /* cache opcional */
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/')
  const normalized = padded.padEnd(Math.ceil(padded.length / 4) * 4, '=')
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

function initials(name: string): string {
  const clean = name.trim()
  if (!clean) return '?'
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

const avatarCache = new Map<string, string>()

export function AvatarImage({
  path,
  className,
  fallback,
  alt,
}: {
  path: string | null
  className: string
  fallback?: ReactNode
  alt?: string
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!path) {
      setUrl(null)
      return
    }
    const cached = avatarCache.get(path)
    if (cached) {
      setUrl(cached)
      return
    }
    let active = true
    api
      .fetchBlob(path)
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob)
        avatarCache.set(path, objectUrl)
        if (active) setUrl(objectUrl)
      })
      .catch(() => {
        if (active) setUrl(null)
      })
    return () => {
      active = false
    }
  }, [path])

  if (!path || !url) {
    return fallback ?? null
  }
  return <img src={url} alt={alt ?? ''} className={className} />
}

function EmojiButton({
  onPick,
  disabled,
}: {
  onPick: (emoji: string) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="emoji-wrap" ref={ref}>
      <button
        type="button"
        className="emoji-btn"
        title="Emoji"
        aria-label="Inserir emoji"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        😊
      </button>
      {open && <div className="emoji-picker-popover" role="dialog" aria-label="Seletor de emojis">
        <div className="emoji-picker-header">
          <span>Emojis</span>
          <button type="button" className="emoji-picker-close" aria-label="Fechar seletor de emojis" title="Fechar" onClick={() => setOpen(false)}>×</button>
        </div>
        <Picker data={data} onEmojiSelect={(emoji: EmojiSelection) => {
          if (emoji.native) onPick(emoji.native)
          setOpen(false)
        }} previewPosition="none" skinTonePosition="none" />
      </div>}
    </div>
  )
}

function AudioRecordButton({
  onDone,
  onRecordingChange,
  onStopReady,
  onError,
  disabled,
  resetKey,
}: {
  onDone: (file: File) => void
  onRecordingChange: (recording: boolean, elapsedSeconds: number) => void
  onStopReady: (stop: (() => void) | null) => void
  onError: (message: string) => void
  disabled: boolean
  resetKey: number
}) {
  const [recording, setRecording] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lifecycleRef = useRef(0)

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    startedAtRef.current = null
  }

  const releaseResources = () => {
    stopTimer()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    mediaRef.current = null
  }

  useEffect(() => {
    lifecycleRef.current += 1
    const recorder = mediaRef.current
    if (recorder) {
      recorder.onstop = null
      recorder.onerror = null
      if (recorder.state !== 'inactive') recorder.stop()
    }
    releaseResources()
    chunksRef.current = []
    setRecording(false)
    onRecordingChange(false, 0)
  }, [resetKey, onRecordingChange])

  useEffect(() => () => {
    lifecycleRef.current += 1
    const recorder = mediaRef.current
    if (recorder) {
      recorder.onstop = null
      recorder.onerror = null
      if (recorder.state !== 'inactive') recorder.stop()
    }
    releaseResources()
    onRecordingChange(false, 0)
  }, [onRecordingChange])

  useEffect(() => {
    onStopReady(recording ? () => mediaRef.current?.stop() : null)
    return () => onStopReady(null)
  }, [recording, onStopReady])

  const toggle = async () => {
    if (recording) {
      mediaRef.current?.stop()
      return
    }
    if (!window.isSecureContext) {
      onError('O microfone exige HTTPS ou acesso por localhost')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError('Este navegador não oferece suporte à gravação de áudio')
      return
    }
    try {
      const lifecycle = lifecycleRef.current
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (lifecycle !== lifecycleRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((candidate) => MediaRecorder.isTypeSupported(candidate))
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = async () => {
        releaseResources()
        const mime = rec.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mime })
        setRecording(false)
        onRecordingChange(false, 0)
        if (blob.size === 0) {
          onError('A gravação ficou vazia. Tente novamente')
          return
        }
        try {
          const mp3 = await encodeRecordingAsMp3(blob)
          if (mp3.size === 0) throw new Error('empty mp3')
          onDone(new File([mp3], `gravacao-${Date.now()}.mp3`, { type: 'audio/mpeg' }))
        } catch {
          const sourceExtension = mime.split('/')[1]?.split(';')[0] || 'webm'
          onDone(new File([blob], `gravacao-${Date.now()}.${sourceExtension}`, { type: mime }))
        }
      }
      rec.onerror = () => {
        setRecording(false)
        releaseResources()
        onRecordingChange(false, 0)
        onError('Não foi possível gravar o áudio')
      }
      rec.start(250)
      mediaRef.current = rec
      startedAtRef.current = Date.now()
      setRecording(true)
      onRecordingChange(true, 0)
      timerRef.current = setInterval(() => {
        const startedAt = startedAtRef.current
        if (startedAt !== null) onRecordingChange(true, Math.floor((Date.now() - startedAt) / 1000))
      }, 250)
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      onError(
        name === 'NotAllowedError'
          ? 'Permita o acesso ao microfone nas configurações do navegador'
          : name === 'NotFoundError'
            ? 'Nenhum microfone foi encontrado'
            : 'Não foi possível acessar o microfone',
      )
    }
  }

  return (
<span className="audio-record-wrap">
        <button
          type="button"
          className={`composer-action ${recording ? 'recording' : ''}`}
          title={recording ? 'Parar gravação' : 'Gravar áudio'}
          disabled={disabled}
          onClick={toggle}
        >
          {recording ? <IconStop size={15} /> : <IconMic size={15} />}
          <span>{recording ? 'Parar' : 'Gravar áudio'}</span>
        </button>
      </span>
    )
  }

function IconX({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function ComposerActionBox({
  roomType,
  readOnlyAccount,
  roomReadOnly,
  muted,
  clearDisabled,
  editing,
  onAttach,
  onCode,
  onPoll,
  onClear,
  onCancelEdit,
}: {
  roomType: Room['type']
  readOnlyAccount: boolean
  roomReadOnly: boolean
  muted: boolean
  clearDisabled: boolean
  editing: boolean
  onAttach: () => void
  onCode: () => void
  onPoll: () => void
  onClear: () => void
  onCancelEdit: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const showPoll = roomType === 'PRIVATE_GROUP' && !readOnlyAccount && !roomReadOnly

  return (
    <div className="composer-action-box" ref={ref}>
      <button
        type="button"
        className="composer-action-trigger"
        aria-label="Mais ações"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Mais ações"
        disabled={muted}
        onClick={() => setOpen((o) => !o)}
      >
        <IconPlus size={22} />
      </button>
      {open && (
        <div className="composer-actions-popover" role="menu" aria-label="Mais ações">
          <button type="button" role="menuitem" className="composer-action-box-item" onClick={() => { onAttach(); setOpen(false) }} disabled={muted}>
            <span className="composer-action-box-icon"><IconClip size={18} /></span>
            <span>Anexar Arquivo</span>
          </button>
          <button type="button" role="menuitem" className="composer-action-box-item" onClick={() => { onCode(); setOpen(false) }} disabled={muted}>
            <span className="composer-action-box-icon"><IconCode size={18} /></span>
            <span>Bloco de Código</span>
          </button>
          {showPoll && (
            <button type="button" role="menuitem" className="composer-action-box-item" onClick={() => { onPoll(); setOpen(false) }}>
              <span className="composer-action-box-icon"><span aria-hidden="true">▣</span></span>
              <span>Criar Enquete</span>
            </button>
          )}
          <button type="button" role="menuitem" className="composer-action-box-item composer-action-box-item-danger" onClick={() => { onClear(); setOpen(false) }} disabled={clearDisabled}>
            <span className="composer-action-box-icon"><IconTrash size={18} /></span>
            <span>Limpar Mensagem</span>
          </button>
          {editing && (
            <button type="button" role="menuitem" className="composer-action-box-item" onClick={() => { onCancelEdit(); setOpen(false) }} disabled={muted}>
              <span className="composer-action-box-icon"><IconX size={18} /></span>
              <span>Cancelar Edição</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function IconCode({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

function IconClip({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

function IconDownload({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  )
}

function IconMic({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )
}

function IconStop({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

function IconTrash({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function IconSend({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function IconPlus({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function IconSearch({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function IconSettings({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function IconMessage({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function IconArrowLeft({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}



function PersonIcon({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  )
}

function NoEntryIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="5" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="8.6" r="2.9" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7.2 17.8c.6-3 2.3-4.6 4.8-4.6s4.2 1.6 4.8 4.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function IconPencil({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function PaletteIcon() {
  return <svg className="palette-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h2.5a6.5 6.5 0 1 0-2.5-10Z" />
    <circle cx="7.5" cy="10" r=".75" fill="currentColor" />
    <circle cx="10" cy="6.5" r=".75" fill="currentColor" />
    <circle cx="14" cy="6.5" r=".75" fill="currentColor" />
  </svg>
}

function IconBell({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>
}

function IconShield({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></svg>
}

function IconLogout({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 17 15 12 10 7" /><path d="M15 12H3" /><path d="M21 19V5a2 2 0 0 0-2-2h-6" /></svg>
}

function IconAlertTriangle({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function IconInfo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  )
}

type InlineMatch = {
  start: number
  end: number
  kind: 'block' | 'code' | 'strike' | 'bold' | 'italic'
  inner: string
}

function renderInline(text: string, out: ReactNode[], key: number): void {
  const candidates: InlineMatch[] = []
  const block = text.match(/```[^\n`]*\r?\n([\s\S]*?)```/) ?? text.match(/```([\s\S]*?)```/)
  const code = text.match(/`([^`]+)`/)
  const strike = text.match(/~~([^~]+)~~/)
  const bold = text.match(/\*\*([^*]+)\*\*/) ?? text.match(/\*([^*]+)\*/)
  const italic = text.match(/_([^_]+)_/)
  if (block) candidates.push({ start: block.index!, end: block.index! + block[0].length, kind: 'block', inner: block[1].replace(/^\r?\n/, '').replace(/\r?\n$/, '') })
  if (code) candidates.push({ start: code.index!, end: code.index! + code[0].length, kind: 'code', inner: code[1] })
  if (strike) candidates.push({ start: strike.index!, end: strike.index! + strike[0].length, kind: 'strike', inner: strike[1] })
  if (bold) candidates.push({ start: bold.index!, end: bold.index! + bold[0].length, kind: 'bold', inner: bold[1] })
  if (italic) candidates.push({ start: italic.index!, end: italic.index! + italic[0].length, kind: 'italic', inner: italic[1] })

  if (candidates.length === 0) {
    out.push(text)
    return
  }
  candidates.sort((a, b) => a.start - b.start)
  const m = candidates[0]
  if (m.start > 0) out.push(text.slice(0, m.start))
  if (m.kind === 'block') {
    out.push(<pre key={key}><code>{m.inner}</code></pre>)
  } else if (m.kind === 'code') {
    out.push(<code key={key}>{m.inner}</code>)
  } else {
    const inner: ReactNode[] = []
    renderInline(m.inner, inner, key + 1)
    if (m.kind === 'strike') out.push(<del key={key}>{inner}</del>)
    else if (m.kind === 'bold') out.push(<strong key={key}>{inner}</strong>)
    else out.push(<em key={key}>{inner}</em>)
  }
  renderInline(text.slice(m.end), out, key + 100)
}

function renderMarkdown(text: string): ReactNode[] {
  const out: ReactNode[] = []
  renderInline(text, out, 0)
  return out
}

function renderMessageContent(text: string, currentUsername: string): ReactNode[] {
  return text.split(/(```[\s\S]*?```)/g).flatMap((part, blockIndex) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      return [<Fragment key={`block-${blockIndex}`}>{renderMarkdown(part)}</Fragment>]
    }
    return part.split(/(@[a-zA-Z0-9._-]+|https:\/\/[^\s<]+)/g).map((piece, pieceIndex) =>
      /^https:\/\/[^\s<]+$/.test(piece)
        ? <a key={`${blockIndex}-${pieceIndex}`} className="message-link" href={piece} target="_blank" rel="noopener noreferrer">{piece}</a>
        : /^@[a-zA-Z0-9._-]+$/.test(piece)
        ? <span
            className={`message-mention ${piece.slice(1).toLowerCase() === currentUsername.toLowerCase() ? 'message-mention-self' : ''}`}
            key={`${blockIndex}-${pieceIndex}`}
          >
            {piece}
          </span>
        : <Fragment key={`${blockIndex}-${pieceIndex}`}>{renderMarkdown(piece)}</Fragment>,
    )
  })
}

function roomDisplayName(room: Room): string {
  if (room.type === 'DIRECT') {
    return (
      room.directPartner?.name ||
      room.directPartner?.username ||
      room.displayName ||
      room.name ||
      'Conversa'
    )
  }
  return room.displayName || room.name || 'Sem nome'
}

function roomSubtitle(room: Room): string {
  if (room.type === 'DIRECT') {
    return room.directPartner ? `@${room.directPartner.username} | ${room.directPartner.email || 'sem e-mail'}` : 'Conversa'
  }
  if (room.type === 'CHANNEL') return 'Canal'
  return 'Grupo'
}

function roomActivityTime(room: Room): number {
  return Date.parse(room.lastActivityAt ?? room.updatedAt ?? room.createdAt) || 0
}

export type TypingUser = {
  userId: string
  username: string
  name: string
  timestamp: number
}

export function TypingDots() {
  return (
    <span className="typing-dots" aria-hidden="true">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </span>
  )
}

function formatTypingText(typingMap: Record<string, TypingUser> | undefined, isDirect: boolean): string | null {
  if (!typingMap) return null
  const users = Object.values(typingMap)
  if (users.length === 0) return null
  if (isDirect) return 'digitando...'
  if (users.length === 1) return `${users[0].name || users[0].username} está digitando...`
  if (users.length === 2) return `${users[0].name || users[0].username} e ${users[1].name || users[1].username} estão digitando...`
  return `${users[0].name || users[0].username} e outros estão digitando...`
}

function formatRecordingTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

async function encodeRecordingAsMp3(blob: Blob): Promise<Blob> {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    const encoderModule = await import('lamejs')
    const encoder = new encoderModule.Mp3Encoder(1, decoded.sampleRate, 128)
    const firstChannel = decoded.getChannelData(0)
    const secondChannel = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : null
    const samples = new Int16Array(firstChannel.length)
    for (let index = 0; index < firstChannel.length; index += 1) {
      const mixed = secondChannel ? (firstChannel[index] + secondChannel[index]) / 2 : firstChannel[index]
      const sample = Math.max(-1, Math.min(1, mixed))
      samples[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
    }
    const parts: BlobPart[] = []
    for (let offset = 0; offset < samples.length; offset += 1152) {
      const encoded = encoder.encodeBuffer(samples.subarray(offset, offset + 1152))
      if (encoded.length > 0) parts.push(new Uint8Array(encoded))
    }
    const flushed = encoder.flush()
    if (flushed.length > 0) parts.push(new Uint8Array(flushed))
    return new Blob(parts, { type: 'audio/mpeg' })
  } finally {
    await context.close()
  }
}

type Session = { token: string; user: User }

export default function App() {
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
    }).then((cleanup) => { dispose = cleanup })
    return () => dispose?.()
  }, [])

  useEffect(() => {
    const handleViewport = () => {
      if (window.visualViewport) {
        const vh = window.visualViewport.height
        document.documentElement.style.setProperty('--app-height', `${vh}px`)
      } else {
        document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
      }
    }

    handleViewport()

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewport)
      window.visualViewport.addEventListener('scroll', handleViewport)
    } else {
      window.addEventListener('resize', handleViewport)
    }

    const preventOverscroll = (e: TouchEvent) => {
      let el = e.target as HTMLElement | null
      while (el && el !== document.body && el !== document.documentElement) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON' || el.tagName === 'A') {
          return
        }
        const style = window.getComputedStyle(el)
        if (/(auto|scroll)/.test(style.overflowY + style.overflowX + style.overflow)) {
          return
        }
        el = el.parentElement
      }
      if (e.touches.length === 1) {
        e.preventDefault()
      }
    }

    const handleScroll = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0)
      }
    }

    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    window.addEventListener('scroll', handleScroll, { passive: true })
    document.addEventListener('touchmove', preventOverscroll, { passive: false })

    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('scroll', handleScroll)
      document.removeEventListener('touchmove', preventOverscroll)
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewport)
        window.visualViewport.removeEventListener('scroll', handleViewport)
      } else {
        window.removeEventListener('resize', handleViewport)
      }
    }
  }, [])

  useEffect(() => {
    if (!session) {
      meRequestRef.current = null
      setAuthInitializing(false)
      return
    }
    if (session.user) {
      setAuthInitializing(false)
      return
    }
    if (meRequestRef.current === session.token) return
    meRequestRef.current = session.token
    api
      .me()
      .then((user) => { cacheTheme(user.theme); setSession({ token: session.token, user }) })
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
    setDesktopServers((current) => current.some((entry) => entry.id === activated.id)
      ? current.map((entry) => ({ ...entry, lastUsed: entry.id === activated.id }))
      : [...current, activated].map((entry) => ({ ...entry, lastUsed: entry.id === activated.id })))
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
    setSession((current) => current ? { ...current, user: { ...user, theme: preservedTheme } } : current)
    cacheTheme(preservedTheme)
    applyTheme(preservedTheme)
    return { ...user, theme: preservedTheme }
  }, [session?.user?.theme])

  const [profileRevision, setProfileRevision] = useState(0)

  const handleProfileUpdated = useCallback((user: User) => {
    const currentTheme = (readThemeCookie() || cachedTheme() || session?.user?.theme || user.theme || 'DEFAULT') as Theme
    setSession((current) => (current ? { ...current, user: { ...user, theme: user.theme || currentTheme } } : current))
    setProfileRevision((revision) => revision + 1)
  }, [session?.user?.theme])

  const handleThemeUpdated = useCallback((user: User) => {
    setSession((current) => (current ? { ...current, user } : current))
    cacheTheme(user.theme)
  }, [])

  useEffect(() => {
    applyTheme(session?.user?.theme ?? readThemeCookie() ?? (session?.token ? cachedTheme() : 'DEFAULT'))
  }, [session?.token, session?.user?.theme])

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
    return <RequiredPasswordChangeView
      onLogout={handleLogout}
      onCompleted={(user) => setSession((current) => current ? { ...current, user } : current)}
    />
  }

  if (pathname === '/admin') {
      if (!session.user.roles.includes('ADMIN')) return <DesktopShell servers={desktopServers} activeId={activeDesktopId} onChange={connectDesktopServer} onServersChange={setDesktopServers}><ChatView session={session} avatarRevision={profileRevision} onLogout={handleLogout} onPresenceChange={handlePresenceChange} onProfileUpdated={handleProfileUpdated} onThemeUpdated={handleThemeUpdated} /></DesktopShell>
      return <DesktopShell servers={desktopServers} activeId={activeDesktopId} onChange={connectDesktopServer} onServersChange={setDesktopServers}><AdminView me={session.user} onBack={() => { window.history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')) }} /></DesktopShell>
   }
  return <DesktopShell servers={desktopServers} activeId={activeDesktopId} onChange={connectDesktopServer} onServersChange={setDesktopServers}><ChatView session={session} avatarRevision={profileRevision} onLogout={handleLogout} onPresenceChange={handlePresenceChange} onProfileUpdated={handleProfileUpdated} onThemeUpdated={handleThemeUpdated} /></DesktopShell>
}

function DesktopShell({ children, servers, activeId, onChange, onServersChange }: { children: ReactNode; servers: ReturnType<typeof getDesktopServers>; activeId: string | null; onChange: (server: { id: string; url: string }) => void; onServersChange: (servers: ReturnType<typeof getDesktopServers>) => void }) {
  const [aboutOpen, setAboutOpen] = useState(false)
  if (!isTauri) return <>{children}</>
  return <div className="desktop-shell"><div className="desktop-shell-content">{children}</div><ServerSwitcher servers={servers} activeId={activeId} onChange={onChange} onServersChange={onServersChange} onAbout={() => setAboutOpen(true)} />{aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}</div>
}

function LoginView({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await api.login(username.trim(), password)
      onLogin({ token: res.token, user: res.user })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao entrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card-wrap">
        <div className="login-card">
          <div className="brand">
            <div className="brand-signature">
              <img className="brand-logo" src="/icons/Konnix white.png" alt="Konnix" />
              <div className="brand-wordmark">
                <strong>Konnix</strong>
                <span>Chat</span>
              </div>
            </div>
            <p>Comunicação interativa de trabalho</p>
          </div>
        <form onSubmit={submit} className="login-form">
          <label>
            Usuário
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="seu.usuario"
              required
            />
          </label>
          <label>
            Senha
            <span className="password-input-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}>
                {showPassword ? 'Ocultar' : 'Exibir'}
              </button>
            </span>
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
        <p className="login-signature"><strong>Criado por</strong> Geraldo Valencia<br /><strong>Colaboração</strong>: Anderson Fabião, Kevin Kilmer,<br />Sérgio Cauã e Matheus Bruno</p>
      </div>
    </div>
  )
}

function RequiredPasswordChangeView({ onLogout, onCompleted }: {
  onLogout: () => void
  onCompleted: (user: User) => void
}) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const passwordError = validatePassword(password)
    if (passwordError) { setError(passwordError); return }
    if (password !== confirmation) { setError('As senhas não coincidem.'); return }
    setError(null)
    setLoading(true)
    try {
      onCompleted(await api.changeRequiredPassword(password, confirmation))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar a nova senha')
    } finally {
      setLoading(false)
    }
  }

  return <div className="login-screen">
    <div className="login-card-wrap">
      <div className="login-card required-password-card">
        <div className="brand">
          <div className="brand-signature">
            <img className="brand-logo" src="/icons/Konnix white.png" alt="Konnix" />
            <div className="brand-wordmark"><strong>Konnix</strong><span>Chat</span></div>
          </div>
          <h1>Defina uma nova senha</h1>
          <p>Sua senha foi redefinida por um administrador. Para continuar, escolha uma nova senha.</p>
        </div>
        <form onSubmit={submit} className="login-form">
          <label>Nova senha<span className="password-input-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? 'Ocultar' : 'Exibir'}</button></span></label>
          <label>Confirmar nova senha<span className="password-input-wrap"><input type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /><button type="button" className="password-toggle" onClick={() => setShowConfirmation((visible) => !visible)}>{showConfirmation ? 'Ocultar' : 'Exibir'}</button></span></label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Salvando…' : 'Salvar nova senha'}</button>
          <button type="button" className="btn-ghost" onClick={onLogout} disabled={loading}>Sair</button>
        </form>
      </div>
    </div>
  </div>
}

function ChatView({ session, avatarRevision, onLogout, onPresenceChange, onProfileUpdated, onThemeUpdated }: {
  session: Session
  avatarRevision: number
  onLogout: () => void
  onPresenceChange: (status: PresenceStatus) => Promise<User>
  onProfileUpdated: (user: User) => void
  onThemeUpdated: (user: User) => void
}) {
  const online = useOnline()
  const [rooms, setRooms] = useState<Room[]>([])
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
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
  const [previewTheme, setPreviewTheme] = useState<Theme | null>(null)
  const [loadingRoom, setLoadingRoom] = useState(false)
  const [composing, setComposing] = useState(false)
  const [typingByRoom, setTypingByRoom] = useState<Record<string, Record<string, TypingUser>>>({})
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [standalone] = useState(
    window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true,
  )
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  const activeRoomIdRef = useRef(activeRoomId)
  activeRoomIdRef.current = activeRoomId
  const roomsRef = useRef(rooms)
  roomsRef.current = rooms
  const onlineRef = useRef(online)
  onlineRef.current = online
  const wsRef = useRef<WebSocket | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const roomLoadRequestRef = useRef(0)
  const isInitializingConversationRef = useRef(false)

  const me = session.user
  const effectiveTheme = themeOpen ? (previewTheme ?? me.theme) : me.theme

  const presenceStatusRef = useRef(me.presenceStatus)
  presenceStatusRef.current = me.presenceStatus
  const presenceUpdateInFlightRef = useRef(false)
  const autoAwayRef = useRef(false)

  const changePresenceManually = useCallback(async (status: PresenceStatus) => {
    autoAwayRef.current = false
    return onPresenceChange(status)
  }, [onPresenceChange])

  const registerInteraction = useCallback(() => {
    if (!autoAwayRef.current || presenceStatusRef.current === 'online' || presenceUpdateInFlightRef.current) return
    presenceUpdateInFlightRef.current = true
    autoAwayRef.current = false
    void onPresenceChange('online')
      .catch(() => undefined)
      .finally(() => { presenceUpdateInFlightRef.current = false })
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
          autoAwayRef.current = true
          void onPresenceChange('away')
            .catch(() => { autoAwayRef.current = false })
            .finally(() => { presenceUpdateInFlightRef.current = false })
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
    scheduleAway()
    return () => {
      if (idleTimer) clearTimeout(idleTimer)
      events.forEach((event) => document.removeEventListener(event, onInteraction, true))
    }
  }, [registerInteraction, onPresenceChange])

  const myAvatarVersion = `${me.updatedAt}|r${avatarRevision}`

  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) ?? null,
    [rooms, activeRoomId],
  )

  const showToast = useCallback((text: string) => {
    setToast({ id: Date.now(), text })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }, [])

  const sendTypingStatus = useCallback((roomId: string, isTyping: boolean) => {
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
      setRooms(nextRooms)
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
    api.userDirectory(query).then((users) => {
       if (active) setSearchUsers(users.filter((user) => user.accountStatus !== 'DISABLED'))
    }).catch(() => {
      if (active) setSearchUsers([])
    })
    return () => { active = false }
  }, [search, me.id])

  const openRoom = useCallback(
    async (roomId: string) => {
      const requestId = ++roomLoadRequestRef.current
      isInitializingConversationRef.current = true
      setActiveRoomId(roomId)
      setMessages([])
      setHasMore(false)
      setNextBefore(null)
      setSidebarOpen(false)
      setRooms((prev) => prev.map((room) => room.id === roomId ? { ...room, unreadCount: 0 } : room))
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

  useEffect(() => {
    api.readReceiptSetting().then((setting) => setReadReceiptsEnabled(setting.enabled)).catch(() => undefined)
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
            const activeRoomVisible = msg.roomId === activeRoomIdRef.current && !appInBackground
            const shouldUnread = msg.messageType !== 'SYSTEM' && msg.userId !== me.id && !activeRoomVisible
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
                      unreadCount: shouldUnread ? (room.unreadCount ?? 0) + 1 : (activeRoomVisible ? 0 : (room.unreadCount ?? 0)),
                    }
                  : room,
              )
              return updated.sort((a, b) => roomActivityTime(b) - roomActivityTime(a))
            })
            if (msg.roomId === activeRoomIdRef.current) {
              setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
               if (activeRoomVisible && msg.messageType !== 'SYSTEM' && msg.userId !== me.id) {
                 api.markRoomRead(msg.roomId).catch(() => undefined)
               }
             }
               if (shouldUnread) {
                const room = roomsRef.current.find((r) => r.id === msg.roomId)
                const label = room ? roomDisplayName(room) : 'Chat'
                const snippet = msg.content.replace(/\s+/g, ' ').trim()
                const body = snippet ? `${msg.username}: ${snippet}` : `${msg.username} enviou um anexo`
                if (appInBackground) {
                  let enabled = false
                  try { enabled = localStorage.getItem('konnix-system-notifications') === 'true' } catch { /* preferência opcional */ }
                  if (enabled) {
                    if (isTauri) {
                      void notifyDesktop('Konnix Chat', body, msg.roomId).catch(() => undefined)
                    } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                      void notifyDesktop('Konnix Chat', body, msg.roomId).catch(() => undefined)
                    }
                  }
                } else if (msg.roomId !== activeRoomIdRef.current) {
                  showToast(`${label} • ${body}`)
                }
              }
          } else if (evt.type === 'chat.typing') {
            const payload = evt.data as unknown as { userId: string; username: string; name: string; isTyping: boolean }
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
                  : [...current.filter((entry) => !(entry.userId === reaction.userId && entry.emoji === reaction.emoji)), reaction]
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
            setRooms((prev) => prev.map((room) => room.directPartner?.userId === presence.userId
              ? { ...room, directPartner: { ...room.directPartner, presenceStatus: presence.status } }
              : room))
            setSearchUsers((prev) => prev.map((user) => user.id === presence.userId
              ? { ...user, presenceStatus: presence.status }
              : user))
          } else if (evt.type === 'room.added') {
            const room = evt.data as unknown as Room
            if (room?.id) {
              setRooms((prev) => prev.some((item) => item.id === room.id) ? prev : [room, ...prev])
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
              setRooms((prev) => prev.map((room) =>
                room.id === payload.roomId ? { ...room, pinnedMessage: payload.pinnedMessage } : room,
              ))
            }
          } else if (evt.type === 'room.updated') {
            const updated = evt.data as unknown as Room
            if (updated?.id) {
              setRooms((prev) => prev.map((room) =>
                room.id === updated.id ? { ...room, name: updated.name, displayName: updated.displayName, readOnly: updated.readOnly, type: updated.type, updatedAt: updated.updatedAt } : room,
              ))
            }
          } else if (evt.type === 'room.favorite.updated') {
            const payload = evt.data as unknown as { roomId: string; favorite: boolean }
            if (payload?.roomId) {
              setRooms((prev) => prev.map((room) =>
                room.id === payload.roomId ? { ...room, favorite: payload.favorite } : room,
              ))
            }
          }
        } catch {
          /* ignora payloads inválidos */
        }
      }
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null
        if (!closedByUser) {
          retry = setTimeout(connect, 3000)
        }
      }
      ws.onerror = () => ws?.close()
    }

    connect()
    return () => {
      closedByUser = true
      if (retry) clearTimeout(retry)
      ws?.close()
    }
  }, [session.token, showToast])

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
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

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

  const installApp = useCallback(async () => {
    if (!installEvent) return
    await installEvent.prompt()
    await installEvent.userChoice
    setInstallEvent(null)
  }, [installEvent])

  const sendMessage = async (content: string, parentMessageId?: string, attachments: File[] = []): Promise<boolean> => {
    const roomId = activeRoomId
    if (!roomId || (!content.trim() && attachments.length === 0) || !online || composing || me.accountStatus === 'READ_ONLY') return false
    setComposing(true)
    try {
      const createdMessages = attachments.length === 0
        ? [await api.sendMessage(roomId, content.trim(), parentMessageId)]
        : await Promise.all(attachments.map((file, index) => api.uploadFile(roomId, file, index === 0 ? content.trim() : undefined)))
      for (const created of createdMessages) {
        setRooms((prev) => prev.map((room) =>
          room.id === roomId ? { ...room, lastActivityAt: created.createdAt } : room,
        ))
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
      setMessages((prev) => prev.map((item) => {
        if (item.id !== message.id) return item
        const current = item.reactions ?? []
        const next = reaction.id === null
          ? current.filter((entry) => !(entry.userId === me.id && entry.emoji === emoji))
          : [...current.filter((entry) => !(entry.userId === me.id && entry.emoji === emoji)), reaction]
        return { ...item, reactions: next }
      }))
    } catch (error) { showToast(error instanceof ApiError ? error.message : 'Falha ao reagir à mensagem') }
  }

  const startDirectConversation = useCallback(async (userId: string) => {
    try {
      const room = await api.createDm(userId)
      setRooms((previous) => previous.some((item) => item.id === room.id) ? previous : [room, ...previous])
      await openRoom(room.id)
    } catch (error) { showToast(error instanceof ApiError ? error.message : 'Não foi possível abrir a conversa') }
  }, [openRoom, showToast])

  const startUserDmFromSearch = useCallback(async (userId: string) => {
    await startDirectConversation(userId)
    setForceScrollRequest((request) => request + 1)
    setSearch('')
  }, [startDirectConversation])
  const openTheme = useCallback(() => { setPreviewTheme(me.theme); setThemeOpen(true) }, [me.theme])
  const openProfileEdit = useCallback(() => setProfileEditOpen(true), [])
  const openAbout = useCallback(() => setAboutOpen(true), [])
  const openReportIssue = useCallback(() => setReportIssueOpen(true), [])
  const openNewRoom = useCallback(() => setNewRoomOpen(true), [])
  const openNewDm = useCallback(() => setNewDmOpen(true), [])

  const handleDelete = async (msg: Message) => {
    if (msg.deletedAt || msg.userId !== me.id || me.accountStatus === 'READ_ONLY') return
    try {
      const deleted = await api.deleteMessage(msg.id)
      setMessages((prev) => prev.map((m) => (m.id === deleted.id ? deleted : m)))
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Falha ao excluir mensagem')
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const message = pendingDelete
    setPendingDelete(null)
    await handleDelete(message)
  }

  const handleRoomCreated = async (roomId: string) => {
    setNewRoomOpen(false)
    setNewDmOpen(false)
    await loadRooms()
    await openRoom(roomId)
  }

  const addSearchResult = useCallback((result: Message) => {
    setMessages((previous) => previous.some((message) => message.id === result.id)
      ? previous
      : [...previous, result].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)))
  }, [])

  const q = search.trim().toLowerCase()
  const channels = useMemo(
    () =>
      rooms.filter(
        (r) =>
          r.type !== 'DIRECT' &&
          (!q || `${roomDisplayName(r)} ${r.name ?? ''}`.toLowerCase().includes(q)),
      ).sort((a, b) => (Number(b.unreadCount > 0) - Number(a.unreadCount > 0)) || roomActivityTime(b) - roomActivityTime(a)),
    [rooms, q],
  )
  const conversations = useMemo(
    () =>
      rooms.filter(
        (r) =>
          r.type === 'DIRECT' &&
          r.directPartner?.accountStatus !== 'DISABLED' &&
          (!q ||
            `${roomDisplayName(r)} ${r.directPartner?.username ?? ''}`.toLowerCase().includes(q)),
      ).sort((a, b) => (Number(b.unreadCount > 0) - Number(a.unreadCount > 0)) || roomActivityTime(b) - roomActivityTime(a)),
    [rooms, q],
  )
  const favoriteRooms = useMemo(() => rooms.filter((room) => room.favorite && room.directPartner?.accountStatus !== 'DISABLED'), [rooms])
  const regularConversations = useMemo(() => conversations.filter((room) => !room.favorite), [conversations])
  const regularChannels = useMemo(() => channels.filter((room) => !room.favorite), [channels])

  return (
    <div className="chat-shell">
      <div className={`chat-body ${sidebarOpen ? 'sidebar-open' : ''}`}>
        {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
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
          canInstall={!standalone && !!installEvent}
          onInstall={installApp}
          onPresenceChange={changePresenceManually}
          onPresenceError={showToast}
          typingByRoom={typingByRoom}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="main">
          {!activeRoom ? (
            <EmptyState onOpenSidebar={() => setSidebarOpen(true)} />
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
              typingUsers={typingByRoom[activeRoom.id]}
              onTyping={(isTyping) => sendTypingStatus(activeRoom.id, isTyping)}
              onBack={() => { setActiveRoomId(null); setSidebarOpen(true) }}
              onSend={sendMessage}
              onInitialPositioned={() => { isInitializingConversationRef.current = false }}
              onDelete={(message) => {
                if (!message.deletedAt && message.userId === me.id && me.accountStatus !== 'READ_ONLY') setPendingDelete(message)
              }}
              onMessageUpdated={(updated) => setMessages((current) => current.map((item) => item.id === updated.id ? updated : item))}
              onReaction={(message, emoji) => void reactMessage(message, emoji)}
              onStartDm={startDirectConversation}
              notify={showToast}
              readReceiptsEnabled={readReceiptsEnabled}
              onSearchResult={addSearchResult}
              onPollUpdated={addSearchResult}
              onRoomUpdated={(updated) => setRooms((prev) => prev.map((item) => item.id === updated.id ? updated : item))}
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
          showToast={showToast}
        />
      )}
      {newDmOpen && (
        <NewDmModal me={me} onClose={() => setNewDmOpen(false)} onCreated={handleRoomCreated} showToast={showToast} />
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
          notify={showToast}
        />
      )}
      {themeOpen && (
        <ThemeModal
          theme={me.theme}
          onClose={() => setThemeOpen(false)}
          onPreview={setPreviewTheme}
          onSaved={(user) => { onThemeUpdated(user); setPreviewTheme(null); setThemeOpen(false) }}
          notify={showToast}
        />
      )}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {reportIssueOpen && <ReportIssueModal onClose={() => setReportIssueOpen(false)} notify={showToast} />}
      {pendingDelete && <ConfirmModal title="Excluir mensagem" message="Esta ação não pode ser desfeita. Deseja excluir esta mensagem?" onClose={() => setPendingDelete(null)} onConfirm={() => void confirmDelete()} />}

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
        <button className="toast" onClick={() => setToast(null)}>
          {toast.text}
        </button>
      )}
    </div>
  )
}

const PRESENCE_OPTIONS: { id: PresenceStatus; label: string }[] = [
  { id: 'online', label: 'Conectado' },
  { id: 'away', label: 'Volto logo' },
  { id: 'busy', label: 'Ocupado' },
  { id: 'offline', label: 'Offline' },
  { id: 'mission', label: 'Em missão' },
  { id: 'vacation', label: 'Férias' },
]

function presenceLabel(status: PresenceStatus): string {
  return PRESENCE_OPTIONS.find((option) => option.id === status)?.label ?? 'Offline'
}

function PresenceSelector({
  status,
  onChange,
  onError,
}: {
  status: PresenceStatus
  onChange: (status: PresenceStatus) => Promise<User>
  onError: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const currentIndex = Math.max(0, PRESENCE_OPTIONS.findIndex((option) => option.id === status))
  const current = PRESENCE_OPTIONS[currentIndex]

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const select = async (next: PresenceStatus) => {
    if (next === status) {
      setOpen(false)
      return
    }
    try {
      await onChange(next)
      setOpen(false)
    } catch {
      onError('Não foi possível atualizar seu status')
    }
  }

  const move = (direction: number) => {
    setHighlightedIndex((index) => (index + direction + PRESENCE_OPTIONS.length) % PRESENCE_OPTIONS.length)
  }

  return (
    <div className="presence-selector" ref={menuRef}>
      <button
        type="button"
        className={`presence-pill presence-${status}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setHighlightedIndex(currentIndex)
          setOpen((value) => !value)
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            setOpen(true)
          } else if (open && event.key === 'ArrowDown') {
            event.preventDefault()
            move(1)
          } else if (open && event.key === 'ArrowUp') {
            event.preventDefault()
            move(-1)
          } else if (open && event.key === 'Enter') {
            event.preventDefault()
            void select(PRESENCE_OPTIONS[highlightedIndex].id)
          }
        }}
      >
        <span className="presence-dot" aria-hidden="true" />
        <span>{current.label}</span>
        <span className="presence-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="presence-menu" role="menu">
          {PRESENCE_OPTIONS.map((option) => (
            <button
              type="button"
              role="menuitem"
              key={option.id}
              className={`presence-option presence-${option.id} ${option.id === status ? 'selected' : ''} ${PRESENCE_OPTIONS.indexOf(option) === highlightedIndex ? 'highlighted' : ''}`}
              onMouseEnter={() => setHighlightedIndex(PRESENCE_OPTIONS.indexOf(option))}
              onClick={() => void select(option.id)}
            >
              <span className="presence-check">{option.id === status ? '✓' : ''}</span>
              <span className="presence-dot" aria-hidden="true" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function UserSettingsMenuContent({
  me,
  onTheme,
  onEditProfile,
  onReportIssue,
  onAbout,
  onLogout,
  onClose,
}: {
  me: User
  onTheme: () => void
  onEditProfile: () => void
  onReportIssue: () => void
  onAbout: () => void
  onLogout: () => void
  onClose: () => void
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

const Sidebar = memo(function Sidebar({
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
  canInstall,
  onInstall,
  onPresenceChange,
  onPresenceError,
  typingByRoom,
  onClose,
}: {
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
  onStartUserDm: (userId: string) => void | Promise<void>
  onLogout: () => void
  onTheme: () => void
  onEditProfile: () => void
  onAbout: () => void
  onReportIssue: () => void
  myAvatarVersion: string
  canInstall: boolean
  onInstall: () => void
  onPresenceChange: (status: PresenceStatus) => Promise<User>
  onPresenceError: (message: string) => void
  typingByRoom: Record<string, Record<string, TypingUser>>
  onClose?: () => void
}) {
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
  const hasSearchResults = userResults.length > 0 || filteredFavorites.length > 0 || filteredRegularChannels.length > 0 || filteredConversations.length > 0

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
    await onStartUserDm(userId)
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
                      <button key={user.id} className="room-item search-user-item" onClick={() => void handleSelectUser(user.id)}>
                        <span className="sidebar-avatar-wrap">
                          <AvatarImage path={userAvatarPath(user.id)} className="mini-avatar" fallback={<span className="mini-avatar">{initials(user.name || user.username)}</span>} alt={user.name || user.username} />
                          {user.presenceStatus && <span className={`sidebar-presence-dot presence-${user.presenceStatus}`} title={presenceLabel(user.presenceStatus)} aria-label={`Status: ${presenceLabel(user.presenceStatus)}`} />}
                        </span>
                        <span className="picker-item-text">
                          <strong>{user.name || user.username}</strong>
                          <small>@{user.username}{user.email ? ` · ${user.email}` : ''}</small>
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
                      <button key={room.id} className={`room-item ${room.id === activeRoomId ? 'active' : ''}`} onClick={() => handleSelectRoom(room.id)}>
                        {room.type === 'DIRECT' ? (
                          <span className="room-icon direct">
                            <span className="sidebar-avatar-wrap">
                              <AvatarImage path={room.directPartner ? userAvatarPath(room.directPartner.userId) : null} className="mini-avatar" fallback={<span className="mini-avatar">{initials(roomDisplayName(room))}</span>} alt={roomDisplayName(room)} />
                              {room.directPartner?.presenceStatus && <span className={`sidebar-presence-dot presence-${room.directPartner.presenceStatus}`} title={presenceLabel(room.directPartner.presenceStatus)} aria-label={`Status: ${presenceLabel(room.directPartner.presenceStatus)}`} />}
                            </span>
                          </span>
                        ) : (
                          <span className={`room-icon ${room.type === 'CHANNEL' ? 'channel' : 'group'}`}>{getRoomIcon(room)}</span>
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
                      <button key={room.id} className={`room-item ${room.id === activeRoomId ? 'active' : ''}`} onClick={() => handleSelectRoom(room.id)}>
                        <AvatarImage
                          path={`${roomAvatarPath(room.id)}?v=${encodeURIComponent(room.updatedAt)}`}
                          className="room-thumb"
                          fallback={<span className={`room-icon ${room.type === 'CHANNEL' ? 'channel' : 'group'}`}>{getRoomIcon(room)}</span>}
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
                      <button key={room.id} className={`room-item ${room.id === activeRoomId ? 'active' : ''}`} onClick={() => handleSelectRoom(room.id)}>
                        <span className="room-icon direct">
                          <span className="sidebar-avatar-wrap">
                            <AvatarImage
                              path={room.directPartner ? userAvatarPath(room.directPartner.userId) : null}
                              className="mini-avatar"
                              fallback={<span className="mini-avatar">{initials(roomDisplayName(room))}</span>}
                              alt={roomDisplayName(room)}
                            />
                            {room.directPartner?.presenceStatus && <span className={`sidebar-presence-dot presence-${room.directPartner.presenceStatus}`} title={presenceLabel(room.directPartner.presenceStatus)} aria-label={`Status: ${presenceLabel(room.directPartner.presenceStatus)}`} />}
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
                  <button type="button" className="nav-section-toggle" onClick={() => setFavoritesOpen((open) => !open)} aria-expanded={favoritesOpen} aria-controls="favorites-list">
                    <span className="nav-chevron">{favoritesOpen ? '⌄' : '›'}</span>
                    <span className="nav-section-title">Favoritos</span>
                  </button>
                </div>
                {favoritesOpen && (
                  <div className="nav-list" id="favorites-list">
                    {favoriteRooms.map((room) => (
                      <button key={room.id} className={`room-item ${room.id === activeRoomId ? 'active' : ''}`} onClick={() => handleSelectRoom(room.id)}>
                        {room.type === 'DIRECT' ? (
                          <span className="room-icon direct">
                            <span className="sidebar-avatar-wrap">
                              <AvatarImage path={room.directPartner ? userAvatarPath(room.directPartner.userId) : null} className="mini-avatar" fallback={<span className="mini-avatar">{initials(roomDisplayName(room))}</span>} alt={roomDisplayName(room)} />
                              {room.directPartner?.presenceStatus && <span className={`sidebar-presence-dot presence-${room.directPartner.presenceStatus}`} title={presenceLabel(room.directPartner.presenceStatus)} aria-label={`Status: ${presenceLabel(room.directPartner.presenceStatus)}`} />}
                            </span>
                          </span>
                        ) : (
                          <span className={`room-icon ${room.type === 'CHANNEL' ? 'channel' : 'group'}`}>{getRoomIcon(room)}</span>
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
                              <span className="room-type typing-active" style={{ display: 'block', fontSize: '0.72rem' }}>
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
                            <span className="room-type typing-active" style={{ display: 'block', fontSize: '0.72rem' }}>
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
                            {room.directPartner?.presenceStatus && <span className={`sidebar-presence-dot presence-${room.directPartner.presenceStatus}`} title={presenceLabel(room.directPartner.presenceStatus)} aria-label={`Status: ${presenceLabel(room.directPartner.presenceStatus)}`} />}
                          </span>
                        </span>
                        <span className="room-name">
                          {roomDisplayName(room)}
                          {typingText && (
                            <span className="room-type typing-active" style={{ display: 'block', fontSize: '0.72rem' }}>
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

      {canInstall && (
        <button className="install-link" onClick={onInstall}>
          Instalar app
        </button>
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
          <span className="settings-btn" aria-hidden="true">⚙</span>
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
            />
          </div>
        )}
      </div>
    </aside>
  )
})

function NewRoomModal({
  me,
  onClose,
  onCreated,
  showToast,
}: {
  me: User
  onClose: () => void
  onCreated: (roomId: string) => void
  showToast: (text: string) => void
}) {
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [type, setType] = useState<'PRIVATE_GROUP' | 'CHANNEL'>('PRIVATE_GROUP')
  const [members, setMembers] = useState<DirectoryUser[]>([])
  const [busy, setBusy] = useState(false)

  const create = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const room = await api.createRoom(name.trim(), displayName.trim(), type)
      for (const member of members) {
        try {
          await api.addMember(room.id, member.id)
        } catch {
          /* segue mesmo se falhar ao adicionar */
        }
      }
      onCreated(room.id)
    } catch (err) {
       showToast(err instanceof ApiError ? err.message : 'Falha ao criar sala')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={type === 'CHANNEL' ? 'Criar canal' : 'Criar grupo'} onClose={onClose}>
      <div className="modal-fields">
        <label className="field-label">
          Tipo
          <select className="input" value={type} onChange={(e) => setType(e.target.value as 'PRIVATE_GROUP' | 'CHANNEL')}>
            <option value="PRIVATE_GROUP">🔒 Grupo</option>
            <option value="CHANNEL"># Canal</option>
          </select>
          <small className="field-hint">{type === 'CHANNEL' ? 'Somente você (proprietário) e administradores podem escrever. Demais membros leem.' : 'Todos os membros podem escrever.'}</small>
        </label>
        <label className="field-label">
          Nome
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex.: financeiro"
            autoFocus
            required
          />
        </label>
        <label className="field-label">
          Nome de exibição (opcional)
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="ex.: Financeiro"
          />
        </label>
        <label className="field-label">
          Adicionar membros (opcional)
          <MemberPicker selected={members} onChange={setMembers} excludeId={me.id} />
        </label>
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={create} disabled={busy || !name.trim()}>
          {busy ? 'Criando…' : 'Criar'}
        </button>
      </div>
    </Modal>
  )
}

function NewDmModal({
  me,
  onClose,
  onCreated,
  showToast,
}: {
  me: User
  onClose: () => void
  onCreated: (roomId: string) => void
  showToast: (text: string) => void
}) {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [selected, setSelected] = useState<DirectoryUser | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try {
      setUsers(await api.userDirectory())
    } catch {
      setUsers([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter(
      (u) =>
        u.accountStatus !== 'DISABLED' &&
        (!q || `${u.name} ${u.username}`.toLowerCase().includes(q)),
    )
  }, [users, search, me.id])

  const start = async () => {
    if (!selected || busy) return
    setBusy(true)
    try {
      const room = await api.createDm(selected.id)
      onCreated(room.id)
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Falha ao iniciar conversa')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Nova conversa" onClose={onClose}>
      <div className="modal-fields">
        <input
          className="input"
          placeholder="Buscar pessoa…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <div className="picker-list">
          {filtered.length === 0 && <span className="nav-empty">Nenhuma pessoa encontrada</span>}
          {filtered.map((u) => (
            <button
              key={u.id}
              className={`picker-item ${selected?.id === u.id ? 'active' : ''}`}
              onClick={() => setSelected(u)}
            >
              <AvatarImage
                path={userAvatarPath(u.id)}
                className="mini-avatar"
                fallback={<span className="mini-avatar">{initials(u.name || u.username)}</span>}
                alt={u.name || u.username}
              />
              <span className="picker-item-text">
                <strong>{u.name || u.username}</strong>
                <small>@{u.username}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={start} disabled={busy || !selected}>
          {busy ? 'Abrindo…' : 'Iniciar conversa'}
        </button>
      </div>
    </Modal>
  )
}

function MemberPicker({
  selected,
  onChange,
  excludeId,
}: {
  selected: DirectoryUser[]
  onChange: (users: DirectoryUser[]) => void
  excludeId: string
}) {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      setUsers(await api.userDirectory())
    } catch {
      setUsers([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter(
      (u) =>
        u.id !== excludeId &&
        u.accountStatus !== 'DISABLED' &&
        !selected.some((s) => s.id === u.id) &&
        (!q || `${u.name} ${u.username}`.toLowerCase().includes(q)),
    )
  }, [users, search, selected, excludeId])

  const toggle = (u: DirectoryUser) => {
    if (selected.some((s) => s.id === u.id)) {
      onChange(selected.filter((s) => s.id !== u.id))
    } else {
      onChange([...selected, u])
    }
  }

  return (
    <div className="member-picker">
      <input
        className="input"
        placeholder="Buscar pessoa…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {selected.length > 0 && (
        <div className="chips">
          {selected.map((u) => (
            <span key={u.id} className="chip-user">
              {u.name || u.username}
              <button onClick={() => toggle(u)} aria-label="Remover">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="picker-list small">
        {filtered.length === 0 && <span className="nav-empty">Nenhuma pessoa encontrada</span>}
        {filtered.map((u) => (
          <button key={u.id} className="picker-item" onClick={() => toggle(u)}>
            <AvatarImage
              path={userAvatarPath(u.id)}
              className="mini-avatar"
              fallback={<span className="mini-avatar">{initials(u.name || u.username)}</span>}
              alt={u.name || u.username}
            />
            <span className="picker-item-text">
              <strong>{u.name || u.username}</strong>
              <small>@{u.username}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Modal({
  title,
  onClose,
  children,
  className = '',
  overlayClassName = '',
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  className?: string
  overlayClassName?: string
}) {
  const titleId = `modal-title-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  useEffect(() => { closeRef.current?.focus() }, [])

  return (
    <div className={`modal-overlay ${overlayClassName}`} onMouseDown={onClose}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button ref={closeRef} className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  )
}

function ConfirmModal({ title, message, onClose, onConfirm }: { title: string; message: string; onClose: () => void; onConfirm: () => void }) {
  return <Modal title={title} onClose={onClose} className="confirm-modal">
    <p className="confirm-message">{message}</p>
    <div className="modal-actions"><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="danger-action confirm-danger" onClick={onConfirm}>Excluir</button></div>
  </Modal>
}

function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
}

function EmptyState({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  return (
    <div className="empty-state">
      <img src="/icons/icon-192.png" alt="Konnix" className="empty-logo" />
      <h2>Konnix Chat</h2>
      <p>Comunicação corporativa segura e em tempo real.</p>
      <button type="button" className="btn-primary empty-chat-action" onClick={onOpenSidebar}>
        <IconMessage size={18} />
        <span>Conversar</span>
      </button>
      <AboutDetails className="empty-about-details" />
    </div>
  )
}

function AboutModal({ onClose }: { onClose: () => void }) {
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

function AboutDetails({ className = '' }: { className?: string }) {
  return <dl className={`about-details ${className}`}>
    <div><dt>Ano de criação</dt><dd>2026</dd></div>
    <div><dt>Desenvolvedor</dt><dd>Geraldo Valencia</dd></div>
    <div><dt>Colaboradores</dt><dd>Anderson Fabião, Kevin Kilmer, Sérgio Cauã e Matheus Bruno</dd></div>
    <div><dt>Local</dt><dd>João Pessoa - Brasil</dd></div>
  </dl>
}

function ThemeModal({ theme, onClose, onPreview, onSaved, notify }: {
  theme: Theme
  onClose: () => void
  onPreview: (theme: Theme) => void
  onSaved: (user: User) => void
  notify: (text: string) => void
}) {
  const initialTheme = normalizeTheme(theme)
  const [selected, setSelected] = useState<Theme>(initialTheme)
  const [busy, setBusy] = useState(false)

  const close = () => {
    applyTheme(initialTheme)
    onPreview(initialTheme)
    onClose()
  }

  const choose = (next: Theme) => {
    setSelected(next)
    applyTheme(next)
    onPreview(next)
  }

  const save = async () => {
    if (busy) return
    setBusy(true)
    try {
      const user = await api.updateOwnTheme(selected)
      applyTheme(user.theme)
      onSaved(user)
    } catch (error) {
      applyTheme(initialTheme)
      setSelected(initialTheme)
      onPreview(initialTheme)
      notify(error instanceof ApiError ? error.message : 'Não foi possível salvar o tema')
    } finally {
      setBusy(false)
    }
  }

  return <Modal title="Escolher tema" onClose={close} className="theme-modal">
    <div className="theme-options" role="radiogroup" aria-label="Temas disponíveis">
      {THEME_OPTIONS.map((option) => <button
        type="button"
        role="radio"
        aria-checked={selected === option.id}
        key={option.id}
        className={`theme-option ${selected === option.id ? 'selected' : ''}`}
        onClick={() => choose(option.id)}
      >
        <span className="theme-option-heading"><strong>{selected === option.id ? '✓ ' : ''}{option.label}</strong></span>
        <span className="theme-preview" aria-hidden="true">{option.colors.map((color) => <i key={color} style={{ backgroundColor: color }} />)}</span>
      </button>)}
    </div>
    <div className="modal-actions">
      <button className="btn-ghost" onClick={close}>Cancelar</button>
      <button className="btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Aplicar tema'}</button>
    </div>
  </Modal>
}

function ProfileEditModal({ me, myAvatarVersion, onClose, onSaved, notify }: {
  me: User
  myAvatarVersion: string
  onClose: () => void
  onSaved: (user: User) => void
  notify: (text: string) => void
}) {
  useEscapeClose(onClose)
  const [name, setName] = useState(me.name)
  const [email, setEmail] = useState(me.email || '')
  const [avatar, setAvatar] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pickAvatar = (file: File | null) => {
    if (preview) URL.revokeObjectURL(preview)
    setAvatar(file)
    setPreview(file ? URL.createObjectURL(file) : null)
  }

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview) }
  }, [preview])

  const save = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      let updated = await api.updateOwnProfile(name.trim(), email.trim())
      if (avatar) updated = await api.updateOwnAvatar(avatar)
      onSaved(updated)
      notify('Perfil atualizado')
      onClose()
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Falha ao atualizar perfil')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal">
        <div className="modal-head">
          <h3>Editar meu perfil</h3>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <div className="edit-user-heading">
          {preview
            ? <img src={preview} className="edit-user-avatar" alt="Prévia do avatar" />
            : <AvatarImage path={`${userAvatarPath(me.id)}?v=${encodeURIComponent(myAvatarVersion)}`} className="edit-user-avatar" fallback={<span className="edit-user-avatar">{initials(name || me.name)}</span>} alt={name || me.name} />}
          <div className="edit-user-title">
            <strong>{name.trim() || me.name}</strong>
            <small>@{me.username}</small>
          </div>
        </div>
        <div className="modal-fields">
          <label className="admin-label">Nome<input autoComplete="off" className="input" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="admin-label">Username<input className="input readonly-input" value={`@${me.username}`} readOnly disabled /></label>
          <label className="admin-label">E-mail<input autoComplete="off" className="input" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="admin-label">Imagem de perfil<input autoComplete="off" className="input" type="file" accept="image/*" onChange={(event) => pickAvatar(event.target.files?.[0] || null)} /></label>
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={busy || !name.trim()} onClick={save}>{busy ? 'Salvando...' : 'Salvar alterações'}</button>
        </div>
      </div>
    </div>
  )
}

function AddMembersModal({
  room,
  onClose,
  notify,
}: {
  room: Room
  onClose: () => void
  notify: (text: string) => void
}) {
  const [selected, setSelected] = useState<DirectoryUser[]>([])
  const [currentMembers, setCurrentMembers] = useState<RoomMember[]>([])
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyOwnerId, setBusyOwnerId] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(true)

  useEffect(() => {
    Promise.all([api.members(room.id), api.userDirectory()]).then(([roomMembers, directory]) => {
      setCurrentMembers(roomMembers)
      setUsers(directory)
    }).catch(() => {
      setCurrentMembers([])
      setUsers([])
    })
  }, [room.id])

  const currentIds = new Set(currentMembers.map((member) => member.userId))
  const query = search.trim().toLowerCase()
  const available = users.filter((user) => user.accountStatus !== 'DISABLED' && !currentIds.has(user.id) && `${user.name} ${user.username}`.toLowerCase().includes(query))
  const owners = currentMembers.filter((member) => member.role === 'OWNER')
  const regularMembers = currentMembers.filter((member) => member.role !== 'OWNER')

  const add = async () => {
    if (selected.length === 0 || busy) return
    setBusy(true)
    let added = 0
    const failures: string[] = []
    for (const m of selected) {
      try {
        await api.addMember(room.id, m.id)
        added++
      } catch (error) {
        const reason = error instanceof ApiError ? error.message : 'Erro inesperado ao adicionar'
        failures.push(`${m.name || m.username}: ${reason}`)
      }
    }
    setBusy(false)
    if (added === 0) {
      notify(failures[0] || 'Nenhum membro foi adicionado. Verifique suas permissões.')
      return
    }
    if (failures.length > 0) {
      notify(`${added} membro(s) adicionado(s). Falhas: ${failures.join(' | ')}`)
    } else {
      notify(`${added} membro(s) adicionado(s)`)
    }
    onClose()
  }

  const toggleOwner = async (member: RoomMember) => {
    if (busyOwnerId) return
    setBusyOwnerId(member.userId)
    try {
      const role = member.role === 'OWNER' ? 'MEMBER' : 'OWNER'
      const updated = await api.updateMemberRole(room.id, member.userId, role)
      setCurrentMembers((prev) => prev.map((x) => (x.userId === updated.userId ? updated : x)))
      notify(role === 'OWNER' ? `${member.name || member.username} agora é proprietário` : `${member.name || member.username} deixou de ser proprietário`)
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Falha ao alterar proprietário')
    } finally {
      setBusyOwnerId(null)
    }
  }

  return (
    <Modal title={`Adicionar membros • ${roomDisplayName(room)}`} onClose={onClose} className="members-modal" overlayClassName="members-modal-overlay">
      <div className="members-modal-body">
      <div className="modal-fields">
        <input autoComplete="off" className="input" placeholder="Pesquisar usuário" value={search} onChange={(event) => setSearch(event.target.value)} />
        <RoomPeopleSection title="Proprietários" tone="owner" members={owners} onToggleOwner={toggleOwner} busyId={busyOwnerId} />
        <RoomPeopleSection title="Membros" tone="member" members={regularMembers} onToggleOwner={toggleOwner} busyId={busyOwnerId} />
        <div className="room-people-section"><button type="button" className="room-people-section-toggle invite-title" aria-expanded={inviteOpen} onClick={() => setInviteOpen((open) => !open)}><span className="nav-chevron">{inviteOpen ? '⌄' : '›'}</span><span>Pessoas para convidar</span></button>{inviteOpen && <div className="picker-list small">{available.length === 0 && <span className="nav-empty">Nenhuma pessoa encontrada</span>}{available.map((user) => <button key={user.id} className={`picker-item ${selected.some((item) => item.id === user.id) ? 'active' : ''}`} onClick={() => setSelected((prev) => prev.some((item) => item.id === user.id) ? prev.filter((item) => item.id !== user.id) : [...prev, user])}><AvatarImage path={userAvatarPath(user.id)} className="mini-avatar" fallback={<span className="mini-avatar">{initials(user.name || user.username)}</span>} alt={user.name || user.username} /><span className="picker-item-text"><strong>{user.name || user.username}</strong><small>@{user.username}</small></span><span className="room-person-badge invite-badge">Convidar</span></button>)}</div>}</div>
      </div>
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={add} disabled={busy || selected.length === 0}>
          {busy ? 'Adicionando…' : `Adicionar (${selected.length})`}
        </button>
      </div>
    </Modal>
  )
}

function MembersModal({ room, onClose }: { room: Room; onClose: () => void }) {
  const [currentMembers, setCurrentMembers] = useState<RoomMember[]>([])

  useEffect(() => {
    api.members(room.id).then(setCurrentMembers).catch(() => setCurrentMembers([]))
  }, [room.id])

  const owners = currentMembers.filter((member) => member.role === 'OWNER')
  const regularMembers = currentMembers.filter((member) => member.role !== 'OWNER')

  return (
    <Modal title={`Membros • ${roomDisplayName(room)}`} onClose={onClose} className="members-modal" overlayClassName="members-modal-overlay">
      <div className="members-modal-body">
      <div className="modal-fields">
        <RoomPeopleSection title="Proprietários" tone="owner" members={owners} />
        <RoomPeopleSection title="Membros" tone="member" members={regularMembers} />
      </div>
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  )
}

function RoomPeopleSection({ title, tone, members, onToggleOwner, busyId }: { title: string; tone: 'owner' | 'member'; members: RoomMember[]; onToggleOwner?: (member: RoomMember) => void; busyId?: string | null }) {
  const [open, setOpen] = useState(true)
  return <div className="room-people-section"><button type="button" className={`room-people-section-toggle ${tone === 'owner' ? 'owner-title' : 'member-title'}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}><span className="nav-chevron">{open ? '⌄' : '›'}</span><span>{title}</span></button>{open && <div className="picker-list small">{members.length === 0 && <span className="nav-empty">Nenhum usuário</span>}{members.map((member) => <div className="picker-item picker-row" key={member.userId}><AvatarImage path={userAvatarPath(member.userId)} className="mini-avatar" fallback={<span className="mini-avatar">{initials(member.name || member.username)}</span>} alt={member.name || member.username} /><span className="picker-item-text"><strong>{member.name || member.username}</strong><small>@{member.username}</small></span><span className={`room-person-badge ${tone === 'owner' ? 'owner-badge' : 'member-badge'}`}>{tone === 'owner' ? 'Proprietário' : 'Membro'}</span>{onToggleOwner && <button type="button" className={`owner-action ${member.role === 'OWNER' ? 'owner-action-remove' : 'owner-action-add'}`} onClick={() => onToggleOwner(member)} disabled={busyId !== null} title={member.role === 'OWNER' ? `Remover ${member.name || member.username} de proprietário` : `Tornar ${member.name || member.username} proprietário`}>{member.role === 'OWNER' ? 'Remover proprietário' : 'Tornar proprietário'}</button>}</div>)}</div>}</div>
}

function RemoveMembersModal({
  room,
  onClose,
  notify,
}: {
  room: Room
  onClose: () => void
  notify: (text: string) => void
}) {
  const [members, setMembers] = useState<RoomMember[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setMembers(await api.members(room.id))
    } catch {
      setMembers([])
    }
  }, [room.id])

  useEffect(() => {
    load()
  }, [load])

  const remove = async (m: RoomMember) => {
    if (busyId) return
    setBusyId(m.userId)
    try {
      await api.removeMember(room.id, m.userId)
      notify(`${m.name || m.username} foi removido(a) da sala`)
      setMembers((prev) => prev.filter((x) => x.userId !== m.userId))
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Falha ao remover membro')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Modal title={`Remover membros • ${roomDisplayName(room)}`} onClose={onClose} className="members-modal" overlayClassName="members-modal-overlay">
      <div className="members-modal-body">
      <div className="picker-list small">
        {members.length === 0 && <span className="nav-empty">Nenhum membro</span>}
        {members.map((m) => (
          <div key={m.userId} className="picker-item picker-row">
            <AvatarImage
              path={userAvatarPath(m.userId)}
              className="mini-avatar"
              fallback={<span className="mini-avatar">{initials(m.name || m.username)}</span>}
              alt={m.name || m.username}
            />
            <span className="picker-item-text">
              <strong>{m.name || m.username}</strong>
              <small>@{m.username}</small>
            </span>
            <button
              type="button"
              className="remove-member-btn"
              onClick={() => remove(m)}
              disabled={busyId !== null}
              title={`Remover ${m.name || m.username}`}
            >
              <IconTrash size={13} />
              <span>{busyId === m.userId ? 'Removendo…' : 'Remover'}</span>
            </button>
          </div>
        ))}
      </div>
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  )
}

function RoomView({
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
}: {
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
  typingUsers?: Record<string, TypingUser>
  onTyping?: (isTyping: boolean) => void
  onBack: () => void
   onSend: (content: string, parentMessageId?: string, attachments?: File[]) => Promise<boolean>
  onInitialPositioned: () => void
  onDelete: (msg: Message) => void
  onMessageUpdated: (message: Message) => void
  onReaction: (message: Message, emoji: string) => void
  onStartDm: (userId: string) => Promise<void>
  notify: (text: string) => void
  readReceiptsEnabled: boolean
  onSearchResult: (message: Message) => void
  onPollUpdated: (message: Message) => void
  onRoomUpdated: (room: Room) => void
  onOpenRoom: (roomId: string) => void
}) {
  const typingText = formatTypingText(typingUsers, room.type === 'DIRECT')
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
  const [filesOpen, setFilesOpen] = useState(false)
  const [roomFiles, setRoomFiles] = useState<RoomFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesError, setFilesError] = useState<string | null>(null)
  const [filesQuery, setFilesQuery] = useState('')
  const [filesType, setFilesType] = useState('ALL')
  const messageListRef = useRef<HTMLDivElement>(null)
  const olderScrollAnchorRef = useRef<{ id: string | null; offset: number; height: number; top: number } | null>(null)
  const scrollToBottomOnLoadRef = useRef(true)
  const forceScrollToBottomRef = useRef(false)
  const mustStayAtBottomRef = useRef(false)
  const wasNearBottomRef = useRef(true)
  const forceBottomIntervalRef = useRef<number | null>(null)
  const forceBottomTimeoutRef = useRef<number | null>(null)
  const forcedBottomRoomRef = useRef<string | null>(null)
  const [loadingPrevious, setLoadingPrevious] = useState(false)
  const [audioResetKey, setAudioResetKey] = useState(0)
  const [audioMode, setAudioMode] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [conversationReady, setConversationReady] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const audioStopRef = useRef<(() => void) | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const roomHeaderMenuRef = useRef<HTMLDivElement>(null)
  const [roomHeaderMenuOpen, setRoomHeaderMenuOpen] = useState(false)
  const readOnlyAccount = me.accountStatus === 'READ_ONLY'
  const isRoomOwner = room.type !== 'DIRECT' && roomMembers.some((member) =>
    member.userId === me.id && member.active && member.role === 'OWNER',
  )
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
    if (!roomHeaderMenuOpen) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (roomHeaderMenuRef.current && !roomHeaderMenuRef.current.contains(e.target as Node)) setRoomHeaderMenuOpen(false)
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
    api.members(room.id)
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
    olderScrollAnchorRef.current = null
    scrollToBottomOnLoadRef.current = true
    forceScrollToBottomRef.current = false
    mustStayAtBottomRef.current = false
    wasNearBottomRef.current = true
    setConversationReady(false)
  }, [room.id])

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [room.id])

  const forceBottomFor500ms = useCallback(() => {
    if (forceBottomIntervalRef.current !== null) window.clearInterval(forceBottomIntervalRef.current)
    if (forceBottomTimeoutRef.current !== null) window.clearTimeout(forceBottomTimeoutRef.current)
    const forceBottom = () => {
      const list = messageListRef.current
      if (list) list.scrollTop = list.scrollHeight
    }
    forceBottom()
    forceBottomIntervalRef.current = window.setInterval(forceBottom, 100)
    forceBottomTimeoutRef.current = window.setTimeout(() => {
      if (forceBottomIntervalRef.current !== null) window.clearInterval(forceBottomIntervalRef.current)
      forceBottomIntervalRef.current = null
      forceBottomTimeoutRef.current = null
    }, 500)
  }, [])

  useEffect(() => () => {
    if (forceBottomIntervalRef.current !== null) window.clearInterval(forceBottomIntervalRef.current)
    if (forceBottomTimeoutRef.current !== null) window.clearTimeout(forceBottomTimeoutRef.current)
  }, [])

  useEffect(() => {
    if (loading || messages.length === 0 || forcedBottomRoomRef.current === room.id) return
    forcedBottomRoomRef.current = room.id
    const frame = requestAnimationFrame(forceBottomFor500ms)
    return () => cancelAnimationFrame(frame)
  }, [forceBottomFor500ms, loading, messages.length, room.id])

  useEffect(() => {
    if (loading || messages.length === 0 || forceScrollRequest === 0) return
    const frame = requestAnimationFrame(forceBottomFor500ms)
    return () => cancelAnimationFrame(frame)
  }, [forceBottomFor500ms, forceScrollRequest, loading, messages.length])

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

    const observeLayout = (onResize: () => void) => {
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize)
      const observed = [container, ...Array.from(container.querySelectorAll('.message'))]
      observed.forEach((element) => observer?.observe(element))
      const media = Array.from(container.querySelectorAll('img, video, audio'))
      media.forEach((element) => {
        element.addEventListener('load', onResize)
        element.addEventListener('error', onResize)
        element.addEventListener('loadeddata', onResize)
      })
      return () => {
        observer?.disconnect()
        media.forEach((element) => {
          element.removeEventListener('load', onResize)
          element.removeEventListener('error', onResize)
          element.removeEventListener('loadeddata', onResize)
        })
      }
    }

    const anchor = olderScrollAnchorRef.current
    if (anchor) {
      const containerRect = container.getBoundingClientRect()
      const restore = () => {
        const anchored = anchor.id
          ? container.querySelector<HTMLElement>(`[data-message-id="${anchor.id}"]`)
          : null
        if (anchored) {
          const anchoredRect = anchored.getBoundingClientRect()
          container.scrollTop += anchoredRect.top - containerRect.top - anchor.offset
        } else {
          container.scrollTop = anchor.top + (container.scrollHeight - anchor.height)
        }
      }
      restore()
      olderScrollAnchorRef.current = null
      setLoadingPrevious(false)
      return observeLayout(restore)
    }

    const scrollToBottom = () => { container.scrollTop = container.scrollHeight }
    const shouldFollow = scrollToBottomOnLoadRef.current || forceScrollToBottomRef.current || wasNearBottomRef.current
    if (!shouldFollow) return
    const openingConversation = scrollToBottomOnLoadRef.current
    const initialOrForced = openingConversation || forceScrollToBottomRef.current
    if (initialOrForced) {
      scrollToBottomOnLoadRef.current = false
      forceScrollToBottomRef.current = false
    }
    let active = true
    if (openingConversation) {
      scrollToBottomOnLoadRef.current = false
      forceScrollToBottomRef.current = false
      const frame = requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight
        setConversationReady(true)
        onInitialPositioned()
      })
      return () => cancelAnimationFrame(frame)
    }
    const media = Array.from(container.querySelectorAll('img, video, audio'))
    mustStayAtBottomRef.current = true
    scrollToBottom()
    const hasPendingMedia = () => media.some((element) => {
      if (element instanceof HTMLImageElement) return !element.complete
      if (element instanceof HTMLMediaElement) return element.readyState < 2
      return false
    })
    let fontsReady = !document.fonts
    const settle = () => {
      if (!mustStayAtBottomRef.current) return
      scrollToBottom()
      if (fontsReady && !hasPendingMedia()) {
        mustStayAtBottomRef.current = false
      }
    }
    const cleanup = observeLayout(settle)
    if (document.fonts) {
      void document.fonts.ready.then(() => {
        if (!active) return
        fontsReady = true
        settle()
      })
    }
    settle()
    const frame = initialOrForced ? requestAnimationFrame(() => { if (active) settle() }) : null
    return () => {
      active = false
      if (frame !== null) cancelAnimationFrame(frame)
      cleanup()
    }
  }, [loading, messages.length, room.id])

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
  }, [room.id, notify])

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

  const jumpToMessage = (messageId: string) => {
    const element = document.querySelector(`[data-message-id="${messageId}"]`)
    if (!element) {
      notify('A mensagem original não está carregada neste trecho')
      return
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedMessageId(messageId)
    window.setTimeout(() => setHighlightedMessageId(null), 2200)
  }

  const searchConversation = async () => {
    const query = searchQuery.trim()
    if (!query || searchLoading) return
    setSearchLoading(true)
    try {
      setSearchResults(await api.searchMessages(room.id, query))
    } catch {
      notify('Não foi possível pesquisar nesta conversa')
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  const openSearchResult = (result: Message) => {
    onSearchResult(result)
    setSearchOpen(false)
    setSearchResults([])
    requestAnimationFrame(() => requestAnimationFrame(() => jumpToMessage(result.id)))
  }

  const canManagePin = room.type !== 'DIRECT' && (isRoomOwner || me.roles.includes('ADMIN'))

  const handlePin = async (message: Message) => {
    try {
      const updated = await api.pinMessage(room.id, message.id)
      onRoomUpdated(updated)
      notify('Mensagem fixada')
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Não foi possível fixar a mensagem')
    }
  }

  const handleUnpin = async () => {
    try {
      const updated = await api.unpinMessage(room.id)
      onRoomUpdated(updated)
      notify('Mensagem desafixada')
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Não foi possível desafixar a mensagem')
    }
  }

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

  const addPendingAttachments = (files: File[]) => {
    if (files.length === 0) return
    setPendingAttachments((current) => {
      const next = [...current]
      for (const file of files) {
        if (next.length >= 10) break
        if (!next.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) next.push(file)
      }
      return next
    })
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
    const sent = await onSend(draft, quotedMessage?.id, pendingAttachments)
    if (!sent) {
      forceScrollToBottomRef.current = false
      return
    }
    setDraft('')
    setPendingAttachments([])
    setCodeBlock(null)
    setQuotedMessage(null)
    setComposerExpanded(false)
    if (sendingAttachments) requestAnimationFrame(forceBottomFor500ms)
  }

  const startEditing = (message: Message) => {
    setEditingMessage(message)
    setDraft(message.content)
    setPendingAttachments([])
    setCodeBlock(null)
    setQuotedMessage(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const cancelEditing = () => {
    stopTyping()
    setEditingMessage(null)
    setDraft('')
    setComposerExpanded(false)
    setCodeBlock(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const showProfile = async (userId: string, event?: React.MouseEvent) => {
    if (event) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      const width = Math.min(460, window.innerWidth - 24)
      setProfilePosition({
        top: Math.min(window.innerHeight - 360, Math.max(12, rect.bottom + 8)),
        left: Math.min(window.innerWidth - width - 12, Math.max(12, rect.left)),
      })
    }
    setProfileLoading(true)
    setProfileCommonRoomsLoading(true)
    const currentRoomIsCommon = room.type !== 'DIRECT' && roomMembers.some((member) => member.userId === userId && member.active)
    setProfileCommonRooms(currentRoomIsCommon ? [room] : [])
    const [profileResult, commonRoomsResult] = await Promise.allSettled([api.userProfile(userId), api.commonRooms(userId)])
    if (profileResult.status === 'fulfilled') setProfile(profileResult.value)
    else { setProfile(null); notify('Não foi possível carregar o perfil') }
    setProfileLoading(false)
    if (commonRoomsResult.status === 'fulfilled') {
      const roomsById = new Map(commonRoomsResult.value.map((commonRoom) => [commonRoom.id, commonRoom]))
      if (currentRoomIsCommon) roomsById.set(room.id, room)
      setProfileCommonRooms([...roomsById.values()])
    }
    setProfileCommonRoomsLoading(false)
  }

  const showRoomInfo = (event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const width = Math.min(560, window.innerWidth - 24)
    setRoomInfoPosition({
      top: Math.max(12, Math.min(window.innerHeight - 420, Math.max(12, rect.bottom + 8))),
      left: Math.min(window.innerWidth - width - 12, Math.max(12, rect.left)),
    })
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
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
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
    const block = '```\n' + (selected || ' ') + '\n```'
    const next = draft.slice(0, start) + block + draft.slice(sel)
    setDraft(next)
    setCodeBlock({ start, end: start + block.length, text: block })
    requestAnimationFrame(() => {
      el?.focus()
      const pos = start + 4
      el?.setSelectionRange(pos, pos + selected.length)
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
    const queryMatches = !filesQuery.trim() || file.originalName.toLowerCase().includes(filesQuery.trim().toLowerCase())
    if (filesType === 'IMAGES') return queryMatches && file.mimeType?.startsWith('image/')
    if (filesType === 'DOCUMENTS') return queryMatches && (file.mimeType?.includes('pdf') || file.mimeType?.includes('document') || file.mimeType?.includes('word') || /\.(pdf|docx?|odt|rtf|txt)$/i.test(file.originalName))
    if (filesType === 'AUDIO') return queryMatches && file.mimeType?.startsWith('audio/')
    if (filesType === 'VIDEO') return queryMatches && file.mimeType?.startsWith('video/')
    return queryMatches
  })

  return (
    <div className={`room-view ${filesOpen ? 'files-open' : ''}`}>
      <div className={`room-header ${searchOpen ? 'room-header-search-mode' : ''}`}>
        {searchOpen ? (
          /* ── Mobile Search Mode: full-bar search ── */
          <div className="room-header-search-bar">
            <button type="button" className="icon-btn room-search-back" onClick={() => { setSearchOpen(false); setSearchResults([]) }} aria-label="Fechar pesquisa">
              <IconArrowLeft size={20} />
            </button>
            <div className="room-search-input-wrap">
              <span className="room-search-icon"><IconSearch size={15} /></span>
              <input
                ref={searchInputRef}
                className="room-search-input"
                value={searchQuery}
                placeholder="Pesquisar nesta conversa…"
                aria-label="Pesquisar nesta conversa"
                autoFocus
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); void searchConversation() }
                  if (event.key === 'Escape') { setSearchOpen(false); setSearchResults([]) }
                }}
              />
              {searchQuery.trim().length > 0 && (
                <button type="button" className="search-clear room-search-clear" onClick={() => { setSearchQuery(''); searchInputRef.current?.focus() }} aria-label="Limpar busca">×</button>
              )}
            </div>
            <button type="button" className="icon-btn room-search-submit" onClick={() => void searchConversation()} disabled={searchLoading} aria-label="Pesquisar">⌕</button>
            {searchResults.length > 0 && <div className="room-search-results">
              {searchResults.map((result) => <button type="button" key={result.id} onClick={() => openSearchResult(result)}>
                <strong>{result.username}</strong>
                <span>{result.content || result.attachment?.originalName || 'Anexo'}</span>
                <small>{new Date(result.createdAt).toLocaleString('pt-BR')}</small>
              </button>)}
            </div>}
            {searchQuery.trim() && !searchLoading && searchResults.length === 0 && <div className="room-search-results room-search-empty">Nenhuma mensagem encontrada.</div>}
          </div>
        ) : (
          /* ── Normal Mode: ← | Title (center) | 🔍 | + ── */
          <>
            <button className="room-back icon-btn" onClick={onBack} aria-label="Voltar à lista">
              ‹
            </button>
            {room.type === 'DIRECT' ? (
              <button type="button" className="direct-header-contact" onClick={(event) => room.directPartner && void showProfile(room.directPartner.userId, event)}>
                <span className="room-header-avatar-wrap">
                  <AvatarImage
                    path={room.directPartner ? userAvatarPath(room.directPartner.userId) : null}
                    className="room-header-avatar"
                    fallback={<div className="room-header-icon">{ROOM_ICON.DIRECT}</div>}
                    alt={roomDisplayName(room)}
                  />
                  {room.directPartner && <span className={`direct-presence-dot presence-${room.directPartner.presenceStatus}`} aria-label={`Status: ${room.directPartner.presenceStatus}`} />}
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
              <button type="button" className="room-header-room-contact" onClick={showRoomInfo} aria-label={`Informações de ${roomDisplayName(room)}`}>
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
              {/* Desktop-only: individual action buttons */}
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
                <button type="button" className={`icon-btn favorite-room-trigger ${room.favorite ? 'active' : ''}`} onClick={() => void api.toggleRoomFavorite(room.id).then((updated) => onRoomUpdated({ ...room, favorite: updated.favorite, directPartner: updated.directPartner ?? room.directPartner })).catch(() => notify('Não foi possível atualizar o favorito'))} title={room.favorite ? 'Remover dos favoritos' : 'Favoritar conversa'} aria-label={room.favorite ? 'Remover dos favoritos' : 'Favoritar conversa'} aria-pressed={room.favorite}>
                  {room.favorite ? '★' : '☆'}
                </button>
                <button type="button" className="icon-btn room-files-trigger" onClick={toggleFiles} title="Arquivos da conversa" aria-label="Arquivos da conversa" aria-pressed={filesOpen}>
                  <IconClip size={18} />
                </button>
              </div>

              {/* Search trigger */}
              <button type="button" className="icon-btn room-search-trigger" onClick={() => { setSearchOpen(true); requestAnimationFrame(() => searchInputRef.current?.focus()) }} title="Pesquisar na conversa" aria-label="Pesquisar na conversa">
                <IconSearch size={17} />
              </button>

              {/* Mobile-only: + dropdown menu with all actions */}
              <div className="room-header-mobile-menu" ref={roomHeaderMenuRef}>
                <button
                  type="button"
                  className={`icon-btn room-header-plus-btn ${roomHeaderMenuOpen ? 'active' : ''}`}
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
                      <button className="room-header-dropdown-item" onClick={() => { setRoomHeaderMenuOpen(false); setEditOpen(true) }}>
                        <IconPencil size={16} />
                        <span>Editar {room.type === 'CHANNEL' ? 'canal' : 'grupo'}</span>
                      </button>
                    )}
                    {canManageRoom && (
                      <button className="room-header-dropdown-item" onClick={() => { setRoomHeaderMenuOpen(false); setAddOpen(true) }}>
                        <PersonIcon size={16} />
                        <span>Adicionar membros</span>
                      </button>
                    )}
                    {canManageRoom && (
                      <button className="room-header-dropdown-item" onClick={() => { setRoomHeaderMenuOpen(false); setRemoveOpen(true) }}>
                        <NoEntryIcon size={18} />
                        <span>Remover membros</span>
                      </button>
                    )}
                    {room.type !== 'DIRECT' && !canManageRoom && isMember && (
                      <button className="room-header-dropdown-item" onClick={() => { setRoomHeaderMenuOpen(false); setMembersOpen(true) }}>
                        <PersonIcon size={16} />
                        <span>Ver membros</span>
                      </button>
                    )}
                    <button className="room-header-dropdown-item" onClick={() => { setRoomHeaderMenuOpen(false); void api.toggleRoomFavorite(room.id).then((updated) => onRoomUpdated({ ...room, favorite: updated.favorite, directPartner: updated.directPartner ?? room.directPartner })).catch(() => notify('Não foi possível atualizar o favorito')) }}>
                      <span aria-hidden="true" style={{ fontSize: '1rem' }}>{room.favorite ? '★' : '☆'}</span>
                      <span>{room.favorite ? 'Remover dos favoritos' : 'Favoritar conversa'}</span>
                    </button>
                    <button className="room-header-dropdown-item" onClick={() => { setRoomHeaderMenuOpen(false); toggleFiles() }}>
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
          <button type="button" className="pinned-message-content" onClick={handleJumpToPinned} title="Ir para a mensagem fixada">
            <span className="pinned-icon" aria-hidden="true">📌</span>
            <div className="pinned-text-wrap">
              <span className="pinned-label">
                Mensagem fixada {room.pinnedMessage.username ? `• ${room.pinnedMessage.username}` : ''}
              </span>
              <span className="pinned-snippet">
                {room.pinnedMessage.content
                  ? room.pinnedMessage.content.replace(/\s+/g, ' ').trim()
                  : room.pinnedMessage.attachment
                  ? (room.pinnedMessage.attachment.originalName || 'Anexo')
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
              onClick={(e) => { e.stopPropagation(); void handleUnpin() }}
              title="Desafixar mensagem"
              aria-label="Desafixar mensagem"
            >
              ×
            </button>
          )}
        </div>
      )}

       <div className={`message-list ${conversationReady ? '' : 'message-list-initializing'}`} data-message-list ref={messageListRef} onScroll={(event) => {
        const container = event.currentTarget
        const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
        wasNearBottomRef.current = nearBottom
        if (!nearBottom) mustStayAtBottomRef.current = false
      }}>
         <div className="message-list-content">
         {loading && <div className="loading-row">Carregando…</div>}
        {hasMore && (
          <button className="btn-link" disabled={loadingPrevious} onClick={async (event) => {
            if (loadingPrevious) return
            event.currentTarget.blur()
            const container = messageListRef.current
            const containerRect = container?.getBoundingClientRect()
            const visibleMessage = container && containerRect
              ? Array.from(container.querySelectorAll<HTMLElement>('[data-message-id]')).find((element) => element.getBoundingClientRect().bottom > containerRect.top)
              : null
            const visibleRect = visibleMessage?.getBoundingClientRect()
            olderScrollAnchorRef.current = {
              id: visibleMessage?.dataset.messageId ?? null,
              offset: visibleRect && containerRect ? visibleRect.top - containerRect.top : 0,
              height: container?.scrollHeight ?? 0,
              top: container?.scrollTop ?? 0,
            }
            setLoadingPrevious(true)
            await loadMore()
            requestAnimationFrame(() => {
              if (olderScrollAnchorRef.current && container) {
                const anchor = olderScrollAnchorRef.current
                container.scrollTop = container.scrollHeight - anchor.height + anchor.top
                olderScrollAnchorRef.current = null
              }
              setLoadingPrevious(false)
            })
          }}>
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
                canWrite={!readOnlyAccount}
                 onDelete={onDelete}
                 onEdit={startEditing}
                onShowProfile={(event) => m.userId && void showProfile(m.userId, event)}
                onQuote={() => {
                  setQuotedMessage(m)
                  requestAnimationFrame(() => inputRef.current?.focus())
                }}
                onForward={() => setForwardMessage(m)}
                onRespond={canRespondToReport && m.userId !== me.id ? () => setRespondMessage(m) : undefined}
                onReaction={(emoji) => onReaction(m, emoji)}
                actionPinned={pinnedActionId === m.id}
                onPinAction={(pinned) => setPinnedActionId(pinned ? m.id : null)}
                highlighted={highlightedMessageId === m.id}
                onJumpToQuoted={jumpToMessage}
                readReceiptsEnabled={readReceiptsEnabled}
                onShowReads={() => setReadMessageId(m.id)}
                onVotePoll={(optionId) => void (m.poll && onPollUpdated && api.votePoll(m.poll.id, optionId).then(onPollUpdated).catch(() => notify('Não foi possível registrar o voto')))}
                canPin={canManagePin}
                isPinned={room.pinnedMessage?.id === m.id}
                onTogglePin={() => {
                  if (room.pinnedMessage?.id === m.id) {
                    void handleUnpin()
                  } else {
                    void handlePin(m)
                  }
                }}
              />
         ))}
          </div>
         ))}
         </div>
       </div>

       {canWriteInRoom ? (
        <div className={`composer ${readOnlyAccount ? 'account-read-only' : ''}`} data-composer>
         {readOnlyAccount && <div className="account-read-only-message"><strong>Modo somente leitura</strong><span>Você pode consultar esta conversa, mas não enviar mensagens.</span></div>}
         <ComposerPendingAttachments files={pendingAttachments} urls={pendingAttachmentUrls} onRemove={(index) => setPendingAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
        {quotedMessage && <div className="quote-preview"><div><strong>Respondendo a {quotedMessage.username || 'usuário'}</strong><span>{quotedMessage.content || 'Anexo'}</span></div><button type="button" onClick={() => setQuotedMessage(null)} aria-label="Desvincular citação">×</button></div>}
         {audioMode && <div className="audio-recording-bar" role="status" aria-live="polite">
           <span className="audio-recording-label"><span className="audio-recording-indicator" aria-hidden="true" />Gravando áudio</span>
           <time className="audio-recording-time" dateTime={`PT${recordingSeconds}S`}>{formatRecordingTime(recordingSeconds)}</time>
           <button type="button" className="audio-recording-stop" onClick={() => audioStopRef.current?.()}>
             <IconStop size={15} /> <span>Parar</span>
           </button>
         </div>}
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
             className={`composer-input ${composerExpanded ? 'composer-input-expanded' : ''} ${codeBlock ? 'composer-input-code' : ''}`}
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
               if (e.key === 'Enter' && !e.shiftKey) {
                 e.preventDefault()
                 submit()
               } else if (e.key === 'Enter' && e.shiftKey) {
                 setComposerExpanded(true)
               }
            }}
            onFocus={() => {
              if (window.visualViewport) {
                window.scrollTo(0, 0)
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
                  <span className="mini-avatar">{initials(member.name || member.username)}</span>
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
            onAttach={() => fileInputRef.current?.click()}
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
            disabled={muted}
            title="Anexar arquivo"
          >
            <IconClip size={15} />
            <span>Anexar</span>
          </button>
            <AudioRecordButton resetKey={audioResetKey} onStopReady={(stop) => { audioStopRef.current = stop }} onRecordingChange={onRecordingChange} onDone={(file) => { addPendingAttachments([file]); setAudioMode(false) }} onError={notify} disabled={muted} />
          {(room.type === 'PRIVATE_GROUP' || room.type === 'PUBLIC_GROUP' || room.type === 'CHANNEL') && canWriteInRoom && <button type="button" className="composer-action poll-action" onClick={() => setPollOpen(true)} title="Criar enquete"><span aria-hidden="true">▣</span><span>Enquete</span></button>}
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
          {editingMessage && <button type="button" className="composer-action" onClick={cancelEditing} disabled={muted} title="Cancelar edição">Cancelar edição</button>}
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

      {filesOpen && <RoomFilesPanel files={visibleFiles} loading={filesLoading} error={filesError} query={filesQuery} type={filesType} onQueryChange={setFilesQuery} onTypeChange={setFilesType} onClose={() => setFilesOpen(false)} onRetry={() => void loadRoomFiles()} />}

      {addOpen && (
        <AddMembersModal room={room} onClose={() => setAddOpen(false)} notify={notify} />
      )}
      {membersOpen && (
        <MembersModal room={room} onClose={() => setMembersOpen(false)} />
      )}
      {removeOpen && (
        <RemoveMembersModal room={room} onClose={() => setRemoveOpen(false)} notify={notify} />
      )}
      {editOpen && (
        <RoomEditModal
          room={room}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => { onRoomUpdated(updated); setEditOpen(false) }}
          notify={notify}
        />
      )}
      {readMessageId && (() => {
        const readMessage = messages.find((message) => message.id === readMessageId)
        return readMessage ? <ReadReceiptsModal message={readMessage} onClose={() => setReadMessageId(null)} /> : null
      })()}
      {(profileLoading || profile) && <UserProfileCard profile={profile} loading={profileLoading} commonRooms={profileCommonRooms} commonRoomsLoading={profileCommonRoomsLoading} position={profilePosition} onClose={() => setProfile(null)} onContact={profile ? () => { setProfile(null); void onStartDm(profile.id) } : undefined} onOpenRoom={(roomId) => { setProfile(null); void onOpenRoom(roomId) }} />}
      {roomInfoOpen && room.type !== 'DIRECT' && <RoomInfoCard room={room} members={roomMembers} position={roomInfoPosition} onClose={() => setRoomInfoOpen(false)} />}
      {forwardMessage && <ForwardMessageModal message={forwardMessage} rooms={rooms} onClose={() => setForwardMessage(null)} notify={notify} />}
      {respondMessage && <RespondToReportModal message={respondMessage} onClose={() => setRespondMessage(null)} onResponded={() => setRespondMessage(null)} notify={notify} />}
      {pollOpen && <CreatePollModal roomId={room.id} onClose={() => setPollOpen(false)} onCreated={(message) => { onPollUpdated(message); setPollOpen(false) }} notify={notify} />}
    </div>
  )
}

function RoomEditModal({ room, onClose, onSaved, notify }: {
  room: Room
  onClose: () => void
  onSaved: (room: Room) => void
  notify: (text: string) => void
}) {
  const [name, setName] = useState(roomDisplayName(room))
  const [avatar, setAvatar] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const pickAvatar = (file: File | null) => {
    if (file && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      notify('Selecione uma imagem PNG, JPG, JPEG ou WEBP')
      return
    }
    if (file && file.size > 5 * 1024 * 1024) {
      notify('A imagem deve ter no máximo 5 MB')
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setAvatar(file)
    setPreview(file ? URL.createObjectURL(file) : null)
  }

  const save = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      let updated = name.trim() !== roomDisplayName(room) ? await api.updateRoom(room.id, name.trim()) : room
      if (avatar) updated = await api.uploadRoomAvatar(room.id, avatar)
      onSaved(updated)
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Falha ao atualizar sala')
    } finally {
      setBusy(false)
    }
  }

   const title = 'Editar grupo'
  return (
    <Modal title={title} onClose={onClose}>
      <div className="modal-fields">
        <label className="field-label">
          Nome
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={160} />
        </label>
        <div className="room-edit-avatar-preview">
          <AvatarImage
            path={`${roomAvatarPath(room.id)}?v=${encodeURIComponent(room.updatedAt)}`}
            className="edit-room-avatar"
            fallback={<span className="edit-room-avatar room-header-icon">{getRoomIcon(room)}</span>}
            alt={roomDisplayName(room)}
          />
          {preview && <img src={preview} className="edit-room-avatar" alt="Prévia da nova imagem" />}
        </div>
        <label className="field-label">
          Foto
          <input className="input" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={(event) => pickAvatar(event.target.files?.[0] || null)} />
          <small className="modal-hint">PNG, JPG, JPEG ou WEBP. Máximo de 5 MB.</small>
        </label>
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={() => void save()} disabled={busy || !name.trim()}>{busy ? 'Salvando…' : 'Salvar alterações'}</button>
      </div>
    </Modal>
  )
}

function ComposerPendingAttachments({ files, urls, onRemove }: { files: File[]; urls: string[]; onRemove: (index: number) => void }) {
  if (files.length === 0) return null
  const hasImage = files.some((file) => file.type.startsWith('image/'))
  return (
    <div className={`composer-pending-attachments ${hasImage ? 'has-image' : ''}`} data-composer-pending-attachments aria-label="Anexos pendentes">
      {files.map((file, index) => {
        const image = file.type.startsWith('image/') && urls[index]
        return image ? (
          <div className="composer-pending-attachment composer-pending-image" key={`${file.name}-${file.lastModified}-${index}`}>
            <div className="composer-pending-preview">
              <img src={urls[index]} alt={`Prévia de ${file.name}`} />
            </div>
            <span className="composer-pending-name" title={file.name}>{file.name}</span>
            <button className="composer-pending-remove" type="button" onClick={() => onRemove(index)} aria-label={`Remover ${file.name}`}>×</button>
          </div>
        ) : (
          <div className="composer-pending-attachment composer-pending-file" key={`${file.name}-${file.lastModified}-${index}`}>
            <span className="composer-pending-icon" aria-hidden="true">📎</span>
            <span className="composer-pending-details" title={file.name}><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span>
            <button className="composer-pending-remove" type="button" onClick={() => onRemove(index)} aria-label={`Remover ${file.name}`}>×</button>
          </div>
        )
      })}
    </div>
  )
}

function MessageRow({
  msg,
  isMine,
  currentUsername,
  myAvatarVersion,
  canWrite,
  onDelete,
  onEdit,
  onShowProfile,
  onQuote,
  onForward,
  onReaction,
  onRespond,
  actionPinned,
  onPinAction,
  highlighted,
  onJumpToQuoted,
  readReceiptsEnabled,
  onShowReads,
  onVotePoll,
  canPin,
  isPinned,
  onTogglePin,
}: {
  msg: Message
  isMine: boolean
  currentUsername: string
  myAvatarVersion: string
  canWrite: boolean
  onDelete: (msg: Message) => void
  onEdit: (message: Message) => void
  onShowProfile: (event?: React.MouseEvent) => void
  onQuote: () => void
  onForward: () => void
  onReaction: (emoji: string) => void
  onRespond?: () => void
  actionPinned: boolean
  onPinAction: (pinned: boolean) => void
  highlighted: boolean
  onJumpToQuoted: (messageId: string) => void
  readReceiptsEnabled: boolean
  onShowReads: () => void
  onVotePoll: (optionId: string) => void
  canPin?: boolean
  isPinned?: boolean
  onTogglePin?: () => void
}) {
  const deleted = !!msg.deletedAt
  const [actionDismissed, setActionDismissed] = useState(false)
  const [reactionDetailsEmoji, setReactionDetailsEmoji] = useState<string | null>(null)
  if (msg.messageType === 'SYSTEM') {
    return <div data-message-id={msg.id} className="system-line">{renderMarkdown(msg.content)}</div>
  }
  return (
    <div data-message-id={msg.id} onMouseEnter={() => setActionDismissed(false)} className={`message ${isMine ? 'mine' : ''} ${deleted ? 'deleted' : ''} ${actionPinned ? 'action-pinned' : ''} ${actionDismissed ? 'action-dismissed' : ''} ${highlighted ? 'message-highlighted' : ''}`}>
      {!deleted && (
        <button type="button" className="message-avatar-button" onClick={onShowProfile} aria-label={`Abrir contato de ${msg.username || 'usuário'}`}>
          <AvatarImage
            path={msg.userId ? `${userAvatarPath(msg.userId)}${isMine ? `?v=${encodeURIComponent(myAvatarVersion)}` : ''}` : null}
            className="msg-avatar"
            fallback={<span className="msg-avatar">{initials(msg.username || 'sistema')}</span>}
            alt={msg.username || 'sistema'}
          />
        </button>
      )}
      <div className="message-body">
        {msg.forwardedFromUsername && <span className="forwarded-label">Encaminhada</span>}
        <div className="message-meta">
          {isMine && <span className="message-time">{formatTime(msg.createdAt)}</span>}
          {deleted ? <span className="message-author">Mensagem excluída</span> : <span className={`message-author-wrap ${msg.forwardedFromUsername ? 'forwarded-author' : ''}`}>{isMine && <>{msg.roles?.includes('ADMIN') && <RoleBadge type="admin" />}{msg.roles?.includes('OWNER') && <RoleBadge type="owner" />}</>}<button type="button" className="message-author message-author-button" onClick={onShowProfile}>{msg.username || 'sistema'}</button>{!isMine && <>{msg.roles?.includes('ADMIN') && <RoleBadge type="admin" />}{msg.roles?.includes('OWNER') && <RoleBadge type="owner" />}</>}</span>}
          {!isMine && <span className="message-time">{formatTime(msg.createdAt)}</span>}
          {isPinned && !deleted && <span className="message-pinned-badge" title="Mensagem fixada">📌 Fixada</span>}
          {msg.editedAt && !deleted && <em className="message-edited">Editada</em>}
          {isMine && readReceiptsEnabled && !deleted && (
            <button type="button" className={`message-read-state ${msg.readBy?.length ? 'read' : 'unread'}`} onClick={onShowReads}>
              {msg.readBy?.length ? `✓✓ ${msg.readBy.length}` : '✓'}
            </button>
          )}
        </div>
        {!deleted && canWrite && (
          <MessageActionBar
            pinned={actionPinned}
            onPin={onPinAction}
            onQuote={onQuote}
            onForward={onForward}
            onEdit={isMine && !msg.forwardedFromUsername && !!msg.content && !msg.attachment && !msg.poll ? () => onEdit(msg) : undefined}
            onEmoji={(emoji) => { setActionDismissed(true); onReaction(emoji) }}
            onRespond={onRespond}
            canPin={canPin}
            isPinned={isPinned}
            onTogglePin={onTogglePin}
          />
        )}
        {!deleted && (
          <>
            {msg.quotedMessage && <button type="button" className="quoted-message" onClick={() => onJumpToQuoted(msg.quotedMessage!.id)}><strong>{msg.quotedMessage.username}</strong><span>{msg.quotedMessage.content || 'Anexo'}</span></button>}
            {msg.attachment && <AttachmentView msg={msg} />}
            {msg.poll && <PollCard poll={msg.poll} disabled={!canWrite} onVote={onVotePoll} />}
             {!msg.poll && msg.content && <div className="message-content">{renderMessageContent(msg.content, currentUsername)}</div>}
             {msg.reactions?.length > 0 && <div className="message-reactions">{Object.entries(msg.reactions.reduce<Record<string, MessageReaction[]>>((groups, reaction) => ({ ...groups, [reaction.emoji]: [...(groups[reaction.emoji] ?? []), reaction] }), {})).map(([emoji, reactions]) => <button type="button" className="message-reaction" key={emoji} title={reactions.map((reaction) => reaction.username).join(', ')} onClick={() => setReactionDetailsEmoji(emoji)}>{emoji} {reactions.length}</button>)}</div>}
             {reactionDetailsEmoji && <ReactionUsersModal emoji={reactionDetailsEmoji} reactions={(msg.reactions ?? []).filter((reaction) => reaction.emoji === reactionDetailsEmoji)} onClose={() => setReactionDetailsEmoji(null)} />}
          </>
        )}
        {isMine && canWrite && !deleted && msg.messageType !== 'SYSTEM' && (
          <button className="message-delete" onClick={() => onDelete(msg)} title="Excluir mensagem">
            Excluir
          </button>
        )}
      </div>
    </div>
  )
}

function MessageActionBar({
  pinned,
  onPin,
  onQuote,
  onForward,
  onEdit,
  onEmoji,
  onRespond,
  canPin,
  isPinned,
  onTogglePin,
}: {
  pinned: boolean
  onPin: (pinned: boolean) => void
  onQuote: () => void
  onForward: () => void
  onEdit?: () => void
  onEmoji: (emoji: string) => void
  onRespond?: () => void
  canPin?: boolean
  isPinned?: boolean
  onTogglePin?: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useEffect(() => { if (!pinned) setOpen(false) }, [pinned])
  useEffect(() => {
    if (!pinned) return
    const handle = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current && !ref.current.contains(target) && !menuRef.current?.contains(target)) {
        onPin(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [pinned, onPin])
  useEffect(() => {
    if (!open || !btnRef.current) { setPos(null); return }
    const update = () => {
      if (!btnRef.current) return
      const r = btnRef.current.getBoundingClientRect()
      const pickerH = 420
      const pickerW = 352
      let top = r.top
      if (top + pickerH > window.innerHeight) {
        top = Math.max(8, r.bottom - pickerH)
      }
      let left = r.right + 8
      if (left + pickerW > window.innerWidth) {
        left = Math.max(8, r.left - pickerW)
      }
      setPos({ left, top })
    }
    update()
    const onScroll = () => update()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll) }
  }, [open])
  return (
    <div className="message-actions" ref={ref}>
      <div className="message-emoji-action">
        <button ref={btnRef} type="button" title="Emoji" onClick={() => { onPin(true); setOpen((value) => !value) }}>😊</button>
        {open && pos && createPortal(
          <div ref={menuRef} className="message-emoji-menu message-emoji-menu-portal" style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 10000 }}>
            <Picker data={data} onEmojiSelect={(emoji: EmojiSelection) => { if (emoji.native) onEmoji(emoji.native); setOpen(false); setPos(null); onPin(false) }} previewPosition="none" skinTonePosition="none" />
          </div>,
          document.body,
        )}
      </div>
      {canPin && onTogglePin && (
        <button
          type="button"
          className={`message-action-pin ${isPinned ? 'active' : ''}`}
          title={isPinned ? 'Desafixar mensagem' : 'Fixar mensagem'}
          aria-label={isPinned ? 'Desafixar mensagem' : 'Fixar mensagem'}
          onClick={() => { onPin(false); onTogglePin() }}
        >
          📌
        </button>
      )}
      {onRespond && <button type="button" className="message-action-respond" title="Responder ao usuário" onClick={() => { onPin(false); onRespond() }}>🗪</button>}
      {onEdit && <button type="button" title="Editar mensagem" onClick={() => { onPin(false); onEdit() }}>✎</button>}
      <button type="button" className="message-action-quote" title="Citar mensagem" onClick={() => { onPin(false); onQuote() }}>❝</button>
      <button type="button" title="Encaminhar mensagem" onClick={() => { onPin(false); onForward() }}>➜</button>
    </div>
  )
}

function CreatePollModal({ roomId, onClose, onCreated, notify }: { roomId: string; onClose: () => void; onCreated: (message: Message) => void; notify: (text: string) => void }) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const cleaned = options.map((option) => option.trim()).filter(Boolean)
    if (!question.trim() || cleaned.length < 2 || busy) {
      notify('Informe a pergunta e pelo menos duas opções')
      return
    }
    setBusy(true)
    try {
      onCreated(await api.createPoll(roomId, { question: question.trim(), options: cleaned, allowMultiple }))
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Não foi possível criar a enquete')
    } finally {
      setBusy(false)
    }
  }

  return <Modal title="Nova enquete" onClose={onClose}>
    <div className="modal-fields">
      <label className="field-label">Pergunta<input className="input" autoFocus maxLength={500} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Qual é a sua pergunta?" /></label>
      {options.map((option, index) => <div className="poll-option-input" key={index}><label className="field-label">Opção {index + 1}<input className="input" maxLength={255} value={option} onChange={(event) => setOptions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /></label>{options.length > 2 && <button type="button" className="btn-ghost" onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remover opção ${index + 1}`}>×</button>}</div>)}
      {options.length < 10 && <button type="button" className="btn-ghost poll-add-option" onClick={() => setOptions((current) => [...current, ''])}>+ Adicionar opção</button>}
      <label className="admin-check"><input type="checkbox" checked={allowMultiple} onChange={(event) => setAllowMultiple(event.target.checked)} /> Permitir escolher mais de uma opção</label>
    </div>
    <div className="modal-actions"><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={() => void submit()}>{busy ? 'Criando...' : 'Criar enquete'}</button></div>
  </Modal>
}

function PollCard({ poll, disabled, onVote }: { poll: NonNullable<Message['poll']>; disabled: boolean; onVote: (optionId: string) => void }) {
  const totalVotes = poll.options.reduce((sum, option) => sum + option.votes, 0)
  const [resultsOpen, setResultsOpen] = useState(false)
  return <>
    <div className="poll-card"><strong className="poll-question">{poll.question}</strong><small className="poll-hint">{poll.allowMultiple ? 'Escolha uma ou mais opções' : 'Escolha uma opção'}</small><div className="poll-options">{poll.options.map((option) => {
    const percentage = totalVotes ? Math.round((option.votes / totalVotes) * 100) : 0
    return <button type="button" key={option.id} className={`poll-option ${option.selected ? 'selected' : ''}`} disabled={disabled} onClick={() => onVote(option.id)}><span className="poll-option-top"><span>{option.selected ? '✓ ' : ''}{option.label}</span><b>{percentage}%</b></span><span className="poll-progress"><span style={{ width: `${percentage}%` }} /></span><small>{option.votes} voto{option.votes === 1 ? '' : 's'}</small></button>
  })}</div><div className="poll-total-votes">{totalVotes} voto{totalVotes === 1 ? '' : 's'}</div><button type="button" className="poll-results-button" onClick={() => setResultsOpen(true)}>Resultado</button></div>
    {resultsOpen && <PollResultsModal poll={poll} onClose={() => setResultsOpen(false)} />}
  </>
}

function PollResultsModal({ poll, onClose }: { poll: NonNullable<Message['poll']>; onClose: () => void }) {
  return <Modal title="Dados da enquete" onClose={onClose} className="poll-results-modal">
    <div className="poll-results-content"><strong className="poll-results-question">{poll.question}</strong><span className="poll-results-summary">{poll.totalVoters} de {poll.totalMembers} membro{poll.totalMembers === 1 ? '' : 's'} votaram</span>
      <div className="poll-results-options">{poll.options.map((option) => <section className="poll-results-option" key={option.id}><div className="poll-results-option-head"><strong>{option.label}</strong><span>{option.votes} voto{option.votes === 1 ? '' : 's'}</span></div>{option.voters.length === 0 ? <small className="poll-no-votes">Nenhum voto</small> : <div className="poll-voters">{option.voters.map((voter) => <div className="poll-voter" key={`${option.id}-${voter.userId}`}><AvatarImage path={userAvatarPath(voter.userId)} className="poll-voter-avatar" fallback={<span className="poll-voter-avatar">{initials(voter.name || voter.username)}</span>} alt={voter.name || voter.username} /><div><strong>{voter.name || voter.username}</strong><small>{formatPollVoteTime(voter.votedAt)}</small></div></div>)}</div>}</section>)}</div>
    </div>
  </Modal>
}

function formatPollVoteTime(iso: string | null): string {
  if (!iso) return 'Data do voto não disponível'
  const date = new Date(iso)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay ? `Hoje às ${formatTime(iso)}` : `${date.toLocaleDateString('pt-BR')} às ${formatTime(iso)}`
}

function usePopoverDismiss(cardRef: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [cardRef, onClose])
}

function UserProfileCard({ profile, loading, commonRooms, commonRoomsLoading, position, onClose, onContact, onOpenRoom }: { profile: PublicProfile | null; loading: boolean; commonRooms: Room[]; commonRoomsLoading: boolean; position: { top: number; left: number }; onClose: () => void; onContact?: () => void; onOpenRoom?: (roomId: string) => void }) {
  const cardRef = useRef<HTMLDivElement>(null)
  usePopoverDismiss(cardRef, onClose)

  return <div ref={cardRef} className="user-profile-card" style={{ top: position.top, left: position.left }} role="dialog" aria-label="Contato do usuário">
    <button type="button" className="user-profile-close" onClick={onClose} aria-label="Fechar">×</button>
    {loading && <div className="profile-loading">Carregando...</div>}
    {!loading && profile && <div className="profile-content">
      <span className="profile-avatar-wrap"><AvatarImage path={`${userAvatarPath(profile.id)}?profile=${encodeURIComponent(profile.id)}`} className="profile-avatar" fallback={<span className="profile-avatar">{initials(profile.name || profile.username)}</span>} alt={profile.name} /><span className={`profile-presence-dot presence-${profile.presenceStatus}`} aria-label={`Status: ${presenceLabel(profile.presenceStatus)}`} /></span>
      <div className="profile-details">
        <strong className="profile-name">{profile.name || profile.username}</strong>
        <div className="profile-info-table">
          <div className="profile-info-row"><span>Username</span><strong>@{profile.username}</strong></div>
          <div className="profile-info-row"><span>Email</span><strong>{profile.email || 'E-mail não informado'}</strong></div>
          <div className="profile-info-row"><span>Status</span><strong className={`profile-status presence-${profile.presenceStatus}`}>{presenceLabel(profile.presenceStatus)}</strong></div>
        </div>
        <section className="profile-common-rooms" aria-label="Grupos e canais em comum">
          <strong>Grupos e canais em comum</strong>
          {commonRoomsLoading && <span className="profile-common-rooms-empty">Carregando...</span>}
          {!commonRoomsLoading && commonRooms.length === 0 && <span className="profile-common-rooms-empty">Nenhum grupo ou canal em comum.</span>}
          {!commonRoomsLoading && commonRooms.length > 0 && <div className="profile-common-rooms-list">{commonRooms.map((room) => <button type="button" key={room.id} className="profile-common-room" title={`Abrir ${room.type === 'CHANNEL' ? 'canal' : 'grupo'} ${room.displayName || room.name}`} aria-label={`Abrir ${room.type === 'CHANNEL' ? 'canal' : 'grupo'} ${room.displayName || room.name}`} disabled={!onOpenRoom} onClick={() => onOpenRoom && onOpenRoom(room.id)}><b>{room.type === 'CHANNEL' ? '#' : '🔒'}</b>{room.displayName || room.name}</button>)}</div>}
        </section>
        {onContact && <button type="button" className="profile-contact-button" onClick={onContact} title="Conversar com este usuário" aria-label="Conversar com este usuário"><MessageCircleIcon /></button>}
      </div>
    </div>}
  </div>
}

function RoomInfoCard({ room, members, position, onClose }: {
  room: Room
  members: RoomMember[]
  position: { top: number; left: number }
  onClose: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  usePopoverDismiss(cardRef, onClose)
  const activeMembers = members.filter((member) => member.active)
  const owners = activeMembers.filter((member) => member.role.toUpperCase() === 'OWNER')
  const name = roomDisplayName(room)

  return <div ref={cardRef} className="user-profile-card room-info-card" style={{ top: position.top, left: position.left }} role="dialog" aria-label={`Informações de ${name}`}>
    <button type="button" className="user-profile-close" onClick={onClose} aria-label="Fechar">×</button>
    <div className="profile-content room-info-content">
      <AvatarImage
        path={`${roomAvatarPath(room.id)}?v=${encodeURIComponent(room.updatedAt)}`}
        className="profile-avatar"
        fallback={<span className="profile-avatar room-info-fallback">{getRoomIcon(room)}</span>}
        alt={name}
      />
      <div className="profile-details">
        <strong className="profile-name">{name}</strong>
        <div className="profile-info-table">
          <div className="profile-info-row"><span>Participantes</span><strong>{activeMembers.length} participante{activeMembers.length === 1 ? '' : 's'}</strong></div>
        </div>
      </div>
      <section className="room-info-owners">
        <h4>Proprietários</h4>
        {owners.length === 0 && <span className="room-info-empty">Nenhum proprietário definido.</span>}
        {owners.map((owner) => <div className="room-info-owner" key={owner.userId}>
          <AvatarImage path={`${userAvatarPath(owner.userId)}?v=${encodeURIComponent(owner.joinedAt)}`} className="room-info-owner-avatar" fallback={<span className="room-info-owner-avatar">{initials(owner.name || owner.username)}</span>} alt={owner.name || owner.username} />
          <strong>{owner.name || owner.username}</strong>
        </div>)}
      </section>
    </div>
  </div>
}

function MessageCircleIcon() {
  return <svg className="message-circle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 8.7 8.7 0 0 1-4-.9L3 20l1-4.4A8.4 8.4 0 0 1 3 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5Z" />
    <path d="M8 12h.01M12 12h.01M16 12h.01" />
  </svg>
}

function ForwardMessageModal({ message, rooms, onClose, notify }: { message: Message; rooms: Room[]; onClose: () => void; notify: (text: string) => void }) {
  useEscapeClose(onClose)
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.userDirectory().then(setUsers).catch(() => setUsers([])) }, [])
  const normalizedQuery = query.trim().toLowerCase()
  const candidates = [
    ...users
      .filter((user) => `${user.name} ${user.username}`.toLowerCase().includes(normalizedQuery))
      .map((user) => ({ type: 'user' as const, id: user.id, name: user.name || user.username, subtitle: `@${user.username}`, user })),
    ...rooms
      .filter((room) => room.type === 'CHANNEL' || room.type === 'PRIVATE_GROUP' || room.type === 'PUBLIC_GROUP')
      .filter((room) => `${roomDisplayName(room)} ${room.name}`.toLowerCase().includes(normalizedQuery))
      .map((room) => ({ type: 'room' as const, id: room.id, name: roomDisplayName(room), subtitle: room.type === 'CHANNEL' ? 'Canal' : 'Grupo', room })),
  ].slice(0, 20)
  const forward = async (destination: (typeof candidates)[number]) => {
    setBusy(true)
    try {
      const roomId = destination.type === 'user' ? (await api.createDm(destination.id)).id : destination.id
      await api.sendMessage(roomId, message.content || `Anexo encaminhado: ${message.attachment?.originalName || 'arquivo'}`, undefined, message.id)
      notify(`Mensagem encaminhada para ${destination.name}`)
      onClose()
    } catch (error) { notify(error instanceof ApiError ? error.message : 'Falha ao encaminhar mensagem') }
    finally { setBusy(false) }
  }
  return <div className="admin-modal-overlay"><div className="admin-modal"><div className="modal-head"><h3>Encaminhar mensagem</h3><button className="modal-close" onClick={onClose}>×</button></div><input autoComplete="off" className="input" placeholder="Pesquisar pessoa, grupo ou canal" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="forward-list">{candidates.map((destination) => <button type="button" className="forward-user" disabled={busy} key={`${destination.type}-${destination.id}`} onClick={() => void forward(destination)}>{destination.type === 'user' ? <AvatarImage path={userAvatarPath(destination.id)} className="admin-member-avatar" fallback={<span className="admin-member-avatar">{initials(destination.name)}</span>} alt={destination.name} /> : <span className="admin-member-avatar forward-room-icon" aria-hidden="true">{ROOM_ICON[destination.room.type] ?? '#'}</span>}<span><strong>{destination.name}</strong><small>{destination.subtitle}</small></span></button>)}</div></div></div>
}

function RespondToReportModal({ message, onClose, onResponded, notify }: { message: Message; onClose: () => void; onResponded: () => void; notify: (text: string) => void }) {
  useEscapeClose(onClose)
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || [])
    setFiles((prev) => [...prev, ...selectedFiles])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const submit = async () => {
    if (busy || (!content.trim() && files.length === 0)) return
    setBusy(true)
    try {
      await api.respondToReport(message.id, content.trim(), files.length > 0 ? files : undefined)
      notify('Resposta enviada por mensagem direta ao usuário')
      onResponded()
      onClose()
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Falha ao enviar resposta')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal">
        <div className="modal-head">
          <h3>Responder ao relato</h3>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <div className="modal-fields">
          <div className="report-original-message">
            <strong>Relato original de {message.username || 'usuário'}:</strong>
            <span>{message.content || 'Anexo'}</span>
          </div>
          <label className="admin-label">
            Sua resposta (será enviada por DM)
            <textarea
              className="input"
              style={{ minHeight: '100px', resize: 'vertical', fontFamily: 'inherit', padding: '8px' }}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Digite a resposta ao relato..."
              maxLength={2000}
            />
          </label>
          <div className="report-attachments">
            <input
              type="file"
              ref={fileInputRef}
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              accept="image/*,.pdf,.doc,.docx,.txt,.zip,.rar"
            />
            <button
              type="button"
              className="btn-ghost report-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              Anexar arquivo
            </button>
            {files.length > 0 && (
              <div className="report-file-list">
                {files.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="report-file-item">
                    <span className="report-file-name">{file.name}</span>
                    <button
                      type="button"
                      className="report-file-remove"
                      onClick={() => removeFile(index)}
                      disabled={busy}
                      aria-label={`Remover ${file.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn-primary" disabled={busy || (!content.trim() && files.length === 0)} onClick={submit}>
            {busy ? 'Enviando...' : 'Enviar resposta'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RoomFilesPanel({ files, loading, error, query, type, onQueryChange, onTypeChange, onClose, onRetry }: {
  files: RoomFile[]
  loading: boolean
  error: string | null
  query: string
  type: string
  onQueryChange: (value: string) => void
  onTypeChange: (value: string) => void
  onClose: () => void
  onRetry: () => void
}) {
  return (
    <aside className="room-files-panel" aria-label="Arquivos da conversa">
      <div className="room-files-head">
        <h3><IconClip size={18} /> Arquivos</h3>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar arquivos">×</button>
      </div>
      <div className="room-files-filters">
        <input className="input" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Pesquisar arquivos" aria-label="Pesquisar arquivos" />
        <select className="input" value={type} onChange={(event) => onTypeChange(event.target.value)} aria-label="Filtrar arquivos por tipo">
          <option value="ALL">Todos</option>
          <option value="IMAGES">Imagens</option>
          <option value="DOCUMENTS">Documentos</option>
          <option value="AUDIO">Áudios</option>
          <option value="VIDEO">Vídeos</option>
        </select>
      </div>
      <div className="room-files-list">
        {loading && <div className="room-files-empty">Carregando arquivos…</div>}
        {!loading && error && <div className="room-files-empty room-files-error"><span>{error}</span><button type="button" className="btn-link" onClick={onRetry}>Tentar novamente</button></div>}
        {!loading && !error && files.length === 0 && <div className="room-files-empty">Nenhum arquivo encontrado.</div>}
        {!loading && files.map((file) => <RoomFileItem file={file} key={file.id} />)}
      </div>
    </aside>
  )
}

function RoomFileItem({ file }: { file: RoomFile }) {
  const download = async () => {
    try {
      const blob = await api.downloadFile(file.id)
      if (await saveDownloadedBlob(blob, file.originalName)) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.originalName
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      // O item permanece disponível mesmo quando o download falha.
    }
  }
  return (
    <article className="room-file-item">
      <FileThumbnail file={file} />
      <div className="room-file-info">
        <strong title={file.originalName}>{file.originalName}</strong>
        <small>{file.name ? file.name : `@${file.username}`}</small>
        <time dateTime={file.createdAt}>{formatFileDate(file.createdAt)}</time>
      </div>
      <button type="button" className="room-file-action" onClick={() => void download()} aria-label={`Baixar ${file.originalName}`} title="Baixar arquivo"><IconDownload size={16} /></button>
    </article>
  )
}

function FileThumbnail({ file }: { file: RoomFile }) {
  const [url, setUrl] = useState<string | null>(null)
  const isImage = file.mimeType?.startsWith('image/')
  useEffect(() => {
    if (!isImage) return
    let active = true
    api.downloadFile(file.id).then((blob) => {
      const objectUrl = URL.createObjectURL(blob)
      if (active) setUrl(objectUrl)
      else URL.revokeObjectURL(objectUrl)
    }).catch(() => setUrl(null))
    return () => {
      active = false
      setUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
    }
  }, [file.id, isImage])
  if (isImage && url) return <img className="room-file-thumb" src={url} alt="" />
  return <span className={`room-file-thumb room-file-icon ${attachmentIconClass(file)}`}>{attachmentIcon(file, false, false)}</span>
}

function formatFileDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function AttachmentView({ msg }: { msg: Message }) {
  const att = msg.attachment
  const isImage = !!att && att.mimeType.startsWith('image/')
  const isAudio = !!att && att.mimeType.startsWith('audio/')
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; url: string } | { status: 'error'; error: string }>(
    { status: 'loading' },
  )

  const load = useCallback(async () => {
    if (!att) return
    setState({ status: 'loading' })
    try {
      const blob = await api.downloadFile(att.id)
      const url = URL.createObjectURL(blob)
      setState({ status: 'ready', url })
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof ApiError ? err.message : 'Falha ao carregar o anexo',
      })
    }
  }, [att])

  useEffect(() => {
    load()
    return () => {
      setState((s) => {
        if (s.status === 'ready') URL.revokeObjectURL(s.url)
        return s
      })
    }
  }, [load])

  if (!att) return null

  if (state.status === 'loading') {
    return (
      <div className="attachment">
        <span className={`attachment-icon ${attachmentIconClass(att)}`}>{attachmentIcon(att, isImage, isAudio)}</span>
        <span className="attachment-body">
          <strong>{att.originalName}</strong>
          <small>Carregando…</small>
        </span>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="attachment attachment-error">
        <span className={`attachment-icon ${attachmentIconClass(att)}`}>⚠</span>
        <span className="attachment-body">
          <strong>{att.originalName}</strong>
          <small className="attachment-errmsg">{state.error}</small>
          <button className="attachment-retry" onClick={load}>
            Tentar novamente
          </button>
        </span>
      </div>
    )
  }

  if (isImage) {
    return (
      <div className="attachment-image">
        <img
          src={state.url}
          alt={att.originalName}
          className="attachment-img"
          onClick={() => window.open(state.url, '_blank')}
          title="Clique para ampliar"
        />
        <span className="attachment-image-meta">
          <strong>{att.originalName}</strong>
          <small>{formatBytes(att.size)}</small>
          <a href={state.url} download={att.originalName} className="btn-link">
            Baixar
          </a>
        </span>
      </div>
    )
  }

  if (isAudio) {
    return (
      <div className="attachment-audio">
        <span className="attachment-icon audio">🎵</span>
        <div className="attachment-audio-body">
          <strong>{att.originalName}</strong>
          <audio controls preload="metadata" src={state.url} />
          <div className="attachment-audio-meta">
            <small>{formatBytes(att.size)}</small>
            <a href={state.url} download={att.originalName} className="btn-link">Baixar áudio</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <a href={state.url} download={att.originalName} className="attachment">
      <span className={`attachment-icon ${attachmentIconClass(att)}`}>{attachmentIcon(att, false, false)}</span>
      <span className="attachment-body">
        <strong>{att.originalName}</strong>
        <small>
          {formatBytes(att.size)} • {att.mimeType} — Baixar
        </small>
      </span>
    </a>
  )
}

function attachmentExtension(att: Attachment): string {
  return att.originalName.split('.').pop()?.toLowerCase() ?? ''
}

function attachmentIconClass(att: Attachment): string {
  const ext = attachmentExtension(att)
  if (att.mimeType === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (['xls', 'xlsx', 'xlsm', 'ods'].includes(ext) || att.mimeType.includes('spreadsheet')) return 'spreadsheet'
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext) || att.mimeType.includes('word')) return 'document'
  if (['ppt', 'pptx', 'odp'].includes(ext) || att.mimeType.includes('presentation')) return 'presentation'
  if (att.mimeType.startsWith('audio/')) return 'audio'
  return 'generic'
}

function attachmentIcon(att: Attachment, isImage: boolean, isAudio: boolean): string {
  if (isImage) return '🖼'
  if (isAudio) return '🎵'
  const kind = attachmentIconClass(att)
  if (kind === 'pdf') return '📕'
  if (kind === 'spreadsheet') return '📊'
  if (kind === 'document') return '📄'
  if (kind === 'presentation') return '📽'
  return '📎'
}

function ReadReceiptsModal({ message, onClose }: { message: Message; onClose: () => void }) {
  const readers = message.readBy ?? []
  return (
    <Modal title="Confirmação de leitura" onClose={onClose}>
      <div className="read-receipts-list">
        {readers.length === 0 && <span className="nav-empty">Ainda não lida por outra pessoa.</span>}
        {readers.map((reader) => (
          <div className="read-receipt-row" key={`${reader.userId}-${reader.readAt}`}>
            <span className="mini-avatar">{initials(reader.name || reader.username)}</span>
            <span className="picker-item-text">
              <strong>{reader.name || reader.username}</strong>
              <small>@{reader.username}</small>
            </span>
            <time dateTime={reader.readAt}>{formatTime(reader.readAt)}</time>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Fechar</button>
      </div>
    </Modal>
  )
}

function ReactionUsersModal({ emoji, reactions, onClose }: { emoji: string; reactions: MessageReaction[]; onClose: () => void }) {
  return (
    <Modal title={`Quem reagiu com ${emoji}`} onClose={onClose}>
      <div className="reaction-users-list">
        {reactions.map((reaction) => (
          <div className="read-receipt-row" key={`${reaction.userId}-${reaction.createdAt ?? reaction.id ?? reaction.emoji}`}>
            <span className="mini-avatar">{initials(reaction.username)}</span>
            <span className="picker-item-text">
              <strong>{reaction.username}</strong>
              <small>{reaction.emoji}</small>
            </span>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Fechar</button>
      </div>
    </Modal>
  )
}

function NotificationButton() {
  const [supported] = useState(
    () => !isTauri && 'PushManager' in window && 'Notification' in window && 'serviceWorker' in navigator,
  )
  const [subscribed, setSubscribed] = useState(false)
  const [nativeOn, setNativeOn] = useState(() => {
    try { return localStorage.getItem('konnix-system-notifications') === 'true' } catch { return false }
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supported) return
    let active = true
    navigator.serviceWorker
      .ready.then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (active) setSubscribed(!!sub)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [supported])

  const enable = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (!supported) {
        setError('Seu navegador não suporta notificações do sistema.')
        return
      }
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setError('Permissão de notificação negada no navegador. Desbloqueie as notificações do site nas configurações do navegador para ativar esta opção.')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const key = await api.pushPublicKey()
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key.publicKey),
      })
      await api.pushSubscribe({
        endpoint: sub.endpoint,
        p256dh: uint8ArrayToBase64Url(new Uint8Array(sub.getKey('p256dh') ?? new ArrayBuffer(0))),
        auth: uint8ArrayToBase64Url(new Uint8Array(sub.getKey('auth') ?? new ArrayBuffer(0))),
      })
      try { localStorage.setItem('konnix-system-notifications', 'true') } catch { /* preferência opcional */ }
      setSubscribed(true)
      setNativeOn(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao ativar')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
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
      try { localStorage.setItem('konnix-system-notifications', 'false') } catch { /* preferência opcional */ }
      setSubscribed(false)
      setNativeOn(false)
    } finally {
      setBusy(false)
    }
  }

  const toggleNative = async () => {
    if (busy) return
    const next = !nativeOn
    setBusy(true)
    setError(null)
    try {
      try { localStorage.setItem('konnix-system-notifications', String(next)) } catch { /* preferência opcional */ }
      setNativeOn(next)
    } finally {
      setBusy(false)
    }
  }

  const on = isTauri ? nativeOn : subscribed

  return (
    <div className="user-menu-item notification-row">
      <IconBell />
      <span className="notification-label">Notificações</span>
      {busy ? (
        <span className="status-pill">Processando…</span>
      ) : (
        <button
          type="button"
          className={`status-pill message-notification-toggle ${on ? 'notification-toggle-off' : 'notification-toggle-on'}`}
          onClick={isTauri ? toggleNative : on ? disable : enable}
          aria-pressed={on}
          title={on ? 'Desativar notificações' : 'Ativar notificações'}
        >
          {on ? 'Desativar' : 'Ativar'}
        </button>
      )}
      {error && <span className="notif-error">{error}</span>}
    </div>
  )
}

function AutostartButton() {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isTauri) return
    void desktopAutostartEnabled().then(setEnabled).catch(() => undefined)
  }, [])

  if (!isTauri) return null

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      await setDesktopAutostart(!enabled)
      setEnabled(!enabled)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className="user-menu-item user-menu-action message-notifications-toggle"
      onClick={() => void toggle()}
      disabled={busy}
    >
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
      <span>Iniciar com o Windows</span>
      <small>{enabled ? 'Ativo' : 'Desativado'}</small>
    </button>
  )
}

function ReportIssueModal({
  onClose,
  notify,
}: {
  onClose: () => void
  notify: (text: string) => void
}) {
  useEscapeClose(onClose)
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || [])
    setFiles((prev) => [...prev, ...selectedFiles])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const submit = async () => {
    if (!content.trim() || busy) return
    setBusy(true)
    try {
      await api.reportIssue(content.trim(), files.length > 0 ? files : undefined)
      notify('Relato enviado com sucesso aos administradores!')
      onClose()
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Falha ao enviar relato')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal">
        <div className="modal-head">
          <h3>Relatar Problema</h3>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <div className="modal-fields">
          <label className="admin-label">
            Descreva a sugestão ou bug
            <textarea
              className="input"
              style={{ minHeight: '120px', resize: 'vertical', fontFamily: 'inherit', padding: '8px' }}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Digite detalhadamente o problema ou sugestão..."
              maxLength={2000}
            />
          </label>
          <div className="report-attachments">
            <input
              type="file"
              ref={fileInputRef}
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              accept="image/*,.pdf,.doc,.docx,.txt,.zip,.rar"
            />
            <button
              type="button"
              className="btn-ghost report-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              Anexar arquivo
            </button>
            {files.length > 0 && (
              <div className="report-file-list">
                {files.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="report-file-item">
                    <span className="report-file-name">{file.name}</span>
                    <button
                      type="button"
                      className="report-file-remove"
                      onClick={() => removeFile(index)}
                      disabled={busy}
                      aria-label={`Remover ${file.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn-primary" disabled={busy || !content.trim()} onClick={submit}>
            {busy ? 'Enviando...' : 'Enviar relato'}
          </button>
        </div>
      </div>
    </div>
  )
}
