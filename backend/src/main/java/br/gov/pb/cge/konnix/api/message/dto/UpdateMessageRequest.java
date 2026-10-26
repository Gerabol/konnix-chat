package br.gov.pb.cge.konnix.api.message.dto;

import jakarta.validation.constraints.Size;

/**
 * O texto pode ficar vazio: mensagens com anexo continuam válidas sem legenda.
 * A obrigatoriedade do texto sem anexo é validada em MessageService, que é quem
 * conhece os anexos da mensagem.
 */
public record UpdateMessageRequest(
        @Size(max = 10000, message = "content deve ter no máximo 10000 caracteres")
        String content) {
}
