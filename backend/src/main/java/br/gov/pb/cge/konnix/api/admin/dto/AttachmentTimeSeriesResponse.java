package br.gov.pb.cge.konnix.api.admin.dto;

import java.util.List;

public record AttachmentTimeSeriesResponse(
        String granularity,
        String period,
        long totalAttachments,
        double averageAttachments,
        long peakAttachments,
        String peakPeriodLabel,
        List<Point> points
) {
    public record Point(
            String dateKey,
            String label,
            long attachments
    ) {}
}
