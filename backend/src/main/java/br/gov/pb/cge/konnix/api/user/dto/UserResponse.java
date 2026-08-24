package br.gov.pb.cge.konnix.api.user.dto;

import br.gov.pb.cge.konnix.domain.user.Role;
import br.gov.pb.cge.konnix.domain.user.User;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

public record UserResponse(
        UUID id,
        String username,
        String name,
        String email,
        boolean active,
        String accountStatus,
        String userType,
        String presenceStatus,
        String theme,
        boolean passwordMigrationRequired,
        boolean passwordChangeRequired,
        List<String> roles,
        Instant createdAt,
        Instant updatedAt) {

    public static UserResponse from(User user) {
        List<String> roles = user.getRoles().stream()
                .map(Role::getName)
                .sorted(Comparator.naturalOrder())
                .toList();
        return new UserResponse(
                user.getId(),
                user.getUsername(),
                user.getName(),
                user.getEmail(),
                user.isActive(),
                user.getAccountStatus(),
                user.getUserType(),
                user.getPresenceStatus(),
                user.getTheme(),
                user.isPasswordMigrationRequired(),
                user.isPasswordChangeRequired(),
                roles,
                user.getCreatedAt(),
                user.getUpdatedAt());
    }
}
