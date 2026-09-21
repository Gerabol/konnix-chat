import { useState } from 'react'
import { Modal } from './Modal'
import { MemberPicker } from '../chat/MemberPicker'
import { api, ApiError } from '../../api'
import type { DirectoryUser, User } from '../../api'

export function NewRoomModal({
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
          <small className="field-hint">
            {type === 'CHANNEL'
              ? 'Somente você (proprietário) e administradores podem escrever. Demais membros leem.'
              : 'Todos os membros podem escrever.'}
          </small>
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
        <button className="btn-primary" onClick={() => void create()} disabled={busy || !name.trim()}>
          {busy ? 'Criando…' : 'Criar'}
        </button>
      </div>
    </Modal>
  )
}

export default NewRoomModal
