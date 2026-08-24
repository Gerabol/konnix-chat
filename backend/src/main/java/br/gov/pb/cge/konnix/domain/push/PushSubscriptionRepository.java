package br.gov.pb.cge.konnix.domain.push;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PushSubscriptionRepository extends JpaRepository<PushSubscription, UUID> {

    Optional<PushSubscription> findByEndpoint(String endpoint);

    List<PushSubscription> findAllByUserId(UUID userId);

    void deleteByUserIdAndEndpoint(UUID userId, String endpoint);

    @Query("""
            select ps from PushSubscription ps
            where ps.user.id in (select rm.user.id from RoomMember rm where rm.room.id = :roomId)
            """)
    List<PushSubscription> findByRoomId(@Param("roomId") UUID roomId);
}
