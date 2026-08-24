package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.exception.ApiExceptions;
import br.gov.pb.cge.konnix.api.user.dto.UserResponse;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.websocket.ChatEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

@Service
public class PresenceService {
    public static final Set<String> STATUSES = Set.of("online", "away", "busy", "offline", "mission", "vacation");

    private final UserRepository userRepository;
    private final ChatEventPublisher eventPublisher;

    public PresenceService(UserRepository userRepository, ChatEventPublisher eventPublisher) {
        this.userRepository = userRepository;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public UserResponse update(AuthenticatedUser actor, String status) {
        String normalized = status == null ? "" : status.trim().toLowerCase();
        if (!STATUSES.contains(normalized)) {
            throw ApiExceptions.conflict("PRESENCE_STATUS_INVALID", "Status de presença inválido");
        }
        User user = userRepository.findById(actor.id())
                .orElseThrow(() -> ApiExceptions.notFound("user/" + actor.id()));
        user.setPresenceStatus(normalized);
        userRepository.save(user);
        UserResponse response = UserResponse.from(user);
        eventPublisher.publishPresence(user.getId(), user.getUsername(), normalized);
        return response;
    }
}
