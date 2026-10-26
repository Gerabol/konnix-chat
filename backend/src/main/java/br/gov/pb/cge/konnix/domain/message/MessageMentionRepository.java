package br.gov.pb.cge.konnix.domain.message;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface MessageMentionRepository extends JpaRepository<MessageMention, UUID> {

    @Query("""
        SELECT m.room.id, COUNT(m)
        FROM MessageMention m
        WHERE m.user.id = :userId
          AND m.room.id IN :roomIds
          AND m.readAt IS NULL
          AND m.message.deletedAt IS NULL
        GROUP BY m.room.id
    """)
    List<Object[]> countUnreadByRoomIds(@Param("roomIds") List<UUID> roomIds, @Param("userId") UUID userId);

    @Query("""
        SELECT COUNT(m)
        FROM MessageMention m
        WHERE m.user.id = :userId
          AND m.room.id = :roomId
          AND m.readAt IS NULL
          AND m.message.deletedAt IS NULL
    """)
    long countUnreadByRoomId(@Param("roomId") UUID roomId, @Param("userId") UUID userId);

    @Modifying
    @Query("""
        UPDATE MessageMention m
        SET m.readAt = :readAt
        WHERE m.room.id = :roomId
          AND m.user.id = :userId
          AND m.readAt IS NULL
    """)
    int markRoomMentionsAsRead(@Param("roomId") UUID roomId, @Param("userId") UUID userId, @Param("readAt") Instant readAt);

    List<MessageMention> findByMessageId(UUID messageId);
}
