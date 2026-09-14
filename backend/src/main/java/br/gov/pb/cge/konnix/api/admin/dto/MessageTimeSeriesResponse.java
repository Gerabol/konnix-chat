package br.gov.pb.cge.konnix.api.admin.dto;

import java.util.List;

public record MessageTimeSeriesResponse(
        String granularity,
        String period,
        long totalMessages,
        long totalActiveUsers,
        double averageMessages,
        long peakMessages,
        String peakPeriodLabel,
        List<Point> points
) {
    public record Point(
            String dateKey,
            String label,
            long messages,
            long activeUsers
    ) {}
}
