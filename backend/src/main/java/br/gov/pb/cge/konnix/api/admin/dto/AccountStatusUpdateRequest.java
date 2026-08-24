package br.gov.pb.cge.konnix.api.admin.dto;

import jakarta.validation.constraints.NotBlank;

public record AccountStatusUpdateRequest(@NotBlank String status) {
}
