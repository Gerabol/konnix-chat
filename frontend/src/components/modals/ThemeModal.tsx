import { useState } from 'react'
import { Modal } from './Modal'
import { api, ApiError } from '../../api'
import type { Theme, User } from '../../api'
import { applyTheme, normalizeTheme, THEME_OPTIONS } from '../../utils/theme'

export function ThemeModal({
  theme,
  onClose,
  onPreview,
  onSaved,
  notify,
}: {
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

  return (
    <Modal title="Escolher tema" onClose={close} className="theme-modal">
      <div className="theme-options" role="radiogroup" aria-label="Temas disponíveis">
        {THEME_OPTIONS.map((option) => (
          <button
            type="button"
            role="radio"
            aria-checked={selected === option.id}
            key={option.id}
            className={`theme-option ${selected === option.id ? 'selected' : ''}`}
            onClick={() => choose(option.id)}
          >
            <span className="theme-option-heading">
              <strong>{selected === option.id ? '✓ ' : ''}{option.label}</strong>
            </span>
            <span className="theme-preview" aria-hidden="true">
              {option.colors.map((color) => (
                <i key={color} style={{ backgroundColor: color }} />
              ))}
            </span>
          </button>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={close}>
          Cancelar
        </button>
        <button className="btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Salvando…' : 'Aplicar tema'}
        </button>
      </div>
    </Modal>
  )
}

export default ThemeModal
