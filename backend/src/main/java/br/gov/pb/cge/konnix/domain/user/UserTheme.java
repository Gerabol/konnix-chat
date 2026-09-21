package br.gov.pb.cge.konnix.domain.user;

public enum UserTheme {
    DEFAULT,
    DARK,
    BLACK_GRAY,
    PINK,
    GREEN,
    RED,
    GREEN_BLACK,
    PINK_BLACK,
    RED_BLACK,
    DEFAULT_STRONG,
    GREEN_STRONG,
    PINK_STRONG,
    RED_STRONG;

    public static String normalize(String value) {
        if (value == null || value.isBlank()) {
            return DEFAULT.name();
        }
        try {
            String normalized = value.trim().toUpperCase().replace('-', '_');
            valueOf(normalized);
            return normalized;
        } catch (RuntimeException e) {
            return DEFAULT.name();
        }
    }

    public static boolean isValid(String value) {
        if (value == null || value.isBlank()) {
            return false;
        }
        try {
            valueOf(value.trim().toUpperCase().replace('-', '_'));
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }
}
