package br.gov.pb.cge.konnix.api.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RequiredPasswordChangeRequest(
        @NotBlank(message = "nova senha é obrigatória")
        @Size(min = 8, max = 128, message = "deve ter entre 8 e 128 caracteres")
        String newPassword,
        @NotBlank(message = "confirmação de senha é obrigatória")
        String confirmPassword) {
}
