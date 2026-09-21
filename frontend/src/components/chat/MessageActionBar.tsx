import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EmojiSelection } from '../../types'
import { LazyEmojiPicker } from './LazyEmojiPicker'

export function MessageActionBar({
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

  useEffect(() => {
    if (!pinned) setOpen(false)
  }, [pinned])

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
    if (!open || !btnRef.current) {
      setPos(null)
      return
    }
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
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  return (
    <div className="message-actions" ref={ref}>
      <div className="message-emoji-action">
        <button
          ref={btnRef}
          type="button"
          title="Emoji"
          onClick={() => {
            onPin(true)
            setOpen((value) => !value)
          }}
        >
          😊
        </button>
        {open &&
          pos &&
          createPortal(
            <div
              ref={menuRef}
              className="message-emoji-menu message-emoji-menu-portal"
              style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 10000 }}
            >
              <LazyEmojiPicker
                onEmojiSelect={(emoji: EmojiSelection) => {
                  if (emoji.native) onEmoji(emoji.native)
                  setOpen(false)
                  setPos(null)
                  onPin(false)
                }}
                previewPosition="none"
                skinTonePosition="none"
              />
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
          onClick={() => {
            onPin(false)
            onTogglePin()
          }}
        >
          📌
        </button>
      )}
      {onRespond && (
        <button
          type="button"
          className="message-action-respond"
          title="Responder ao usuário"
          onClick={() => {
            onPin(false)
            onRespond()
          }}
        >
          🗪
        </button>
      )}
      {onEdit && (
        <button
          type="button"
          title="Editar mensagem"
          onClick={() => {
            onPin(false)
            onEdit()
          }}
        >
          ✎
        </button>
      )}
      <button
        type="button"
        className="message-action-quote"
        title="Citar mensagem"
        onClick={() => {
          onPin(false)
          onQuote()
        }}
      >
        ❝
      </button>
      <button
        type="button"
        title="Encaminhar mensagem"
        onClick={() => {
          onPin(false)
          onForward()
        }}
      >
        ➜
      </button>
    </div>
  )
}
