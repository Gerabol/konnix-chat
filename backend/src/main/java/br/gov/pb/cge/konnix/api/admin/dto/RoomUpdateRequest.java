package br.gov.pb.cge.konnix.api.admin.dto;

import jakarta.validation.constraints.Size;

public record RoomUpdateRequest(
        @Size(max = 160) String name,
        @Size(max = 160) String displayName,
        Boolean readOnly) {
}
