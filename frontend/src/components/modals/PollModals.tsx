import { useState } from 'react'
import { api, ApiError, formatTime, userAvatarPath } from '../../api'
import type { Message } from '../../api'
import { Modal } from './Modal'
import { AvatarImage, initials } from '../chat/AvatarImage'

export function formatPollVoteTime(iso: string | null): string {
  if (!iso) return 'Data do voto não disponível'
  const date = new Date(iso)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay ? `Hoje às ${formatTime(iso)}` : `${date.toLocaleDateString('pt-BR')} às ${formatTime(iso)}`
}

export function CreatePollModal({
  roomId,
  onClose,
  onCreated,
  notify,
}: {
  roomId: string
  onClose: () => void
  onCreated: (message: Message) => void
  notify: (text: string) => void
}) {
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

  return (
    <Modal title="Nova enquete" onClose={onClose}>
      <div className="modal-fields">
        <label className="field-label">
          Pergunta
          <input
            className="input"
            autoFocus
            maxLength={500}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Qual é a sua pergunta?"
          />
        </label>
        {options.map((option, index) => (
          <div className="poll-option-input" key={index}>
            <label className="field-label">
              Opção {index + 1}
              <input
                className="input"
                maxLength={255}
                value={option}
                onChange={(event) =>
                  setOptions((current) =>
                    current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item))
                  )
                }
              />
            </label>
            {options.length > 2 && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                aria-label={`Remover opção ${index + 1}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {options.length < 10 && (
          <button
            type="button"
            className="btn-ghost poll-add-option"
            onClick={() => setOptions((current) => [...current, ''])}
          >
            + Adicionar opção
          </button>
        )}
        <label className="admin-check">
          <input
            type="checkbox"
            checked={allowMultiple}
            onChange={(event) => setAllowMultiple(event.target.checked)}
          />{' '}
          Permitir escolher mais de uma opção
        </label>
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Criando...' : 'Criar enquete'}
        </button>
      </div>
    </Modal>
  )
}

export function PollResultsModal({
  poll,
  onClose,
}: {
  poll: NonNullable<Message['poll']>
  onClose: () => void
}) {
  return (
    <Modal title="Dados da enquete" onClose={onClose} className="poll-results-modal">
      <div className="poll-results-content">
        <strong className="poll-results-question">{poll.question}</strong>
        <span className="poll-results-summary">
          {poll.totalVoters} de {poll.totalMembers} membro{poll.totalMembers === 1 ? '' : 's'} votaram
        </span>
        <div className="poll-results-options">
          {poll.options.map((option) => (
            <section className="poll-results-option" key={option.id}>
              <div className="poll-results-option-head">
                <strong>{option.label}</strong>
                <span>
                  {option.votes} voto{option.votes === 1 ? '' : 's'}
                </span>
              </div>
              {option.voters.length === 0 ? (
                <small className="poll-no-votes">Nenhum voto</small>
              ) : (
                <div className="poll-voters">
                  {option.voters.map((voter) => (
                    <div className="poll-voter" key={`${option.id}-${voter.userId}`}>
                      <AvatarImage
                        path={userAvatarPath(voter.userId)}
                        className="poll-voter-avatar"
                        fallback={<span className="poll-voter-avatar">{initials(voter.name || voter.username)}</span>}
                        alt={voter.name || voter.username}
                      />
                      <div>
                        <strong>{voter.name || voter.username}</strong>
                        <small>{formatPollVoteTime(voter.votedAt)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </Modal>
  )
}
