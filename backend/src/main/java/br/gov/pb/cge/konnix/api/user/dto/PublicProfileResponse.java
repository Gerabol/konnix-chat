package br.gov.pb.cge.konnix.api.user.dto;

import br.gov.pb.cge.konnix.domain.user.User;

import java.util.UUID;

public record PublicProfileResponse(UUID id, String username, String name, String email, String presenceStatus) {
    public static PublicProfileResponse from(User user) {
        return new PublicProfileResponse(user.getId(), user.getUsername(), user.getName(), user.getEmail(), user.getPresenceStatus());
    }
}
