package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.push.dto.PushSubscribeRequest;
import br.gov.pb.cge.konnix.api.push.dto.PushUnsubscribeRequest;
import br.gov.pb.cge.konnix.domain.push.PushSubscription;
import br.gov.pb.cge.konnix.domain.push.PushSubscriptionRepository;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PushSubscriptionServiceTest {
    @Mock private PushSubscriptionRepository subscriptions;
    @Mock private UserRepository users;

    @Test
    void subscribeSavesSubscription() {
        UUID userId = UUID.randomUUID();
        var actor = new AuthenticatedUser(userId, "user", "User", Set.of());
        var user = new User();
        var request = new PushSubscribeRequest("https://push.example/subscription", "key", "auth");
        when(users.findById(userId)).thenReturn(Optional.of(user));
        when(subscriptions.findByEndpoint(request.endpoint())).thenReturn(Optional.empty());

        var response = new PushSubscriptionService(subscriptions, users).subscribe(request, actor, "127.0.0.1");

        assertThat(response.endpoint()).isEqualTo(request.endpoint());
        verify(subscriptions).save(any(PushSubscription.class));
    }

    @Test
    void unsubscribeDeletesOnlyTheActorsSubscription() {
        UUID userId = UUID.randomUUID();
        var actor = new AuthenticatedUser(userId, "user", "User", Set.of());
        var request = new PushUnsubscribeRequest("https://push.example/subscription");

        new PushSubscriptionService(subscriptions, users).unsubscribe(request, actor, "127.0.0.1");

        verify(subscriptions).deleteByUserIdAndEndpoint(userId, request.endpoint());
        verifyNoInteractions(users);
    }
}
