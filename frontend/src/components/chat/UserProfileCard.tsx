import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { roomAvatarPath, userAvatarPath } from '../../api'
import type { PublicProfile, Room, RoomMember } from '../../api'
import { presenceLabel } from '../../utils/presence'
import { getRoomIcon, roomDisplayName } from '../../utils/room'
import { AvatarImage, initials } from './AvatarImage'
import { MessageCircleIcon } from '../icons'

export function usePopoverDismiss(cardRef: RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [cardRef, onClose])
}

export function UserProfileCard({
  profile,
  loading,
  commonRooms,
  commonRoomsLoading,
  position,
  onClose,
  onContact,
  onOpenRoom,
}: {
  profile: PublicProfile | null
  loading: boolean
  commonRooms: Room[]
  commonRoomsLoading: boolean
  position: { top: number; left: number }
  onClose: () => void
  onContact?: () => void
  onOpenRoom?: (roomId: string) => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  usePopoverDismiss(cardRef, onClose)

  return (
    <div
      ref={cardRef}
      className="user-profile-card"
      style={{ top: position.top, left: position.left }}
      role="dialog"
      aria-label="Contato do usuário"
    >
      <button type="button" className="user-profile-close" onClick={onClose} aria-label="Fechar">
        ×
      </button>
      {loading && <div className="profile-loading">Carregando...</div>}
      {!loading && profile && (
        <div className="profile-content">
          <span className="profile-avatar-wrap">
            <AvatarImage
              path={`${userAvatarPath(profile.id)}?profile=${encodeURIComponent(profile.id)}`}
              className="profile-avatar"
              fallback={<span className="profile-avatar">{initials(profile.name || profile.username)}</span>}
              alt={profile.name}
            />
            <span
              className={`profile-presence-dot presence-${profile.presenceStatus}`}
              aria-label={`Status: ${presenceLabel(profile.presenceStatus)}`}
            />
          </span>
          <div className="profile-details">
            <strong className="profile-name">{profile.name || profile.username}</strong>
            <div className="profile-info-table">
              <div className="profile-info-row">
                <span>Username</span>
                <strong>@{profile.username}</strong>
              </div>
              <div className="profile-info-row">
                <span>Email</span>
                <strong>{profile.email || 'E-mail não informado'}</strong>
              </div>
              <div className="profile-info-row">
                <span>Status</span>
                <strong className={`profile-status presence-${profile.presenceStatus}`}>
                  {presenceLabel(profile.presenceStatus)}
                </strong>
              </div>
            </div>
            <section className="profile-common-rooms" aria-label="Grupos e canais em comum">
              <strong>Grupos e canais em comum</strong>
              {commonRoomsLoading && <span className="profile-common-rooms-empty">Carregando...</span>}
              {!commonRoomsLoading && commonRooms.length === 0 && (
                <span className="profile-common-rooms-empty">Nenhum grupo ou canal em comum.</span>
              )}
              {!commonRoomsLoading && commonRooms.length > 0 && (
                <div className="profile-common-rooms-list">
                  {commonRooms.map((room) => (
                    <button
                      type="button"
                      key={room.id}
                      className="profile-common-room"
                      title={`Abrir ${room.type === 'CHANNEL' ? 'canal' : 'grupo'} ${room.displayName || room.name}`}
                      aria-label={`Abrir ${room.type === 'CHANNEL' ? 'canal' : 'grupo'} ${room.displayName || room.name}`}
                      disabled={!onOpenRoom}
                      onClick={() => onOpenRoom && onOpenRoom(room.id)}
                    >
                      <b>{room.type === 'CHANNEL' ? '#' : '🔒'}</b>
                      {room.displayName || room.name}
                    </button>
                  ))}
                </div>
              )}
            </section>
            {onContact && (
              <button
                type="button"
                className="profile-contact-button"
                onClick={onContact}
                title="Conversar com este usuário"
                aria-label="Conversar com este usuário"
              >
                <MessageCircleIcon />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function RoomInfoCard({
  room,
  members,
  position,
  onClose,
}: {
  room: Room
  members: RoomMember[]
  position: { top: number; left: number }
  onClose: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  usePopoverDismiss(cardRef, onClose)
  const activeMembers = members.filter((member) => member.active)
  const owners = activeMembers.filter((member) => member.role.toUpperCase() === 'OWNER')
  const name = roomDisplayName(room)

  return (
    <div
      ref={cardRef}
      className="user-profile-card room-info-card"
      style={{ top: position.top, left: position.left }}
      role="dialog"
      aria-label={`Informações de ${name}`}
    >
      <button type="button" className="user-profile-close" onClick={onClose} aria-label="Fechar">
        ×
      </button>
      <div className="profile-content room-info-content">
        <AvatarImage
          path={`${roomAvatarPath(room.id)}?v=${encodeURIComponent(room.updatedAt)}`}
          className="profile-avatar"
          fallback={<span className="profile-avatar room-info-fallback">{getRoomIcon(room)}</span>}
          alt={name}
        />
        <div className="profile-details">
          <strong className="profile-name">{name}</strong>
          <div className="profile-info-table">
            <div className="profile-info-row">
              <span>Participantes</span>
              <strong>
                {activeMembers.length} participante{activeMembers.length === 1 ? '' : 's'}
              </strong>
            </div>
          </div>
        </div>
        <section className="room-info-owners">
          <h4>Proprietários</h4>
          {owners.length === 0 && <span className="room-info-empty">Nenhum proprietário definido.</span>}
          {owners.map((owner) => (
            <div className="room-info-owner" key={owner.userId}>
              <AvatarImage
                path={`${userAvatarPath(owner.userId)}?v=${encodeURIComponent(owner.joinedAt)}`}
                className="room-info-owner-avatar"
                fallback={<span className="room-info-owner-avatar">{initials(owner.name || owner.username)}</span>}
                alt={owner.name || owner.username}
              />
              <strong>{owner.name || owner.username}</strong>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
