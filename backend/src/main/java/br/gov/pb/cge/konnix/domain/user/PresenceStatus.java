package br.gov.pb.cge.konnix.domain.user;

import java.util.Set;

public enum PresenceStatus {
    ONLINE("online"),
    AWAY("away"),
    BUSY("busy"),
    OFFLINE("offline"),
    MISSION("mission"),
    VACATION("vacation");

    public static final String ONLINE_VALUE = "online";
    public static final String AWAY_VALUE = "away";
    public static final String BUSY_VALUE = "busy";
    public static final String OFFLINE_VALUE = "offline";
    public static final String MISSION_VALUE = "mission";
    public static final String VACATION_VALUE = "vacation";

    public static final Set<String> ALL_VALUES = Set.of(
            ONLINE_VALUE,
            AWAY_VALUE,
            BUSY_VALUE,
            OFFLINE_VALUE,
            MISSION_VALUE,
            VACATION_VALUE
    );

    private final String value;

    PresenceStatus(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    public static boolean isValid(String status) {
        if (status == null) {
            return false;
        }
        return ALL_VALUES.contains(status.trim().toLowerCase());
    }

    public static String normalize(String status) {
        if (status == null || !isValid(status)) {
            return OFFLINE_VALUE;
        }
        return status.trim().toLowerCase();
    }
}
