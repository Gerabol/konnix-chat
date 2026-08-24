package br.gov.pb.cge.konnix.api.room.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateRoomRequest(
        @NotBlank(message = "name é obrigatório")
        @Size(max = 160, message = "name deve ter no máximo 160 caracteres")
        String name,

        @Size(max = 160, message = "displayName deve ter no máximo 160 caracteres")
        String displayName,

        @NotBlank(message = "type é obrigatório")
        @Pattern(regexp = "CHANNEL|PRIVATE_GROUP", message = "type deve ser CHANNEL ou PRIVATE_GROUP")
        String type) {
}
