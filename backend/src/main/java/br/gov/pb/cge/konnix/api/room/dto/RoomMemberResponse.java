package br.gov.pb.cge.konnix.api.room.dto;

import br.gov.pb.cge.konnix.domain.room.RoomMember;

import java.time.Instant;
import java.util.UUID;

public record RoomMemberResponse(
        UUID id,
        UUID userId,
        String username,
        String name,
        String role,
        Instant joinedAt,
        boolean active,
        String accountStatus) {

    public static RoomMemberResponse from(RoomMember member) {
        var user = member.getUser();
        String accountStatus = null;
        if (user != null) {
            accountStatus = user.getAccountStatus();
            if (accountStatus == null || accountStatus.isBlank()) {
                accountStatus = user.isActive() ? "ACTIVE" : "DISABLED";
            }
        }
        return new RoomMemberResponse(
                member.getId(),
                user != null ? user.getId() : null,
                user != null ? user.getUsername() : null,
                user != null ? user.getName() : null,
                member.getRole(),
                member.getJoinedAt(),
                member.isActive(),
                accountStatus);
    }
}
