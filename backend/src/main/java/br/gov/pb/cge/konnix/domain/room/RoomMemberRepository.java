package br.gov.pb.cge.konnix.domain.room;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RoomMemberRepository extends JpaRepository<RoomMember, UUID> {

    Optional<RoomMember> findByRoomIdAndUserId(UUID roomId, UUID userId);

    boolean existsByRoomIdAndUserId(UUID roomId, UUID userId);

    List<RoomMember> findByRoomId(UUID roomId);

    List<RoomMember> findByRoomIdIn(List<UUID> roomIds);

    List<RoomMember> findByUserId(UUID userId);

    @Query("""
            select distinct rm.room.id from RoomMember rm
            where rm.user.id = :userA
              and rm.room.type = 'DIRECT'
              and exists (select 1 from RoomMember rm2 where rm2.room.id = rm.room.id and rm2.user.id = :userB)
            """)
    List<UUID> findDirectRoomIds(@Param("userA") UUID userA, @Param("userB") UUID userB);

    @Query("""
            select distinct rm.room.id from RoomMember rm
            where rm.user.id = :userId
              and rm.room.type = 'DIRECT'
              and (select count(rm2) from RoomMember rm2 where rm2.room.id = rm.room.id) = 1
            """)
    List<UUID> findSelfDirectRoomIds(@Param("userId") UUID userId);
}
