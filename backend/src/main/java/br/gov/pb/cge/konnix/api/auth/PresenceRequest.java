package br.gov.pb.cge.konnix.api.auth;

import jakarta.validation.constraints.NotBlank;

public record PresenceRequest(@NotBlank String status) {
}
