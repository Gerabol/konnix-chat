package br.gov.pb.cge.konnix.api.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record AppSettingsRequest(@NotBlank @Size(max = 160) String name,
                                 @Positive long maxUploadBytes) {
}
