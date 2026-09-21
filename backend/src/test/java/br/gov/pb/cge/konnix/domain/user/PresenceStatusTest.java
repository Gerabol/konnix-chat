package br.gov.pb.cge.konnix.domain.user;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class PresenceStatusTest {

    @ParameterizedTest
    @ValueSource(strings = {"online", "away", "busy", "offline", "mission", "vacation"})
    void allPresenceStatusesValid(String status) {
        assertThat(PresenceStatus.isValid(status)).isTrue();
        assertThat(PresenceStatus.normalize(status)).isEqualTo(status);
    }

    @ParameterizedTest
    @ValueSource(strings = {" ONLINE ", "Away", "BUSY", "Offline", " Mission ", "VACATION"})
    void normalizeTrimsAndLowercases(String status) {
        assertThat(PresenceStatus.isValid(status)).isTrue();
        assertThat(PresenceStatus.normalize(status)).isEqualTo(status.trim().toLowerCase());
    }

    @Test
    void invalidStatusesFallbackToOffline() {
        assertThat(PresenceStatus.isValid(null)).isFalse();
        assertThat(PresenceStatus.isValid("")).isFalse();
        assertThat(PresenceStatus.isValid("invalid")).isFalse();
        assertThat(PresenceStatus.normalize(null)).isEqualTo("offline");
        assertThat(PresenceStatus.normalize("unknown")).isEqualTo("offline");
    }
}
