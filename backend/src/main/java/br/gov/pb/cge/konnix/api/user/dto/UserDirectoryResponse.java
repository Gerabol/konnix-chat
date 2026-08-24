package br.gov.pb.cge.konnix.api.user.dto;

import br.gov.pb.cge.konnix.domain.user.User;

import java.util.UUID;

public record UserDirectoryResponse(
        UUID id,
        String username,
        String name,
        String email,
        boolean active,
        String accountStatus,
        String presenceStatus) {

    public static UserDirectoryResponse from(User user) {
        return new UserDirectoryResponse(
                user.getId(),
                user.getUsername(),
                user.getName(),
                user.getEmail(),
                user.isActive(),
                user.getAccountStatus(),
                user.getPresenceStatus());
    }
}
