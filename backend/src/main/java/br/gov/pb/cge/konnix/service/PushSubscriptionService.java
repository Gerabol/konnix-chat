package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.exception.ApiExceptions;
import br.gov.pb.cge.konnix.api.push.dto.PushSubscribeRequest;
import br.gov.pb.cge.konnix.api.push.dto.PushSubscriptionResponse;
import br.gov.pb.cge.konnix.api.push.dto.PushUnsubscribeRequest;
import br.gov.pb.cge.konnix.domain.push.PushSubscription;
import br.gov.pb.cge.konnix.domain.push.PushSubscriptionRepository;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PushSubscriptionService {

    private final PushSubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;

    public PushSubscriptionService(PushSubscriptionRepository subscriptionRepository,
                                   UserRepository userRepository) {
        this.subscriptionRepository = subscriptionRepository;
        this.userRepository = userRepository;
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

        return PushSubscriptionResponse.from(subscription);
    }

    @Transactional
    public void unsubscribe(PushUnsubscribeRequest request, AuthenticatedUser actor, String ipAddress) {
        subscriptionRepository.deleteByUserIdAndEndpoint(actor.id(), request.endpoint());
    }
}
