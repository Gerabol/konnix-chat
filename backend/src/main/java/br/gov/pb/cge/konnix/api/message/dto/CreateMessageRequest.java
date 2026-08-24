package br.gov.pb.cge.konnix.api.message.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record CreateMessageRequest(
        @NotBlank(message = "content é obrigatório")
        @Size(max = 10000, message = "content deve ter no máximo 10000 caracteres")
        String content,

        UUID parentMessageId,

        UUID forwardedMessageId) {
}
