package br.gov.pb.cge.konnix.domain.attachment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AttachmentRepository extends JpaRepository<Attachment, UUID> {

    Optional<Attachment> findByMessageId(UUID messageId);

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
}
