package br.gov.pb.cge.konnix.api.message.dto;

import java.time.Instant;
import java.util.UUID;

public record FavoriteMessageResponse(
        UUID favoriteId,
        Instant favoritedAt,
        UUID roomId,
        String roomName,
        String roomType,
        MessageResponse message
) {
}
