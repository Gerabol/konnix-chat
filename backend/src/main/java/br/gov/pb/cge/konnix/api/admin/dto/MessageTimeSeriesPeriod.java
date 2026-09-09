package br.gov.pb.cge.konnix.api.admin.dto;

public enum MessageTimeSeriesPeriod {
    DAYS_7("day", 7),
    DAYS_30("day", 30),
    DAYS_90("day", 90),
    MONTHS_12("month", 12),
    YEARS("year", 0);

    private final String granularity;
    private final int count;

    MessageTimeSeriesPeriod(String granularity, int count) {
        this.granularity = granularity;
        this.count = count;
    }

    public String getGranularity() {
        return granularity;
    }

    public int getCount() {
        return count;
    }

    public static MessageTimeSeriesPeriod fromString(String value) {
        if (value == null || value.isBlank()) {
            return DAYS_7;
        }
        try {
            return MessageTimeSeriesPeriod.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return switch (value.trim().toLowerCase()) {
                case "7", "7d", "days_7" -> DAYS_7;
                case "30", "30d", "days_30" -> DAYS_30;
                case "90", "90d", "days_90" -> DAYS_90;
                case "12", "12m", "months_12" -> MONTHS_12;
                case "year", "years" -> YEARS;
                default -> DAYS_7;
            };
        }
    }
}
