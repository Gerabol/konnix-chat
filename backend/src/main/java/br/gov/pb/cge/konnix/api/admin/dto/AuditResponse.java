package br.gov.pb.cge.konnix.api.admin.dto;

import br.gov.pb.cge.konnix.domain.audit.AuditLog;

import java.time.Instant;
import java.util.UUID;

public record AuditResponse(UUID id, UUID userId, String username, String name, String action,
                            String resource, String resourceId, String ipAddress, Instant createdAt) {
    public static AuditResponse from(AuditLog log) {
        return new AuditResponse(log.getId(), log.getUser() == null ? null : log.getUser().getId(),
                log.getUser() == null ? null : log.getUser().getUsername(),
                log.getUser() == null ? null : log.getUser().getName(), log.getAction(),
                log.getResource(), log.getResourceId(), log.getIpAddress(), log.getCreatedAt());
    }
}
