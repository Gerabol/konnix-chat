package br.gov.pb.cge.konnix.api.room.dto;

import br.gov.pb.cge.konnix.api.message.dto.MessageResponse;
import br.gov.pb.cge.konnix.domain.room.Room;

import java.time.Instant;
import java.util.UUID;

public record RoomResponse(
        UUID id,
        String name,
        String displayName,
        String type,
        UUID createdBy,
        boolean readOnly,
        boolean hidden,
        Instant createdAt,
        Instant updatedAt,
        Instant lastActivityAt,
        long unreadCount,
        DirectPartner directPartner,
        boolean favorite,
        MessageResponse pinnedMessage,
        boolean markedUnread,
        long unreadMentionsCount) {

    public record DirectPartner(UUID userId, String username, String name, String email, String accountStatus, String presenceStatus) {
    }

    public static RoomResponse from(Room room) {
        return from(room, null);
    }

    public static RoomResponse from(Room room, DirectPartner directPartner) {
        return from(room, directPartner, null);
    }

    public static RoomResponse from(Room room, DirectPartner directPartner, Instant lastActivityAt) {
        return from(room, directPartner, lastActivityAt, 0);
    }

    public static RoomResponse from(Room room, DirectPartner directPartner, Instant lastActivityAt,
                                    long unreadCount) {
        return from(room, directPartner, lastActivityAt, unreadCount, false);
    }

    public static RoomResponse from(Room room, DirectPartner directPartner, Instant lastActivityAt,
                                    long unreadCount, boolean favorite) {
        return from(room, directPartner, lastActivityAt, unreadCount, favorite,
                room.getPinnedMessage() != null && room.getPinnedMessage().getDeletedAt() == null
                        ? MessageResponse.from(room.getPinnedMessage()) : null, false);
    }

    public static RoomResponse from(Room room, DirectPartner directPartner, Instant lastActivityAt,
                                    long unreadCount, boolean favorite, MessageResponse pinnedMessage) {
        return from(room, directPartner, lastActivityAt, unreadCount, favorite, pinnedMessage, false);
    }

    public static RoomResponse from(Room room, DirectPartner directPartner, Instant lastActivityAt,
                                    long unreadCount, boolean favorite, MessageResponse pinnedMessage,
                                    boolean markedUnread) {
        return from(room, directPartner, lastActivityAt, unreadCount, favorite, pinnedMessage, markedUnread, 0);
    }

    public static RoomResponse from(Room room, DirectPartner directPartner, Instant lastActivityAt,
                                    long unreadCount, boolean favorite, MessageResponse pinnedMessage,
                                    boolean markedUnread, long unreadMentionsCount) {
        return new RoomResponse(
                room.getId(),
                room.getName(),
                room.getDisplayName(),
                room.getType(),
                room.getCreatedBy() != null ? room.getCreatedBy().getId() : null,
                room.isReadOnly(),
                room.isHidden(),
                room.getCreatedAt(),
                room.getUpdatedAt(),
                lastActivityAt,
                unreadCount,
                directPartner,
                favorite,
                pinnedMessage,
                markedUnread,
                unreadMentionsCount);
    }
}
