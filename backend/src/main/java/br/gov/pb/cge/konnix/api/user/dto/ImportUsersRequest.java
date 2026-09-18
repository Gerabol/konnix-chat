package br.gov.pb.cge.konnix.api.user.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record ImportUsersRequest(
        String defaultPassword,
        @NotEmpty(message = "A lista de usuários não pode estar vazia")
        List<@Valid ImportUserItem> users
) {
}
