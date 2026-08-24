package br.gov.pb.cge.konnix.api.push.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PushUnsubscribeRequest(
        @NotBlank(message = "endpoint é obrigatório")
        @Size(max = 2048, message = "endpoint deve ter no máximo 2048 caracteres")
        String endpoint) {
}
