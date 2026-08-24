package br.gov.pb.cge.konnix.api.message.dto;

import br.gov.pb.cge.konnix.domain.message.MessageRead;

import java.time.Instant;
import java.util.UUID;

public record ReadReceiptResponse(UUID userId, String username, String name, Instant readAt) {
    public static ReadReceiptResponse from(MessageRead read) {
        return new ReadReceiptResponse(read.getUser().getId(), read.getUser().getUsername(),
                read.getUser().getName(), read.getReadAt());
    }
}
