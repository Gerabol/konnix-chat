package br.gov.pb.cge.konnix.push;

import br.gov.pb.cge.konnix.domain.push.PushSubscription;

@FunctionalInterface
public interface PushSender {

    void send(PushSubscription subscription, String payload) throws Exception;
}
