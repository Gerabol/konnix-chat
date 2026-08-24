package br.gov.pb.cge.konnix.api.dto;

import br.gov.pb.cge.konnix.api.user.dto.UserResponse;

public record LoginResponse(String token, UserResponse user) {
}
