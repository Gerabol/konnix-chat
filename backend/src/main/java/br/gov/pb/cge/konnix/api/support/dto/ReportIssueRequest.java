package br.gov.pb.cge.konnix.api.support.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ReportIssueRequest(
        @NotBlank(message = "O relato não pode estar em branco")
        @Size(max = 2000, message = "O relato não pode exceder 2000 caracteres")
        String content
) {}