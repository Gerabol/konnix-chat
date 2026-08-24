package br.gov.pb.cge.konnix.api.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

public record ProfileUpdateRequest(
        @Size(max = 160) String name,
        @Email @Size(max = 254) String email) {
}
