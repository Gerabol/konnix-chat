package br.gov.pb.cge.konnix.api.auth;

import jakarta.validation.constraints.Size;

public record ThemeUpdateRequest(@Size(max = 20) String theme) {
}
