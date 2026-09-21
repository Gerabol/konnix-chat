import { useState } from 'react'
import type { Message } from '../../api'
import { PollResultsModal } from '../modals/PollModals'

export function PollCard({
  poll,
  disabled,
  onVote,
}: {
  poll: NonNullable<Message['poll']>
  disabled: boolean
  onVote: (optionId: string) => void
}) {
  const totalVotes = poll.options.reduce((sum, option) => sum + option.votes, 0)
  const [resultsOpen, setResultsOpen] = useState(false)
  return (
    <>
      <div className="poll-card">
        <strong className="poll-question">{poll.question}</strong>
        <small className="poll-hint">{poll.allowMultiple ? 'Escolha uma ou mais opções' : 'Escolha uma opção'}</small>
        <div className="poll-options">
          {poll.options.map((option) => {
            const percentage = totalVotes ? Math.round((option.votes / totalVotes) * 100) : 0
            return (
              <button
                type="button"
                key={option.id}
                className={`poll-option ${option.selected ? 'selected' : ''}`}
                disabled={disabled}
                onClick={() => onVote(option.id)}
              >
                <span className="poll-option-top">
                  <span>{option.selected ? '✓ ' : ''}{option.label}</span>
                  <b>{percentage}%</b>
                </span>
                <span className="poll-progress"><span style={{ width: `${percentage}%` }} /></span>
                <small>{option.votes} voto{option.votes === 1 ? '' : 's'}</small>
              </button>
            )
          })}
        </div>
        <div className="poll-total-votes">{totalVotes} voto{totalVotes === 1 ? '' : 's'}</div>
        <button type="button" className="poll-results-button" onClick={() => setResultsOpen(true)}>Resultado</button>
      </div>
      {resultsOpen && <PollResultsModal poll={poll} onClose={() => setResultsOpen(false)} />}
    </>
  )
}
