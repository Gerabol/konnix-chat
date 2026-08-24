package br.gov.pb.cge.konnix.api.settings;

import jakarta.validation.constraints.NotNull;

public record ReadReceiptSettingRequest(@NotNull Boolean enabled) {
}
