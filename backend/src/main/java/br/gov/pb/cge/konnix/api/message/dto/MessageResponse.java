package br.gov.pb.cge.konnix.api.message.dto;

import br.gov.pb.cge.konnix.domain.attachment.Attachment;
import br.gov.pb.cge.konnix.domain.message.Message;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record MessageResponse(
        UUID id,
        UUID roomId,
        UUID userId,
        String username,
        String content,
        String messageType,
        UUID parentMessageId,
        AttachmentMetadata attachment,
        Instant createdAt,
        Instant updatedAt,
        Instant editedAt,
        Instant deletedAt,
        List<ReadReceiptResponse> readBy,
        QuotedMessage quotedMessage,
        List<MessageReactionResponse> reactions,
        String forwardedFromUsername,
        PollData poll) {

    public record QuotedMessage(UUID id, String username, String content) {}

    public MessageResponse(UUID id, UUID roomId, UUID userId, String username, String content,
                           String messageType, UUID parentMessageId, AttachmentMetadata attachment,
                           Instant createdAt, Instant updatedAt, Instant editedAt, Instant deletedAt) {
        this(id, roomId, userId, username, content, messageType, parentMessageId, attachment,
                createdAt, updatedAt, editedAt, deletedAt, List.of(), null, List.of(), null, null);
    }

    public record PollData(UUID id, String question, boolean allowMultiple, int totalMembers,
                           int totalVoters, List<PollOptionData> options) {}
    public record PollOptionData(UUID id, String label, long votes, boolean selected,
                                 List<PollVoterData> voters) {}
    public record PollVoterData(UUID userId, String username, String name, Instant votedAt) {}

    public record AttachmentMetadata(UUID id, String originalName, String mimeType, Long size) {
    }

    public static MessageResponse from(Message message) {
        return from(message, null);
    }

    public static MessageResponse from(Message message, Attachment attachment) {
        return from(message, attachment, List.of());
    }

    public static MessageResponse from(Message message, Attachment attachment,
                                       List<ReadReceiptResponse> readBy) {
        return from(message, attachment, readBy, List.of());
    }

    public static MessageResponse from(Message message, Attachment attachment,
                                       List<ReadReceiptResponse> readBy,
                                       List<MessageReactionResponse> reactions) {
        return from(message, attachment, readBy, reactions, null);
    }

    public static MessageResponse from(Message message, Attachment attachment,
                                       List<ReadReceiptResponse> readBy,
                                       List<MessageReactionResponse> reactions,
                                       PollData poll) {
        return new MessageResponse(
                message.getId(),
                message.getRoom().getId(),
                message.getUser() != null ? message.getUser().getId() : null,
                message.getUser() != null ? message.getUser().getUsername() : null,
                message.getContent(),
                message.getMessageType(),
                message.getParentMessage() != null ? message.getParentMessage().getId() : null,
                attachment != null
                        ? new AttachmentMetadata(attachment.getId(), attachment.getOriginalName(), attachment.getMimeType(), attachment.getSize())
                        : null,
                message.getCreatedAt(),
                message.getUpdatedAt(),
                message.getEditedAt(),
                message.getDeletedAt(), readBy,
                message.getParentMessage() == null ? null : new QuotedMessage(
                        message.getParentMessage().getId(),
                        message.getParentMessage().getUser() == null ? "Usuário" : message.getParentMessage().getUser().getUsername(),
                        message.getParentMessage().getContent()),
                 reactions,
                  message.getForwardedFromUser() == null ? null : message.getForwardedFromUser().getUsername(),
                  poll);
    }
}
