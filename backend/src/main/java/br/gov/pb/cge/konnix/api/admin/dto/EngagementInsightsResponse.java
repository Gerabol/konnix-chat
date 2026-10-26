package br.gov.pb.cge.konnix.api.admin.dto;

import java.util.List;

public record EngagementInsightsResponse(
        String period,
        long totalActiveUsers,
        long totalAbsentUsers,
        List<ThemeUsage> themeUsage,
        List<TopUser> topUsers,
        List<AbsentUser> absentUsers
) {
    public record ThemeUsage(String theme, long users) {
    }

    public record TopUser(String userId, String username, String name, long messages) {
    }

    public record AbsentUser(String id, String username, String name, String email,
                             String presenceStatus, String theme) {
    }
}
