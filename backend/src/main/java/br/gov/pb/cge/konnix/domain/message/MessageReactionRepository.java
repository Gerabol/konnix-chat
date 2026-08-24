package br.gov.pb.cge.konnix.domain.message;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface MessageReactionRepository extends JpaRepository<MessageReaction, UUID> {
    Optional<MessageReaction> findByMessageIdAndUserIdAndEmoji(UUID messageId, UUID userId, String emoji);
    List<MessageReaction> findByMessageIdIn(List<UUID> messageIds);
    @Query("select count(distinct r.emoji) from MessageReaction r where r.message.id = :messageId")
    long countDistinctEmojiByMessageId(@Param("messageId") UUID messageId);
}
