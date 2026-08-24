package br.gov.pb.cge.konnix.api.push.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PushSubscribeRequest(
        @NotBlank(message = "endpoint é obrigatório")
        @Size(max = 2048, message = "endpoint deve ter no máximo 2048 caracteres")
        String endpoint,

        @NotBlank(message = "p256dh é obrigatório")
        @Size(max = 1024, message = "p256dh deve ter no máximo 1024 caracteres")
        String p256dh,

        @NotBlank(message = "auth é obrigatório")
        @Size(max = 1024, message = "auth deve ter no máximo 1024 caracteres")
        String auth) {
}
