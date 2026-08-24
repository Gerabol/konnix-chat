package br.gov.pb.cge.konnix.security;

import java.util.Set;
import java.util.UUID;

public record AuthenticatedUser(UUID id, String username, String name, Set<String> roles) {

    public boolean hasRole(String role) {
        return roles != null && roles.contains(role);
    }
}
