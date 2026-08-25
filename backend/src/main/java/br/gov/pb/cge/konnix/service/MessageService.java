package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.exception.ApiExceptions;
import br.gov.pb.cge.konnix.api.message.dto.CreateMessageRequest;
import br.gov.pb.cge.konnix.api.message.dto.MessageHistoryResponse;
import br.gov.pb.cge.konnix.api.message.dto.MessageResponse;
import br.gov.pb.cge.konnix.api.message.dto.ReadReceiptResponse;
import br.gov.pb.cge.konnix.api.message.dto.UpdateMessageRequest;
import br.gov.pb.cge.konnix.domain.attachment.Attachment;
import br.gov.pb.cge.konnix.domain.attachment.AttachmentRepository;
import br.gov.pb.cge.konnix.domain.audit.AuditService;
import br.gov.pb.cge.konnix.domain.message.Message;
import br.gov.pb.cge.konnix.domain.message.MessageRepository;
import br.gov.pb.cge.konnix.domain.message.MessageRead;
import br.gov.pb.cge.konnix.domain.message.MessageReadRepository;
import br.gov.pb.cge.konnix.domain.message.MessageReaction;
import br.gov.pb.cge.konnix.domain.message.MessageReactionRepository;
import br.gov.pb.cge.konnix.domain.poll.Poll;
import br.gov.pb.cge.konnix.domain.poll.PollOption;
import br.gov.pb.cge.konnix.domain.poll.PollOptionRepository;
import br.gov.pb.cge.konnix.domain.poll.PollRepository;
import br.gov.pb.cge.konnix.domain.poll.PollVote;
import br.gov.pb.cge.konnix.domain.poll.PollVoteRepository;
import br.gov.pb.cge.konnix.api.message.dto.MessageReactionResponse;
import br.gov.pb.cge.konnix.domain.room.Room;
import br.gov.pb.cge.konnix.domain.room.RoomMemberRepository;
import br.gov.pb.cge.konnix.domain.room.RoomRepository;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.push.PushNotificationService;
import br.gov.pb.cge.konnix.websocket.ChatEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class MessageService {

    public static final int DEFAULT_LIMIT = 50;
    public static final int MAX_LIMIT = 200;

    public static final String EVENT_MESSAGE_CREATED = "message.created";
    public static final String EVENT_MESSAGE_UPDATED = "message.updated";
    public static final String EVENT_MESSAGE_DELETED = "message.deleted";

    private final MessageRepository messageRepository;
    private final RoomRepository roomRepository;
    private final RoomMemberRepository roomMemberRepository;
    private final UserRepository userRepository;
    private final AttachmentRepository attachmentRepository;
    private final AuditService auditService;
    private final ChatEventPublisher eventPublisher;
    private final PushNotificationService pushNotificationService;
    private final MessageReadRepository messageReadRepository;
    private final SystemSettingService systemSettingService;
    private final MessageReactionRepository reactionRepository;
    private final PollRepository pollRepository;
    private final PollOptionRepository pollOptionRepository;
    private final PollVoteRepository pollVoteRepository;

    public MessageService(MessageRepository messageRepository,
                          RoomRepository roomRepository,
                          RoomMemberRepository roomMemberRepository,
                          UserRepository userRepository,
                          AttachmentRepository attachmentRepository,
                          AuditService auditService,
                          ChatEventPublisher eventPublisher,
                          PushNotificationService pushNotificationService,
                          MessageReadRepository messageReadRepository,
                          SystemSettingService systemSettingService,
                          MessageReactionRepository reactionRepository,
                          PollRepository pollRepository,
                          PollOptionRepository pollOptionRepository,
                          PollVoteRepository pollVoteRepository) {
        this.messageRepository = messageRepository;
        this.roomRepository = roomRepository;
        this.roomMemberRepository = roomMemberRepository;
        this.userRepository = userRepository;
        this.attachmentRepository = attachmentRepository;
        this.auditService = auditService;
        this.eventPublisher = eventPublisher;
        this.pushNotificationService = pushNotificationService;
        this.messageReadRepository = messageReadRepository;
        this.systemSettingService = systemSettingService;
        this.reactionRepository = reactionRepository;
        this.pollRepository = pollRepository;
        this.pollOptionRepository = pollOptionRepository;
        this.pollVoteRepository = pollVoteRepository;
    }

    @Transactional
    public MessageResponse create(UUID roomId, CreateMessageRequest request, AuthenticatedUser actor, String ipAddress) {
        requireWritable(actor);
        Room room = roomOrThrow(roomId);
        requireMember(room, actor);
        if (room.isReadOnly() && !actor.hasRole("ADMIN")) {
            throw ApiExceptions.roomReadOnly();
        }

        Message message = new Message();
        message.setRoom(room);
        message.setUser(actorUser(actor.id()));
        message.setContent(request.content().trim());
        message.setMessageType("USER");

        if (request.parentMessageId() != null) {
            Message parent = messageRepository.findById(request.parentMessageId())
                    .filter(m -> m.getDeletedAt() == null)
                    .orElseThrow(() -> ApiExceptions.notFound("message/" + request.parentMessageId()));
            if (!parent.getRoom().getId().equals(roomId)) {
                throw ApiExceptions.parentRoomMismatch();
            }
            message.setParentMessage(parent);
        }
        if (request.forwardedMessageId() != null) {
            Message original = messageRepository.findById(request.forwardedMessageId())
                    .filter(m -> m.getDeletedAt() == null)
                    .orElseThrow(() -> ApiExceptions.notFound("message/" + request.forwardedMessageId()));
            requireMember(original.getRoom(), actor);
            message.setForwardedFromUser(original.getUser());
        }

        messageRepository.save(message);
        auditService.record("MESSAGE_CREATED", actorUser(actor.id()), "message", message.getId().toString(), ipAddress);
        MessageResponse response = responseFor(message, actor.id());
        eventPublisher.publish(roomId, EVENT_MESSAGE_CREATED, response);
        pushNotificationService.notifyNewMessage(roomId, response, displayName(room));
        return response;
    }

    @Transactional(readOnly = true)
    public MessageHistoryResponse history(UUID roomId, Integer limit, Instant before, AuthenticatedUser actor) {
        Room room = roomOrThrow(roomId);
        requireMember(room, actor);

        int size = limit == null ? DEFAULT_LIMIT : Math.max(1, Math.min(limit, MAX_LIMIT));
        Pageable pageable = PageRequest.of(0, size + 1, Sort.by(Sort.Direction.DESC, "createdAt", "id"));
        List<Message> page = before != null
                ? messageRepository.findBefore(roomId, before, pageable)
                : messageRepository.findLatest(roomId, pageable);

        boolean hasMore = page.size() > size;
        List<Message> selected = hasMore ? new ArrayList<>(page.subList(0, size)) : new ArrayList<>(page);
        Collections.reverse(selected);

        List<MessageResponse> messages = toResponses(selected, actor.id());
        Instant nextBefore = messages.isEmpty() ? null : messages.get(0).createdAt();
        return new MessageHistoryResponse(messages, hasMore, nextBefore);
    }

    @Transactional(readOnly = true)
    public List<MessageResponse> search(UUID roomId, String query, AuthenticatedUser actor) {
        Room room = roomOrThrow(roomId);
        requireMember(room, actor);
        String normalized = query == null ? "" : query.trim();
        if (normalized.isBlank()) return List.of();
        List<Message> matches = messageRepository.searchInRoom(roomId, normalized, PageRequest.of(0, 100));
        Collections.reverse(matches);
        return toResponses(matches, actor.id());
    }

    @Transactional
    public void markRoomRead(UUID roomId, AuthenticatedUser actor) {
        Room room = roomOrThrow(roomId);
        requireMember(room, actor);
        if (!systemSettingService.readReceiptsEnabled()) {
            return;
        }
        List<Message> unread = messageRepository.findUnreadByRoomId(roomId, actor.id());
        if (unread.isEmpty()) {
            return;
        }
        User user = actorUser(actor.id());
        Instant readAt = Instant.now();
        List<MessageRead> receipts = unread.stream().map(message -> {
            MessageRead read = new MessageRead();
            read.setMessage(message);
            read.setUser(user);
            read.setReadAt(readAt);
            return read;
        }).toList();
        messageReadRepository.saveAll(receipts);
        receipts.forEach(read -> eventPublisher.publishReadReceipt(roomId, read.getMessage().getId(),
                read.getMessage().getUser().getId(), ReadReceiptResponse.from(read)));
    }

    @Transactional
    public MessageReactionResponse toggleReaction(UUID messageId, String emoji, AuthenticatedUser actor) {
        requireWritable(actor);
        Message message = messageOrThrow(messageId);
        requireMember(message.getRoom(), actor);
        if (emoji == null || emoji.isBlank() || emoji.length() > 16) throw ApiExceptions.conflict("REACTION_INVALID", "Emoji inválido");
        var existing = reactionRepository.findByMessageIdAndUserIdAndEmoji(messageId, actor.id(), emoji);
        if (existing.isPresent()) {
            reactionRepository.delete(existing.get());
            MessageReactionResponse removed = new MessageReactionResponse(null, messageId, actor.id(), actor.username(), emoji, null);
            eventPublisher.publishReaction(message.getRoom().getId(), removed, true);
            return removed;
        }
        if (reactionRepository.countDistinctEmojiByMessageId(messageId) >= 5) {
            throw ApiExceptions.conflict("REACTION_LIMIT", "A mensagem já possui cinco emojis diferentes");
        }
        MessageReaction reaction = new MessageReaction();
        reaction.setMessage(message);
        reaction.setUser(actorUser(actor.id()));
        reaction.setEmoji(emoji);
        reactionRepository.save(reaction);
        MessageReactionResponse created = MessageReactionResponse.from(reaction);
        eventPublisher.publishReaction(message.getRoom().getId(), created, false);
        return created;
    }

    @Transactional
    public MessageResponse update(UUID id, UpdateMessageRequest request, AuthenticatedUser actor, String ipAddress) {
        requireWritable(actor);
        Message message = messageOrThrow(id);
        if (!message.getUser().getId().equals(actor.id())) {
            throw ApiExceptions.cannotEditMessage();
        }
        message.setContent(request.content().trim());
        message.setEditedAt(Instant.now());
        messageRepository.save(message);
        auditService.record("MESSAGE_UPDATED", actorUser(actor.id()), "message", message.getId().toString(), ipAddress);
        MessageResponse response = responseFor(message, actor.id());
        eventPublisher.publish(message.getRoom().getId(), EVENT_MESSAGE_UPDATED, response);
        return response;
    }

    @Transactional
    public MessageResponse delete(UUID id, AuthenticatedUser actor, String ipAddress) {
        requireWritable(actor);
        Message message = messageOrThrow(id);
        boolean ownMessage = message.getUser() != null && message.getUser().getId().equals(actor.id());
        if (!ownMessage && !actor.hasRole("ADMIN")) {
            throw ApiExceptions.cannotDeleteMessage();
        }
        message.setDeletedAt(Instant.now());
        messageRepository.save(message);
        Room room = message.getRoom();
        if (room != null && room.getPinnedMessage() != null && room.getPinnedMessage().getId().equals(id)) {
            room.setPinnedMessage(null);
            roomRepository.save(room);
            eventPublisher.publishPinnedMessage(room.getId(), null);
        }
        auditService.record("MESSAGE_DELETED", actorUser(actor.id()), "message", message.getId().toString(), ipAddress);
        MessageResponse response = responseFor(message, actor.id());
        eventPublisher.publish(message.getRoom().getId(), EVENT_MESSAGE_DELETED, response);
        return response;
    }

    @Transactional
    public MessageResponse createSystem(UUID roomId, String content, User actor) {
        Room room = roomOrThrow(roomId);
        Message message = new Message();
        message.setRoom(room);
        message.setUser(actor);
        message.setContent(content);
        message.setMessageType("SYSTEM");
        messageRepository.save(message);
        MessageResponse response = responseFor(message, actor.getId());
        eventPublisher.publish(roomId, EVENT_MESSAGE_CREATED, response);
        return response;
    }

    private Room roomOrThrow(UUID id) {
        return roomRepository.findById(id)
                .orElseThrow(() -> ApiExceptions.notFound("room/" + id));
    }

    private String displayName(Room room) {
        if (room.getDisplayName() != null && !room.getDisplayName().isBlank()) {
            return room.getDisplayName();
        }
        return room.getName() == null ? "Sala" : room.getName();
    }

    private Message messageOrThrow(UUID id) {
        return messageRepository.findById(id)
                .filter(m -> m.getDeletedAt() == null)
                .orElseThrow(() -> ApiExceptions.notFound("message/" + id));
    }

    private void requireMember(Room room, AuthenticatedUser actor) {
        if (!roomMemberRepository.existsByRoomIdAndUserId(room.getId(), actor.id())) {
            throw ApiExceptions.notRoomMember();
        }
    }

    private User actorUser(UUID actorId) {
        return userRepository.findById(actorId).orElse(null);
    }

    private void requireWritable(AuthenticatedUser actor) {
        User user = actorUser(actor.id());
        if (user != null && user.isReadOnly()) {
            throw ApiExceptions.accountReadOnly();
        }
    }

    public MessageResponse responseFor(Message message, UUID actorId) {
        Attachment attachment = attachmentRepository.findByMessageId(message.getId()).orElse(null);
        return MessageResponse.from(message, attachment, List.of(), List.of(), pollFor(message, actorId));
    }

    private List<MessageResponse> toResponses(List<Message> messages, UUID actorId) {
        if (messages.isEmpty()) {
            return List.of();
        }
        List<UUID> ids = messages.stream().map(Message::getId).toList();
        Map<UUID, Attachment> attachmentsByMessage = attachmentRepository.findAllByMessageIdIn(ids).stream()
                .collect(Collectors.toMap(a -> a.getMessage().getId(), a -> a));
        Map<UUID, List<ReadReceiptResponse>> readsByMessage = messageReadRepository.findByMessageIdIn(ids).stream()
                .collect(Collectors.groupingBy(read -> read.getMessage().getId(),
                        Collectors.mapping(ReadReceiptResponse::from, Collectors.toList())));
        Map<UUID, List<MessageReactionResponse>> reactionsByMessage = reactionRepository.findByMessageIdIn(ids).stream()
                .collect(Collectors.groupingBy(reaction -> reaction.getMessage().getId(),
                        Collectors.mapping(MessageReactionResponse::from, Collectors.toList())));
        boolean enabled = systemSettingService.readReceiptsEnabled();
        return messages.stream().map(m -> MessageResponse.from(m, attachmentsByMessage.get(m.getId()),
                enabled && m.getUser() != null && m.getUser().getId().equals(actorId)
                        ? readsByMessage.getOrDefault(m.getId(), List.of()) : List.of(),
                reactionsByMessage.getOrDefault(m.getId(), List.of()), pollFor(m, actorId))).toList();
    }

    private MessageResponse.PollData pollFor(Message message, UUID actorId) {
        Poll poll = pollRepository.findByMessageId(message.getId()).orElse(null);
        if (poll == null) return null;
        List<PollOption> options = pollOptionRepository.findByPollIdInOrderByPositionAsc(List.of(poll.getId()));
        List<PollVote> votes = pollVoteRepository.findByPollIdIn(List.of(poll.getId()));
        int totalMembers = roomMemberRepository.findByRoomId(message.getRoom().getId()).size();
        int totalVoters = (int) votes.stream().map(vote -> vote.getUser().getId()).distinct().count();
        return new MessageResponse.PollData(poll.getId(), poll.getQuestion(), poll.isAllowMultiple(), totalMembers, totalVoters, options.stream()
                .map(option -> new MessageResponse.PollOptionData(option.getId(), option.getLabel(),
                        votes.stream().filter(vote -> vote.getOption().getId().equals(option.getId())).count(),
                        votes.stream().anyMatch(vote -> vote.getOption().getId().equals(option.getId())
                                && actorId != null && vote.getUser().getId().equals(actorId)),
                        votes.stream().filter(vote -> vote.getOption().getId().equals(option.getId()))
                                .map(vote -> new MessageResponse.PollVoterData(vote.getUser().getId(), vote.getUser().getUsername(), vote.getUser().getName(), vote.getCreatedAt()))
                                .toList()))
                .toList());
    }
}
