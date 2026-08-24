package br.gov.pb.cge.konnix.api.message.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateMessageRequest(
        @NotBlank(message = "content é obrigatório")
        @Size(max = 10000, message = "content deve ter no máximo 10000 caracteres")
        String content) {
}
