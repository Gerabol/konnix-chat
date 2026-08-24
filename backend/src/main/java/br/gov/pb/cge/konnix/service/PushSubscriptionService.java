package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.exception.ApiExceptions;
import br.gov.pb.cge.konnix.api.push.dto.PushSubscribeRequest;
import br.gov.pb.cge.konnix.api.push.dto.PushSubscriptionResponse;
import br.gov.pb.cge.konnix.api.push.dto.PushUnsubscribeRequest;
import br.gov.pb.cge.konnix.domain.audit.AuditService;
import br.gov.pb.cge.konnix.domain.push.PushSubscription;
import br.gov.pb.cge.konnix.domain.push.PushSubscriptionRepository;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class PushSubscriptionService {

    private final PushSubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;
    private final AuditService auditService;

    public PushSubscriptionService(PushSubscriptionRepository subscriptionRepository,
                                   UserRepository userRepository,
                                   AuditService auditService) {
        this.subscriptionRepository = subscriptionRepository;
        this.userRepository = userRepository;
        this.auditService = auditService;
    }

    @Transactional
    public PushSubscriptionResponse subscribe(PushSubscribeRequest request, AuthenticatedUser actor, String ipAddress) {
        if (request.endpoint() == null || !request.endpoint().startsWith("https://")) {
            throw ApiExceptions.invalidPushSubscription();
        }
        User user = userRepository.findById(actor.id()).orElseThrow(() -> ApiExceptions.notFound("user/" + actor.id()));
        PushSubscription subscription = subscriptionRepository.findByEndpoint(request.endpoint())
                .orElseGet(PushSubscription::new);
        subscription.setUser(user);
        subscription.setEndpoint(request.endpoint());
        subscription.setP256dh(request.p256dh());
        subscription.setAuth(request.auth());
        subscriptionRepository.save(subscription);

        auditService.record("PUSH_SUBSCRIBED", user, "push_subscription", subscription.getId().toString(), ipAddress);
        return PushSubscriptionResponse.from(subscription);
    }

    @Transactional
    public void unsubscribe(PushUnsubscribeRequest request, AuthenticatedUser actor, String ipAddress) {
        subscriptionRepository.deleteByUserIdAndEndpoint(actor.id(), request.endpoint());
        userRepository.findById(actor.id()).ifPresent(user ->
                auditService.record("PUSH_UNSUBSCRIBED", user, "push_subscription", request.endpoint(), ipAddress));
    }
}
