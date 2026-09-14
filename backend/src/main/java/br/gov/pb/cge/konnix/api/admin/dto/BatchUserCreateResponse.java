package br.gov.pb.cge.konnix.api.admin.dto;

import java.util.List;

public record BatchUserCreateResponse(int total, int created, List<Error> errors) {

    public record Error(int index, String username, String code, String message) {
    }
}
