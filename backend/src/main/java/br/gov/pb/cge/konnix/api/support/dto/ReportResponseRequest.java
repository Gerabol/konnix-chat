package br.gov.pb.cge.konnix.api.support.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record ReportResponseRequest(
        @NotNull(message = "ID da mensagem é obrigatório")
        UUID messageId,

        @NotBlank(message = "A resposta não pode estar em branco")
        @Size(max = 2000, message = "A resposta não pode exceder 2000 caracteres")
        String content
) {}
