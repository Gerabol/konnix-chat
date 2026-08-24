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
        boolean active) {

    public static RoomMemberResponse from(RoomMember member) {
        return new RoomMemberResponse(
                member.getId(),
                member.getUser().getId(),
                member.getUser().getUsername(),
                member.getUser().getName(),
                member.getRole(),
                member.getJoinedAt(),
                member.isActive());
    }
}
