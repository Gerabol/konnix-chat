package br.gov.pb.cge.konnix.api.poll.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CreatePollRequest(
        @NotBlank @Size(max = 500) String question,
        @NotEmpty @Size(min = 2, max = 10) List<@NotBlank @Size(max = 255) String> options,
        boolean allowMultiple) {
}
