package br.gov.pb.cge.konnix.api.admin.dto;

import jakarta.validation.constraints.NotBlank;

public record ApiTokenCreateRequest(@NotBlank String username, @NotBlank String password, @NotBlank String expirationDate) {}
