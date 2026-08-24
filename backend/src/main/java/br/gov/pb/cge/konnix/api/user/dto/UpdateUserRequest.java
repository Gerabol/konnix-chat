package br.gov.pb.cge.konnix.api.user.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

public record UpdateUserRequest(
        @Size(max = 160, message = "máximo 160 caracteres")
        String name,

        @Email(message = "inválido")
        @Size(max = 254, message = "máximo 254 caracteres")
        String email,

        @Size(min = 8, max = 128, message = "deve ter entre 8 e 128 caracteres")
        String password) {
}
