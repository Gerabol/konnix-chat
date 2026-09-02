package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.domain.room.Room;
import br.gov.pb.cge.konnix.domain.room.RoomMemberRepository;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class RoomAccessService {

    public static final String ROLE_OWNER = "OWNER";

    private final RoomMemberRepository roomMemberRepository;

    public RoomAccessService(RoomMemberRepository roomMemberRepository) {
        this.roomMemberRepository = roomMemberRepository;
    }

    public boolean isRoomOwner(UUID roomId, UUID userId) {
        return roomMemberRepository.findByRoomIdAndUserId(roomId, userId)
                .map(member -> member.isActive() && ROLE_OWNER.equals(member.getRole()))
                .orElse(false);
    }

    public boolean canWriteToRoom(Room room, UUID userId, boolean isAdmin) {
        if (!room.isReadOnly()) return true;
        return isAdmin || isRoomOwner(room.getId(), userId);
    }
}
