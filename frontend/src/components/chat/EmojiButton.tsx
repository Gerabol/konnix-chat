import { useEffect, useRef, useState } from 'react'
import type { EmojiSelection } from '../../types'
import { LazyEmojiPicker } from './LazyEmojiPicker'

export function EmojiButton({
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
      {open && (
        <div className="emoji-picker-popover" role="dialog" aria-label="Seletor de emojis">
          <div className="emoji-picker-header">
            <span>Emojis</span>
            <button
              type="button"
              className="emoji-picker-close"
              aria-label="Fechar seletor de emojis"
              title="Fechar"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <LazyEmojiPicker
            onEmojiSelect={(emoji: EmojiSelection) => {
              if (emoji.native) onPick(emoji.native)
              setOpen(false)
            }}
            previewPosition="none"
            skinTonePosition="none"
          />
        </div>
      )}
    </div>
  )
}
