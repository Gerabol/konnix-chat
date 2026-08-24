package br.gov.pb.cge.konnix.api.admin.dto;

import br.gov.pb.cge.konnix.domain.session.Session;
import java.time.Instant;
import java.util.UUID;

public record ApiTokenResponse(UUID id, String tokenPreview, String username, String createdBy, Instant createdAt, Instant expiresAt, boolean revoked) {
    public static ApiTokenResponse from(Session session) {
        return new ApiTokenResponse(session.getId(), session.getTokenPreview(), session.getUser().getUsername(),
                session.getCreatedBy() == null ? null : session.getCreatedBy().getName(), session.getCreatedAt(),
                session.getExpiresAt(), session.getRevokedAt() != null || session.getExpiresAt().isBefore(Instant.now()));
    }
}
