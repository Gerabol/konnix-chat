package br.gov.pb.cge.konnix.api.user.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ImportUserItem(
        @NotBlank(message = "obrigatório")
        @Size(min = 3, max = 60, message = "deve ter entre 3 e 60 caracteres")
        String username,

        @NotBlank(message = "obrigatório")
        @Size(max = 160, message = "máximo 160 caracteres")
        String name,

        @Email(message = "inválido")
        @Size(max = 254, message = "máximo 254 caracteres")
        String email,

        Boolean active
) {
}
