package br.gov.pb.cge.konnix.api.user.dto;

import java.util.List;

public record ImportUsersResponse(
        int totalProcessed,
        int createdCount,
        int updatedCount,
        int skippedCount,
        List<ImportUserResult> results
) {
    public record ImportUserResult(
            String username,
            String status,
            String message
    ) {
    }
}
