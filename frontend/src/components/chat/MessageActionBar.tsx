import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EmojiSelection } from '../../types'
import { IconCopy, IconDotsVertical, IconEye, IconHeart, IconPin } from '../icons'
import { LazyEmojiPicker } from './LazyEmojiPicker'

export function MessageActionBar({
  pinned,
  onPin,
  onQuote,
  onCopy,
  onForward,
  onEdit,
  onEmoji,
  onRespond,
  canPin,
  isPinned,
  onTogglePin,
  isFavorite,
  onToggleFavorite,
  onViewReads,
}: {
  pinned: boolean
  onPin: (pinned: boolean) => void
  onQuote: () => void
  onCopy?: () => void
  onForward: () => void
  onEdit?: () => void
  onEmoji: (emoji: string) => void
  onRespond?: () => void
  canPin?: boolean
  isPinned?: boolean
  onTogglePin?: () => void
  isFavorite?: boolean
  onToggleFavorite?: () => void
  onViewReads?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const moreBtnRef = useRef<HTMLButtonElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [morePos, setMorePos] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    if (!pinned) {
      setOpen(false)
      setMoreOpen(false)
    }
  }, [pinned])

  useEffect(() => {
    if (!pinned) return
    const handle = (e: MouseEvent) => {
      const target = e.target as Node
      const inEmoji = ref.current?.contains(target) || menuRef.current?.contains(target)
      const inMore = moreBtnRef.current?.contains(target) || moreMenuRef.current?.contains(target)
      if (!inEmoji && !inMore) {
        onPin(false)
        setOpen(false)
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [pinned, onPin])

  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(false)
        onPin(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [moreOpen, onPin])

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

  useEffect(() => {
    if (!moreOpen || !moreBtnRef.current) {
      setMorePos(null)
      return
    }
    const update = () => {
      if (!moreBtnRef.current) return
      const r = moreBtnRef.current.getBoundingClientRect()
      const menuW = 190
      const menuH = 88
      let top = r.bottom + 4
      if (top + menuH > window.innerHeight) {
        top = Math.max(8, r.top - menuH - 4)
      }
      let left = r.right - menuW
      if (left < 8) {
        left = 8
      }
      if (left + menuW > window.innerWidth) {
        left = Math.max(8, window.innerWidth - menuW - 8)
      }
      setMorePos({ left, top })
    }
    update()
    const onScroll = () => update()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [moreOpen])

  return (
    <div className="message-actions" ref={ref}>
      <div className="message-emoji-action">
        <button
          ref={btnRef}
          type="button"
          title="Reagir à mensagem"
          aria-label="Reagir à mensagem"
          aria-expanded={open}
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
          <IconPin />
        </button>
      )}
      {onToggleFavorite && (
        <button
          type="button"
          className={`message-action-favorite ${isFavorite ? 'active' : ''}`}
          title={isFavorite ? 'Desfavoritar mensagem' : 'Favoritar mensagem'}
          aria-label={isFavorite ? 'Desfavoritar mensagem' : 'Favoritar mensagem'}
          onClick={() => {
            onPin(false)
            onToggleFavorite()
          }}
        >
          <IconHeart size={16} filled={isFavorite} />
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
      {onCopy && (
        <button
          type="button"
          className="message-action-copy"
          title="Copiar mensagem"
          aria-label="Copiar mensagem"
          onClick={() => {
            onPin(false)
            onCopy()
          }}
        >
          <IconCopy />
        </button>
      )}
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
      <button
        ref={moreBtnRef}
        type="button"
        className={`message-action-more ${moreOpen ? 'active' : ''}`}
        title="Mais opções"
        aria-label="Mais opções da mensagem"
        aria-haspopup="menu"
        aria-expanded={moreOpen}
        onClick={() => {
          setOpen(false)
          setMoreOpen((prev) => {
            const next = !prev
            onPin(next)
            return next
          })
        }}
      >
        <IconDotsVertical size={16} />
      </button>
      {moreOpen &&
        morePos &&
        createPortal(
          <div
            ref={moreMenuRef}
            className="message-more-menu message-more-menu-portal"
            role="menu"
            style={{ position: 'fixed', left: morePos.left, top: morePos.top, zIndex: 10000 }}
          >
            {onViewReads && (
              <button
                type="button"
                className="message-more-menu-item"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false)
                  onPin(false)
                  onViewReads()
                }}
              >
                <span className="message-more-menu-icon">
                  <IconEye size={16} />
                </span>
                <span>Visualizar leitura</span>
              </button>
            )}
            {onCopy && (
              <button
                type="button"
                className="message-more-menu-item"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false)
                  onPin(false)
                  onCopy()
                }}
              >
                <span className="message-more-menu-icon">
                  <IconCopy size={16} />
                </span>
                <span>Copiar mensagem</span>
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
