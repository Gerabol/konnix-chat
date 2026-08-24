package br.gov.pb.cge.konnix.api.room.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record AddMemberRequest(
        @NotNull(message = "userId é obrigatório")
        UUID userId,

        String role) {
}
