package br.gov.pb.cge.konnix.api.push.dto;

import br.gov.pb.cge.konnix.domain.push.PushSubscription;

import java.time.Instant;
import java.util.UUID;

public record PushSubscriptionResponse(UUID id, String endpoint, Instant createdAt) {

    public static PushSubscriptionResponse from(PushSubscription subscription) {
        return new PushSubscriptionResponse(
                subscription.getId(),
                subscription.getEndpoint(),
                subscription.getCreatedAt());
    }
}
