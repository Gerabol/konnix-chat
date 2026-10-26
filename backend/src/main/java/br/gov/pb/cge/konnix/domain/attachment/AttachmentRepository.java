package br.gov.pb.cge.konnix.domain.attachment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AttachmentRepository extends JpaRepository<Attachment, UUID> {

    Optional<Attachment> findByMessageId(UUID messageId);

    /**
     * Anexos enviados pelo usuário (ignora miniaturas geradas), na ordem em que
     * foram gravados. Usado ao encaminhar para não devolver a thumbnail junto.
     */
    @Query("""
            select a from Attachment a
            where a.message.id = :messageId
              and a.preview = false
            order by a.createdAt, a.id
            """)
    List<Attachment> findOriginalsByMessageId(@Param("messageId") UUID messageId);

    List<Attachment> findAllByMessageIdIn(Collection<UUID> messageIds);

    @Query("""
            select a from Attachment a
            join fetch a.message m
            join fetch a.user u
            where m.room.id = :roomId
              and m.deletedAt is null
            order by a.createdAt desc, a.id desc
            """)
    List<Attachment> findAllByRoomId(@Param("roomId") UUID roomId);

    @Query("select coalesce(sum(a.size), 0) from Attachment a")
    long totalBytes();

    /**
     * Série temporal diária de anexos enviados, ignorando miniaturas geradas.
     */
    @Query(value = """
            select to_char(date_trunc('day', a.created_at at time zone :zone), 'YYYY-MM-DD') as day,
                   count(*) as attachments
            from attachments a
            join messages m on m.id = a.message_id
            where a.is_preview = false
              and m.deleted_at is null
              and a.created_at >= :from
            group by 1
            order by 1
            """, nativeQuery = true)
    List<Object[]> countActivitySince(@Param("from") Instant from, @Param("zone") String zone);

    @Query(value = """
            select to_char(date_trunc('month', a.created_at at time zone :zone), 'YYYY-MM') as month,
                   count(*) as attachments
            from attachments a
            join messages m on m.id = a.message_id
            where a.is_preview = false
              and m.deleted_at is null
              and a.created_at >= :from
            group by 1
            order by 1
            """, nativeQuery = true)
    List<Object[]> countActivityByMonthSince(@Param("from") Instant from, @Param("zone") String zone);

    @Query(value = """
            select to_char(date_trunc('year', a.created_at at time zone :zone), 'YYYY') as year,
                   count(*) as attachments
            from attachments a
            join messages m on m.id = a.message_id
            where a.is_preview = false
              and m.deleted_at is null
            group by 1
            order by 1
            """, nativeQuery = true)
    List<Object[]> countActivityByYear(@Param("zone") String zone);
}
