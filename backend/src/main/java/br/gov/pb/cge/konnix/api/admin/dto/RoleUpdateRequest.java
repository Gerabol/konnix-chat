package br.gov.pb.cge.konnix.api.admin.dto;

import jakarta.validation.constraints.NotEmpty;

import java.util.Set;

public record RoleUpdateRequest(@NotEmpty Set<String> roles) {
}
