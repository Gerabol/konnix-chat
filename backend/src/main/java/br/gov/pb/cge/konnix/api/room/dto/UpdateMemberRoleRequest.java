package br.gov.pb.cge.konnix.api.room.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotBlank;

import java.util.UUID;

@JsonIgnoreProperties(ignoreUnknown = true)
public record UpdateMemberRoleRequest(
        UUID userId,
        @NotBlank(message = "role é obrigatório")
        String role) {
}
