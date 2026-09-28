import { useEffect, useRef, useState } from 'react'
import type { PresenceStatus, User } from '../../api'
import { PRESENCE_OPTIONS } from '../../utils/presence'

export function PresenceSelector({
  status,
  onChange,
  onError,
}: {
  status: PresenceStatus
  onChange: (status: PresenceStatus) => Promise<User>
  onError: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const effectiveStatus: PresenceStatus = status || 'online'
  const currentIndex = Math.max(0, PRESENCE_OPTIONS.findIndex((option) => option.id === effectiveStatus))
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
    if (next === effectiveStatus || busy) {
      setOpen(false)
      return
    }
    setBusy(true)
    try {
      await onChange(next)
      setOpen(false)
    } catch {
      onError('Não foi possível atualizar seu status')
    } finally {
      setBusy(false)
    }
  }

  const move = (direction: number) => {
    setHighlightedIndex((index) => (index + direction + PRESENCE_OPTIONS.length) % PRESENCE_OPTIONS.length)
  }

  return (
    <div className="presence-selector" ref={menuRef}>
      <button
        type="button"
        className={`presence-pill presence-${effectiveStatus}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
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
              className={`presence-option presence-${option.id} ${option.id === effectiveStatus ? 'selected' : ''} ${PRESENCE_OPTIONS.indexOf(option) === highlightedIndex ? 'highlighted' : ''}`}
              onMouseEnter={() => setHighlightedIndex(PRESENCE_OPTIONS.indexOf(option))}
              onClick={() => void select(option.id)}
            >
              <span className="presence-check">{option.id === effectiveStatus ? '✓' : ''}</span>
              <span className="presence-dot" aria-hidden="true" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
