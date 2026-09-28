import { useEffect, useState } from 'react'
import { api, ApiError, roomAvatarPath } from '../../api'
import type { Room } from '../../api'
import { getRoomIcon, roomDisplayName } from '../../utils/room'
import { Modal } from './Modal'
import { AvatarImage } from '../chat/AvatarImage'

export function RoomEditModal({
  room,
  onClose,
  onSaved,
  notify,
}: {
  room: Room
  onClose: () => void
  onSaved: (room: Room) => void
  notify: (text: string) => void
}) {
  const [name, setName] = useState(roomDisplayName(room))
  const [avatar, setAvatar] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

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
