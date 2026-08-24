package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.exception.ApiExceptions;
import br.gov.pb.cge.konnix.api.message.dto.MessageResponse;
import br.gov.pb.cge.konnix.api.poll.dto.CreatePollRequest;
import br.gov.pb.cge.konnix.domain.audit.AuditService;
import br.gov.pb.cge.konnix.domain.message.Message;
import br.gov.pb.cge.konnix.domain.message.MessageRepository;
import br.gov.pb.cge.konnix.domain.poll.Poll;
import br.gov.pb.cge.konnix.domain.poll.PollOption;
import br.gov.pb.cge.konnix.domain.poll.PollOptionRepository;
import br.gov.pb.cge.konnix.domain.poll.PollRepository;
import br.gov.pb.cge.konnix.domain.poll.PollVote;
import br.gov.pb.cge.konnix.domain.poll.PollVoteRepository;
import br.gov.pb.cge.konnix.domain.room.Room;
import br.gov.pb.cge.konnix.domain.room.RoomMemberRepository;
import br.gov.pb.cge.konnix.domain.room.RoomRepository;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.api.poll.dto.PollVoteRequest;
import br.gov.pb.cge.konnix.push.PushNotificationService;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.websocket.ChatEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

@Service
public class PollService {
    private final RoomRepository roomRepository;
    private final RoomMemberRepository roomMemberRepository;
    private final UserRepository userRepository;
    private final MessageRepository messageRepository;
    private final PollRepository pollRepository;
    private final PollOptionRepository optionRepository;
    private final PollVoteRepository voteRepository;
    private final MessageService messageService;
    private final AuditService auditService;
    private final ChatEventPublisher eventPublisher;
    private final PushNotificationService pushNotificationService;

    public PollService(RoomRepository roomRepository, RoomMemberRepository roomMemberRepository,
                       UserRepository userRepository, MessageRepository messageRepository,
                       PollRepository pollRepository, PollOptionRepository optionRepository,
                       PollVoteRepository voteRepository, MessageService messageService,
                       AuditService auditService, ChatEventPublisher eventPublisher,
                       PushNotificationService pushNotificationService) {
        this.roomRepository = roomRepository;
        this.roomMemberRepository = roomMemberRepository;
        this.userRepository = userRepository;
        this.messageRepository = messageRepository;
        this.pollRepository = pollRepository;
        this.optionRepository = optionRepository;
        this.voteRepository = voteRepository;
        this.messageService = messageService;
        this.auditService = auditService;
        this.eventPublisher = eventPublisher;
        this.pushNotificationService = pushNotificationService;
    }

    @Transactional
    public MessageResponse create(UUID roomId, CreatePollRequest request, AuthenticatedUser actor, String ipAddress) {
        User user = writableUser(actor);
        Room room = roomRepository.findById(roomId).orElseThrow(() -> ApiExceptions.notFound("room/" + roomId));
        requireMember(room, actor);
        if (!"PRIVATE_GROUP".equals(room.getType())) throw ApiExceptions.pollOnlyGroup();
        if (room.isReadOnly() && !actor.hasRole("ADMIN")) throw ApiExceptions.roomReadOnly();
        List<String> options = new LinkedHashSet<>(request.options().stream().map(String::trim)
                .filter(value -> !value.isBlank()).toList()).stream().toList();
        if (request.question().isBlank() || options.size() < 2) throw ApiExceptions.pollInvalid();

        Message message = new Message();
        message.setRoom(room);
        message.setUser(user);
        message.setContent(request.question().trim());
        message.setMessageType("POLL");
        messageRepository.save(message);

        Poll poll = new Poll();
        poll.setMessage(message);
        poll.setQuestion(request.question().trim());
        poll.setAllowMultiple(request.allowMultiple());
        pollRepository.save(poll);

        List<PollOption> entities = options.stream().map(label -> {
            PollOption option = new PollOption();
            option.setPoll(poll);
            option.setLabel(label);
            option.setPosition(options.indexOf(label));
            return option;
        }).toList();
        optionRepository.saveAll(entities);
        auditService.record("POLL_CREATED", user, "poll", poll.getId().toString(), ipAddress);
        MessageResponse response = messageService.responseFor(message, actor.id());
        eventPublisher.publish(roomId, MessageService.EVENT_MESSAGE_CREATED, response);
        pushNotificationService.notifyNewMessage(roomId, response, room.getDisplayName() == null ? room.getName() : room.getDisplayName());
        return response;
    }

    @Transactional
    public MessageResponse vote(UUID pollId, PollVoteRequest request, AuthenticatedUser actor) {
        User user = writableUser(actor);
        Poll poll = pollRepository.findById(pollId).orElseThrow(() -> ApiExceptions.notFound("poll/" + pollId));
        Room room = poll.getMessage().getRoom();
        requireMember(room, actor);
        PollOption option = optionRepository.findById(request.optionId())
                .filter(candidate -> candidate.getPoll().getId().equals(pollId))
                .orElseThrow(ApiExceptions::pollOptionInvalid);
        List<PollVote> current = voteRepository.findByPollIdAndUserId(pollId, actor.id());
        if (!poll.isAllowMultiple()) {
            voteRepository.deleteAll(current);
            PollVote vote = new PollVote();
            vote.setPoll(poll);
            vote.setOption(option);
            vote.setUser(user);
            voteRepository.save(vote);
        } else {
            PollVote existing = current.stream().filter(vote -> vote.getOption().getId().equals(option.getId())).findFirst().orElse(null);
            if (existing != null) {
                voteRepository.delete(existing);
            } else {
                PollVote vote = new PollVote();
                vote.setPoll(poll);
                vote.setOption(option);
                vote.setUser(user);
                voteRepository.save(vote);
            }
        }
        MessageResponse response = messageService.responseFor(poll.getMessage(), actor.id());
        eventPublisher.publish(room.getId(), MessageService.EVENT_MESSAGE_UPDATED, response);
        return response;
    }

    private User writableUser(AuthenticatedUser actor) {
        User user = userRepository.findById(actor.id()).orElseThrow(() -> ApiExceptions.unauthorized("Sessão inválida"));
        if (user.isReadOnly()) throw ApiExceptions.accountReadOnly();
        return user;
    }

    private void requireMember(Room room, AuthenticatedUser actor) {
        if (!roomMemberRepository.existsByRoomIdAndUserId(room.getId(), actor.id())) throw ApiExceptions.notRoomMember();
    }
}
