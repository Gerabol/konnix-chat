package br.gov.pb.cge.konnix.api.admin.dto;

public record MonitoringMetricsResponse(
        long totalFiles,
        long totalFileBytes,
        long totalMessages,
        long totalUsers,
        long activeUsers,
        long readOnlyUsers,
        long disabledUsers,
        long totalGroups,
        long totalChannels,
        long dailyLogins,
        long activeSessions,
        long totalAuditEvents,
        long databaseSizeBytes) {
}
