package br.gov.pb.cge.konnix.domain.message;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface MessageReadRepository extends JpaRepository<MessageRead, UUID> {
    boolean existsByMessageIdAndUserId(UUID messageId, UUID userId);
    List<MessageRead> findByMessageIdIn(List<UUID> messageIds);

    @Query("""
            select mr.message.id from MessageRead mr
            where mr.user.id = :userId and mr.message.id in :messageIds
            """)
    List<UUID> findReadMessageIds(@Param("userId") UUID userId, @Param("messageIds") List<UUID> messageIds);
}
