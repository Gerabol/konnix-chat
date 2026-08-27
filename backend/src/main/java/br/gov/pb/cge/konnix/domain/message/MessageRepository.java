package br.gov.pb.cge.konnix.domain.message;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface MessageRepository extends JpaRepository<Message, UUID> {

    @Query("""
            select m from Message m
            where m.room.id = :roomId
              and m.deletedAt is null
              and m.createdAt < :before
            """)
    List<Message> findBefore(@Param("roomId") UUID roomId, @Param("before") Instant before, Pageable pageable);

    @Query("""
            select m from Message m
            where m.room.id = :roomId
              and m.deletedAt is null
            """)
    List<Message> findLatest(@Param("roomId") UUID roomId, Pageable pageable);

    @Query("""
            select m from Message m
            where m.room.id = :roomId
              and m.deletedAt is null
              and lower(m.content) like lower(concat('%', :query, '%'))
            order by m.createdAt desc
            """)
    List<Message> searchInRoom(@Param("roomId") UUID roomId, @Param("query") String query, Pageable pageable);

    long countByRoomIdAndDeletedAtIsNull(UUID roomId);

                @Query(value = """
                                                select to_char(date_trunc('day', created_at at time zone :zone), 'YYYY-MM-DD') as day,
                                                                         count(*) as messages,
                                                                         count(distinct user_id) as active_users
                                                from messages
                                                where deleted_at is null
                                                        and created_at >= :from
                                                group by 1
                                                order by 1
                                                """, nativeQuery = true)
                List<Object[]> countActivitySince(@Param("from") Instant from, @Param("zone") String zone);

    @Query("""
            select m from Message m
            where m.room.id = :roomId
              and m.deletedAt is null
              and m.user is not null and m.user.id <> :userId
              and not exists (select mr.id from MessageRead mr
                              where mr.message.id = m.id and mr.user.id = :userId)
            order by m.createdAt asc, m.id asc
            """)
    List<Message> findUnreadByRoomId(@Param("roomId") UUID roomId, @Param("userId") UUID userId);

    @Query("""
            select m.room.id, max(m.createdAt) from Message m
            where m.room.id in :roomIds
              and m.deletedAt is null
            group by m.room.id
            """)
    List<Object[]> findLastCreatedAtByRoomIds(@Param("roomIds") List<UUID> roomIds);

    @Query("""
            select m.room.id, count(m) from Message m
            where m.room.id in :roomIds
              and m.deletedAt is null
              and m.user is not null and m.user.id <> :userId
              and not exists (select mr.id from MessageRead mr
                              where mr.message.id = m.id and mr.user.id = :userId)
            group by m.room.id
            """)
    List<Object[]> countUnreadByRoomIds(@Param("roomIds") List<UUID> roomIds,
                                        @Param("userId") UUID userId);
}
