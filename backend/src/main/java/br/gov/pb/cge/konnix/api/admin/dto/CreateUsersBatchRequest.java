package br.gov.pb.cge.konnix.api.admin.dto;

import br.gov.pb.cge.konnix.api.user.dto.CreateUserRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Set;

public record CreateUsersBatchRequest(
        @NotEmpty(message = "obrigatório")
        @Size(min = 1, max = 500, message = "deve conter entre 1 e 500 usuários")
        List<@Valid CreateUserRequest> users,
        Set<String> roles) {

    public Set<String> effectiveRoles() {
        return roles == null || roles.isEmpty() ? Set.of("USER") : roles;
    }
}
