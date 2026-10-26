package br.gov.pb.cge.konnix.api.settings;

import jakarta.validation.constraints.NotNull;

/**
 * Corpo padrão dos toggles booleanos de sistema (ex.: confirmação de leitura,
 * transcrição de áudio), expostos em {@code /api/v1/settings/**}.
 */
public record SettingToggleRequest(@NotNull Boolean enabled) {
}