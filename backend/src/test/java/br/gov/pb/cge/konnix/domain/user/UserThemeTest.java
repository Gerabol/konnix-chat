package br.gov.pb.cge.konnix.domain.user;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class UserThemeTest {

    @Test
    void normalizeDefaultFallbacks() {
        assertThat(UserTheme.normalize(null)).isEqualTo("DEFAULT");
        assertThat(UserTheme.normalize("")).isEqualTo("DEFAULT");
        assertThat(UserTheme.normalize("   ")).isEqualTo("DEFAULT");
        assertThat(UserTheme.normalize("nonexistent-theme")).isEqualTo("DEFAULT");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "pink-black", "PINK-BLACK", "pink_black", "PINK_BLACK",
            "default-strong", "DEFAULT-STRONG", "default_strong", "DEFAULT_STRONG",
            "black-gray", "BLACK-GRAY", "black_gray", "BLACK_GRAY",
            "green-black", "GREEN-BLACK", "green_black", "GREEN_BLACK",
            "red-black", "RED-BLACK", "red_black", "RED_BLACK",
            "green-strong", "GREEN-STRONG",
            "pink-strong", "PINK-STRONG",
            "red-strong", "RED-STRONG",
            "dark", "DARK",
            "green", "GREEN",
            "pink", "PINK",
            "red", "RED",
            "default", "DEFAULT"
    })
    void normalizeCompoundAndSimpleThemes(String input) {
        String normalized = UserTheme.normalize(input);
        assertThat(UserTheme.isValid(normalized)).isTrue();
        assertThat(normalized).doesNotContain("-");
    }

    @Test
    void isValidChecks() {
        assertThat(UserTheme.isValid("pink-black")).isTrue();
        assertThat(UserTheme.isValid("PINK_BLACK")).isTrue();
        assertThat(UserTheme.isValid("DEFAULT-STRONG")).isTrue();
        assertThat(UserTheme.isValid("invalid_theme")).isFalse();
        assertThat(UserTheme.isValid(null)).isFalse();
        assertThat(UserTheme.isValid("  ")).isFalse();
    }
}
