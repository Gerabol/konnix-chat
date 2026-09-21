import { Modal } from './Modal'

export function ConfirmModal({
  title,
  message,
  onClose,
  onConfirm,
}: {
  title: string
  message: string
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Modal title={title} onClose={onClose} className="confirm-modal">
      <p className="confirm-message">{message}</p>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="danger-action confirm-danger" onClick={onConfirm}>
          Excluir
        </button>
      </div>
    </Modal>
  )
}

export default ConfirmModal
