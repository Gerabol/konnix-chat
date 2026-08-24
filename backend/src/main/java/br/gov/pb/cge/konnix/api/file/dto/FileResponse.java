package br.gov.pb.cge.konnix.api.file.dto;

import java.time.Instant;
import java.util.UUID;

public record FileResponse(
        UUID id,
        String originalName,
        String mimeType,
        Long size,
        Instant createdAt,
        UUID userId,
        String username,
        String name) {
}
