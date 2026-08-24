package br.gov.pb.cge.konnix.api.admin.dto;

import java.util.List;
import java.util.UUID;

public record AuditOptionsResponse(List<UserOption> users, List<String> actions, List<String> resources) {
    public record UserOption(UUID id, String username, String name) {
    }
}
