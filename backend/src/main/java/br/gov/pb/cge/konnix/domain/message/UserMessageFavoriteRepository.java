package br.gov.pb.cge.konnix.domain.message;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserMessageFavoriteRepository extends JpaRepository<UserMessageFavorite, UUID> {

    boolean existsByUserIdAndMessageId(UUID userId, UUID messageId);

    Optional<UserMessageFavorite> findByUserIdAndMessageId(UUID userId, UUID messageId);

    @Modifying
    @Query("delete from UserMessageFavorite f where f.user.id = :userId and f.message.id = :messageId")
    int deleteByUserIdAndMessageId(@Param("userId") UUID userId, @Param("messageId") UUID messageId);

    @Query("""
            select f.message.id from UserMessageFavorite f
            where f.user.id = :userId
              and f.message.room.id = :roomId
              and f.message.deletedAt is null
            """)
    List<UUID> findFavoriteMessageIdsByUserIdAndRoomId(@Param("userId") UUID userId, @Param("roomId") UUID roomId);

    @Query("""
            select f from UserMessageFavorite f
            join fetch f.message m
            join fetch m.room r
            left join fetch m.user u
            where f.user.id = :userId
              and m.deletedAt is null
              and (:roomId is null or r.id = :roomId)
            order by f.createdAt desc
            """)
    List<UserMessageFavorite> findFavoritesByUserId(@Param("userId") UUID userId, @Param("roomId") UUID roomId);
}
