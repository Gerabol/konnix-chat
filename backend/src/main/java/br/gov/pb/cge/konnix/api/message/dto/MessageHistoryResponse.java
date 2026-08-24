package br.gov.pb.cge.konnix.api.message.dto;

import java.time.Instant;
import java.util.List;

public record MessageHistoryResponse(
        List<MessageResponse> messages,
        boolean hasMore,
        Instant nextBefore) {
}
