package br.gov.pb.cge.konnix.api.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank(message = "obrigatório") String username,
        @NotBlank(message = "obrigatório") String password) {
}
