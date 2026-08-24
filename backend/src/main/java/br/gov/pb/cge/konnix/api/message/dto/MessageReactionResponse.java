package br.gov.pb.cge.konnix.api.message.dto;
import br.gov.pb.cge.konnix.domain.message.MessageReaction;
import java.time.Instant;
import java.util.UUID;
public record MessageReactionResponse(UUID id, UUID messageId, UUID userId, String username, String emoji, Instant createdAt) {
    public static MessageReactionResponse from(MessageReaction r) {
        return new MessageReactionResponse(r.getId(), r.getMessage().getId(), r.getUser().getId(), r.getUser().getUsername(), r.getEmoji(), r.getCreatedAt());
    }
}
