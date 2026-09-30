import { memo, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { formatFullTimestamp, formatTime, userAvatarPath } from '../../api'
import type { Message, MessageReaction } from '../../api'
import { RoleBadge } from '../../RoleBadge'
import { renderMarkdown, renderMessageContent } from '../../utils/markdown'
import { ReactionUsersModal } from '../modals/ReadReceiptsModal'
import { AttachmentView } from './AttachmentView'
import { AvatarImage, initials } from './AvatarImage'
import { MessageActionBar } from './MessageActionBar'
import { PollCard } from './PollCard'

export interface MessageRowProps {
  msg: Message
  isMine: boolean
  currentUsername: string
  currentUserId: string
  myAvatarVersion: string
  avatarVersions: Record<string, string>
  canWrite: boolean
  onDelete: (msg: Message) => void
  onEdit: (message: Message) => void
  onShowProfile: (userId: string, event?: ReactMouseEvent) => void
  onQuote: (msg: Message) => void
  onCopy?: (msg: Message) => void
  onForward: (msg: Message) => void
  onReaction: (msg: Message, emoji: string) => void
  onRespond?: (msg: Message) => void
  actionPinned: boolean
  onPinAction: (msgId: string, pinned: boolean) => void
  highlighted: boolean
  onJumpToQuoted: (messageId: string) => void
  readReceiptsEnabled: boolean
  onShowReads: (msgId: string) => void
  onVotePoll: (msg: Message, optionId: string) => void
  canPin?: boolean
  isPinned?: boolean
  onTogglePin?: (msg: Message) => void
}

/** Emoji da pastilha de reação sob o ponteiro, ou null se o alvo não for uma. */
function reactionChipEmoji(target: EventTarget | null) {
  return (target as HTMLElement | null)?.closest<HTMLElement>('.message-reaction')?.dataset.emoji ?? null
}

function MessageRowComponent({
  msg,
  isMine,
  currentUsername,
  currentUserId,
  myAvatarVersion,
  avatarVersions,
  canWrite,
  onDelete,
  onEdit,
  onShowProfile,
  onQuote,
  onCopy,
  onForward,
  onReaction,
  onRespond,
  actionPinned,
  onPinAction,
  highlighted,
  onJumpToQuoted,
  readReceiptsEnabled,
  onShowReads,
  onVotePoll,
  canPin,
  isPinned,
  onTogglePin,
}: MessageRowProps) {
  const deleted = !!msg.deletedAt
  const messageAttachments = msg.attachments ?? (msg.attachment ? [msg.attachment] : [])
  const hasAttachments = messageAttachments.length > 0
  // Renderiza as marcações em um único elemento para poder posicioná-las antes do
  // nome nas mensagens próprias e depois do nome nas mensagens dos demais.
  const messageTags =
    msg.forwardedFromUsername || isPinned || msg.editedAt ? (
      <span className="message-tags">
        {msg.forwardedFromUsername && <span className="forwarded-label">Encaminhada</span>}
        {isPinned && <span className="message-pinned-badge" title="Mensagem fixada">📌 Fixada</span>}
        {msg.editedAt && <em className="message-edited">Editada</em>}
      </span>
    ) : null
  const [actionDismissed, setActionDismissed] = useState(false)
  const [mouseHovered, setMouseHovered] = useState(false)
  const [reactionDetailsEmoji, setReactionDetailsEmoji] = useState<string | null>(null)
  const [longPressed, setLongPressed] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<number | null>(null)
  const longPressStart = useRef<{ x: number; y: number } | null>(null)
  const longPressTriggered = useRef(false)
  const longPressChip = useRef<string | null>(null)
  // If the layout shifts between pointerdown and click (e.g. the virtual
  // keyboard closes under a tap), the browser can drop the click entirely,
  // forcing a second tap. pointerup is never dropped, so activate on it for
  // touch and let click act as the fallback (keyboard/assistive tech).
  const activationGuard = useRef(false)

  const onActivatePointerUp =
    (fn: (event?: ReactPointerEvent) => void) => (event: ReactPointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      activationGuard.current = true
      fn(event)
    }

  const onActivateClick = (fn: (event?: ReactMouseEvent) => void) => (event: ReactMouseEvent) => {
    if (activationGuard.current) {
      activationGuard.current = false
      return
    }
    fn(event)
  }

  const beginLongPress = (event: ReactPointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // Segurar sobre o texto precisa iniciar a seleção nativa do celular. Abrir a
    // barra de ações aqui rouba o gesto e a seleção nunca aparece. Mesmo critério
    // já usado no onContextMenu abaixo.
    if ((event.target as HTMLElement | null)?.closest('.message-content')) {
      cancelLongPress()
      return
    }
    longPressTriggered.current = false
    longPressChip.current = reactionChipEmoji(event.target)
    longPressStart.current = { x: event.clientX, y: event.clientY }
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current)
    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true
      // Segurar sobre uma reação lista quem reagiu, em vez de alternar a minha.
      const chip = longPressChip.current
      if (chip) {
        setReactionDetailsEmoji(chip)
        return
      }
      setActionDismissed(false)
      setLongPressed(true)
    }, 500)
  }

  const cancelLongPress = () => {
    longPressStart.current = null
    longPressChip.current = null
    longPressTriggered.current = false
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const moveLongPress = (event: ReactPointerEvent) => {
    const start = longPressStart.current
    if (!start) return
    if (Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8) {
      cancelLongPress()
    }
  }

  useEffect(() => {
    if (!longPressed) return
    const dismiss = (event: MouseEvent | TouchEvent) => {
      if (rowRef.current && !rowRef.current.contains(event.target as Node)) setLongPressed(false)
    }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('touchstart', dismiss, { passive: true })
    return () => {
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('touchstart', dismiss)
    }
  }, [longPressed])

  const handleShowProfile = (event?: ReactMouseEvent) => {
    if (msg.userId) onShowProfile(msg.userId, event)
  }

  // Agrupa a minha reação no mesmo emoji de quem já reagiu; um segundo toque
  // no mesmo emoji remove a minha. O servidor alterna conforme o registro
  // existente, então basta chamar o mesmo endpoint nos dois casos.
  const toggleMyReaction = (emoji: string) => {
    if (longPressTriggered.current || !canWrite) return
    onReaction(msg, emoji)
  }

  const reactedByMe = (emoji: string) =>
    (msg.reactions ?? []).some(
      (reaction) => reaction.userId === currentUserId && reaction.emoji === emoji,
    )

  if (msg.messageType === 'SYSTEM') {
    return (
      <div data-message-id={msg.id} className="system-line">
        {renderMarkdown(msg.content)}
      </div>
    )
  }

  return (
    <div
      ref={rowRef}
      data-message-id={msg.id}
      onMouseEnter={() => setActionDismissed(false)}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse' || event.pointerType === 'pen') setMouseHovered(true)
      }}
      onPointerDown={beginLongPress}
      onPointerMove={moveLongPress}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerLeave={(event) => {
        cancelLongPress()
        if (event.pointerType === 'mouse' || event.pointerType === 'pen') setMouseHovered(false)
      }}
      onContextMenu={(e) => {
        const target = e.target as HTMLElement | null
        const chip = reactionChipEmoji(e.target)
        if (chip) {
          e.preventDefault()
          setReactionDetailsEmoji(chip)
          return
        }
        if (!deleted && canWrite && !target?.closest('.message-content')) {
          e.preventDefault()
          setActionDismissed(false)
          setLongPressed(true)
        }
      }}
      className={`message ${isMine ? 'mine' : ''} ${deleted ? 'deleted' : ''} ${actionPinned ? 'action-pinned' : ''} ${actionDismissed ? 'action-dismissed' : ''} ${mouseHovered ? 'mouse-hovered' : ''} ${longPressed ? 'long-pressed' : ''} ${highlighted ? 'message-highlighted' : ''}`}
    >
      {!deleted && (
        <button
          type="button"
          className="message-avatar-button"
          onPointerUp={onActivatePointerUp(handleShowProfile)}
          onClick={onActivateClick(handleShowProfile)}
          aria-label={`Abrir contato de ${msg.username || 'usuário'}`}
        >
          <AvatarImage
            path={
              msg.userId
                ? `${userAvatarPath(msg.userId)}${
                    isMine
                      ? `?v=${encodeURIComponent(myAvatarVersion)}`
                      : avatarVersions[msg.userId]
                      ? `?v=${encodeURIComponent(avatarVersions[msg.userId])}`
                      : ''
                  }`
                : null
            }
            className="msg-avatar"
            fallback={<span className="msg-avatar">{initials(msg.username || 'sistema')}</span>}
            alt={msg.username || 'sistema'}
          />
        </button>
      )}
      <div className="message-body">
        <div className="message-meta">
          {isMine && <span className="message-time" title={formatFullTimestamp(msg.createdAt)}>{formatTime(msg.createdAt)}</span>}
          {deleted ? (
            <span className="message-author">Mensagem excluída</span>
          ) : (
            <span className="message-author-wrap">
              {isMine && (
                <>
                  {messageTags}
                  {msg.roles?.includes('ADMIN') && <RoleBadge type="admin" />}
                  {msg.roles?.includes('OWNER') && <RoleBadge type="owner" />}
                </>
              )}
              <button
                type="button"
                className="message-author message-author-button"
                onPointerUp={onActivatePointerUp(handleShowProfile)}
                onClick={onActivateClick(handleShowProfile)}
              >
                {msg.username || 'sistema'}
              </button>
              {!isMine && (
                <>
                  {msg.roles?.includes('ADMIN') && <RoleBadge type="admin" />}
                  {msg.roles?.includes('OWNER') && <RoleBadge type="owner" />}
                  {messageTags}
                </>
              )}
            </span>
          )}
          {!isMine && <span className="message-time">{formatTime(msg.createdAt)}</span>}
          {isMine && readReceiptsEnabled && !deleted && (
            <button
              type="button"
              className={`message-read-state ${msg.readBy?.length ? 'read' : 'unread'}`}
              onPointerUp={onActivatePointerUp(() => onShowReads(msg.id))}
              onClick={onActivateClick(() => onShowReads(msg.id))}
            >
              {msg.readBy?.length ? `✓✓ ${msg.readBy.length}` : '✓'}
            </button>
          )}
        </div>
        {!deleted && canWrite && (
          <MessageActionBar
            pinned={actionPinned}
            onPin={(pinned) => onPinAction(msg.id, pinned)}
            onQuote={() => onQuote(msg)}
            onCopy={onCopy ? () => onCopy(msg) : undefined}
            onForward={() => onForward(msg)}
            onEdit={
              isMine && !msg.forwardedFromUsername && !msg.poll && (!!msg.content || hasAttachments)
                ? () => onEdit(msg)
                : undefined
            }
            onEmoji={(emoji) => {
              setActionDismissed(true)
              onReaction(msg, emoji)
            }}
            onRespond={onRespond && !isMine ? () => onRespond(msg) : undefined}
            canPin={canPin}
            isPinned={isPinned}
            onTogglePin={onTogglePin ? () => onTogglePin(msg) : undefined}
          />
        )}
        {!deleted && (
          <>
            {msg.quotedMessage && (
              <button
                type="button"
                className="quoted-message"
                onClick={() => onJumpToQuoted(msg.quotedMessage!.id)}
              >
                <strong>{msg.quotedMessage.username}</strong>
                <span>{msg.quotedMessage.content || 'Anexo'}</span>
              </button>
            )}
            {messageAttachments.map((attachment) => (
              <AttachmentView key={attachment.id} msg={{ ...msg, attachment }} />
            ))}
            {msg.poll && <PollCard poll={msg.poll} disabled={!canWrite} onVote={(optionId) => onVotePoll(msg, optionId)} />}
            {!msg.poll && msg.content && (
              <div className="message-content">{renderMessageContent(msg.content, currentUsername)}</div>
            )}
            {msg.reactions && msg.reactions.length > 0 && (
              <div className="message-reactions">
                {Object.entries(
                  msg.reactions.reduce<Record<string, MessageReaction[]>>(
                    (groups, reaction) => ({
                      ...groups,
                      [reaction.emoji]: [...(groups[reaction.emoji] ?? []), reaction],
                    }),
                    {},
                  ),
                ).map(([emoji, reactions]) => {
                  const mine = reactedByMe(emoji)
                  return (
                    <button
                      type="button"
                      key={emoji}
                      data-emoji={emoji}
                      className={`message-reaction${mine ? ' mine' : ''}`}
                      aria-pressed={mine}
                      aria-label={`${mine ? 'Remover minha reação' : 'Reagir também com'} ${emoji}, ${reactions.length}`}
                      title={`${reactions
                        .map((reaction) =>
                          reaction.userId === currentUserId ? `${reaction.username} (você)` : reaction.username,
                        )
                        .join(', ')} — segure para ver todos`}
                      onPointerUp={onActivatePointerUp(() => toggleMyReaction(emoji))}
                      onClick={onActivateClick(() => toggleMyReaction(emoji))}
                    >
                      {emoji} {reactions.length}
                    </button>
                  )
                })}
              </div>
            )}
            {reactionDetailsEmoji && (
              <ReactionUsersModal
                emoji={reactionDetailsEmoji}
                reactions={(msg.reactions ?? []).filter((reaction) => reaction.emoji === reactionDetailsEmoji)}
                onClose={() => setReactionDetailsEmoji(null)}
              />
            )}
          </>
        )}
        {isMine && canWrite && !deleted && msg.messageType !== 'SYSTEM' && (
          <button className="message-delete" onClick={() => onDelete(msg)} title="Excluir mensagem">
            Excluir
          </button>
        )}
      </div>
    </div>
  )
}

export const MessageRow = memo(MessageRowComponent)
