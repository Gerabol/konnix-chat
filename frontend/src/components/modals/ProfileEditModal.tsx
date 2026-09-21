import { useEffect, useState } from 'react'
import { useEscapeClose } from '../../hooks/useEscapeClose'
import { AvatarImage, initials } from '../chat/AvatarImage'
import { api, ApiError, userAvatarPath } from '../../api'
import type { User } from '../../api'

export function ProfileEditModal({
  me,
  myAvatarVersion,
  onClose,
  onSaved,
  notify,
}: {
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
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
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
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="edit-user-heading">
          {preview ? (
            <img src={preview} className="edit-user-avatar" alt="Prévia do avatar" />
          ) : (
            <AvatarImage
              path={`${userAvatarPath(me.id)}?v=${encodeURIComponent(myAvatarVersion)}`}
              className="edit-user-avatar"
              fallback={<span className="edit-user-avatar">{initials(name || me.name)}</span>}
              alt={name || me.name}
            />
          )}
          <div className="edit-user-title">
            <strong>{name.trim() || me.name}</strong>
            <small>@{me.username}</small>
          </div>
        </div>
        <div className="modal-fields">
          <label className="admin-label">
            Nome
            <input
              autoComplete="off"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="admin-label">
            Username
            <input className="input readonly-input" value={`@${me.username}`} readOnly disabled />
          </label>
          <label className="admin-label">
            E-mail
            <input
              autoComplete="off"
              className="input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="admin-label">
            Imagem de perfil
            <input
              autoComplete="off"
              className="input"
              type="file"
              accept="image/*"
              onChange={(event) => pickAvatar(event.target.files?.[0] || null)}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            disabled={busy || !name.trim()}
            onClick={() => void save()}
          >
            {busy ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProfileEditModal
