package br.gov.pb.cge.konnix.api.settings;

import jakarta.validation.constraints.NotNull;

public record AudioTranscriptionSettingRequest(@NotNull Boolean enabled) {
}
