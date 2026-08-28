package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.exception.ApiExceptions;
import br.gov.pb.cge.konnix.api.room.dto.AddMemberRequest;
import br.gov.pb.cge.konnix.api.room.dto.CreateRoomRequest;
import br.gov.pb.cge.konnix.api.room.dto.RoomMemberResponse;
import br.gov.pb.cge.konnix.api.room.dto.RoomResponse;
import br.gov.pb.cge.konnix.api.admin.dto.RoomUpdateRequest;
import br.gov.pb.cge.konnix.domain.audit.AuditService;
import br.gov.pb.cge.konnix.domain.room.Room;
import br.gov.pb.cge.konnix.domain.room.RoomMember;
import br.gov.pb.cge.konnix.domain.room.RoomMemberRepository;
import br.gov.pb.cge.konnix.domain.room.RoomRepository;
import br.gov.pb.cge.konnix.domain.message.Message;
import br.gov.pb.cge.konnix.domain.message.MessageRepository;
import br.gov.pb.cge.konnix.api.message.dto.MessageResponse;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.websocket.ChatEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class RoomService {

    public static final String TYPE_CHANNEL = "CHANNEL";
    public static final String TYPE_PRIVATE_GROUP = "PRIVATE_GROUP";
    public static final String TYPE_DIRECT = "DIRECT";
    public static final String ROLE_OWNER = "OWNER";
    public static final String ROLE_MEMBER = "MEMBER";

    private final RoomRepository roomRepository;
    private final RoomMemberRepository roomMemberRepository;
    private final MessageRepository messageRepository;
    private final UserRepository userRepository;
    private final AuditService auditService;
    private final MessageService messageService;
    private final SystemSettingService systemSettingService;
    private final ChatEventPublisher chatEventPublisher;

    public RoomService(RoomRepository roomRepository,
                       RoomMemberRepository roomMemberRepository,
                       MessageRepository messageRepository,
                       UserRepository userRepository,
                        AuditService auditService,
                        MessageService messageService,
                        SystemSettingService systemSettingService,
                        ChatEventPublisher chatEventPublisher) {
        this.roomRepository = roomRepository;
        this.roomMemberRepository = roomMemberRepository;
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
        this.auditService = auditService;
        this.messageService = messageService;
        this.systemSettingService = systemSettingService;
        this.chatEventPublisher = chatEventPublisher;
    }

    @Transactional(readOnly = true)
    public List<RoomResponse> listForUser(AuthenticatedUser actor) {
        List<UUID> roomIds = roomMemberRepository.findByUserId(actor.id()).stream()
                .map(RoomMember::getRoom)
                .map(Room::getId)
                .toList();
        if (roomIds.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<RoomMember>> membersByRoom = roomMemberRepository.findByRoomIdIn(roomIds).stream()
                .collect(Collectors.groupingBy(member -> member.getRoom().getId()));
        Map<UUID, Instant> lastMessageByRoom = messageRepository.findLastCreatedAtByRoomIds(roomIds).stream()
                .collect(Collectors.toMap(row -> (UUID) row[0], row -> (Instant) row[1]));
        Map<UUID, Long> unreadByRoom = systemSettingService.readReceiptsEnabled()
                ? messageRepository.countUnreadByRoomIds(roomIds, actor.id()).stream()
                    .collect(Collectors.toMap(row -> (UUID) row[0], row -> ((Number) row[1]).longValue()))
                : Map.of();
        return roomRepository.findAllById(roomIds).stream()
                .map(room -> RoomResponse.from(room,
                        partnerOf(room, actor.id(),
                                membersByRoom.getOrDefault(room.getId(), List.of())),
                        lastMessageByRoom.getOrDefault(room.getId(), room.getUpdatedAt() != null
                                ? room.getUpdatedAt() : room.getCreatedAt()),
                        unreadByRoom.getOrDefault(room.getId(), 0L),
                        favoriteOf(room, actor.id(), membersByRoom.getOrDefault(room.getId(), List.of())),
                        room.getPinnedMessage() != null && room.getPinnedMessage().getDeletedAt() == null
                                ? messageService.responseFor(room.getPinnedMessage(), actor.id()) : null))
                .filter(response -> response.directPartner() == null
                        || !"DISABLED".equals(response.directPartner().accountStatus()))
                .sorted(Comparator.comparing(RoomResponse::lastActivityAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
    }

            @Transactional(readOnly = true)
            public List<RoomResponse> commonRooms(AuthenticatedUser actor, UUID otherUserId) {
            var actorRoomIds = roomMemberRepository.findByUserId(actor.id()).stream()
                .filter(RoomMember::isActive)
                .map(RoomMember::getRoom)
                .filter(room -> !TYPE_DIRECT.equals(room.getType()))
                .map(Room::getId)
                .collect(Collectors.toSet());
            if (actorRoomIds.isEmpty()) return List.of();
            return roomMemberRepository.findByUserId(otherUserId).stream()
                .filter(RoomMember::isActive)
                .map(RoomMember::getRoom)
                .filter(room -> actorRoomIds.contains(room.getId()) && !TYPE_DIRECT.equals(room.getType()))
                .distinct()
                .sorted(Comparator.comparing(Room::getName, String.CASE_INSENSITIVE_ORDER))
                .map(RoomResponse::from)
                .toList();
            }

    @Transactional(readOnly = true)
    public RoomResponse get(UUID id, AuthenticatedUser actor) {
        Room room = roomOrThrow(id);
        requireMember(room, actor);
        List<RoomMember> members = roomMemberRepository.findByRoomId(id);
        return RoomResponse.from(room, partnerOf(room, actor.id(), members), null, 0,
                favoriteOf(room, actor.id(), members),
                room.getPinnedMessage() != null && room.getPinnedMessage().getDeletedAt() == null
                        ? messageService.responseFor(room.getPinnedMessage(), actor.id()) : null);
    }

    @Transactional
    public RoomResponse toggleFavorite(UUID roomId, AuthenticatedUser actor) {
        Room room = roomOrThrow(roomId);
        List<RoomMember> members = roomMemberRepository.findByRoomId(roomId);
        RoomMember membership = members.stream()
                .filter(member -> member.getUser().getId().equals(actor.id()) && member.isActive())
                .findFirst()
                .orElseThrow(ApiExceptions::notRoomMember);
        membership.setFavorite(!membership.isFavorite());
        roomMemberRepository.save(membership);
        chatEventPublisher.publishFavoriteUpdated(actor.id(), roomId, membership.isFavorite());
        return RoomResponse.from(room, partnerOf(room, actor.id(), members), null, 0, membership.isFavorite(),
                room.getPinnedMessage() != null && room.getPinnedMessage().getDeletedAt() == null
                        ? messageService.responseFor(room.getPinnedMessage(), actor.id()) : null);
    }

    @Transactional
    public RoomResponse create(CreateRoomRequest request, AuthenticatedUser actor, String ipAddress) {
        String type = request.type();
        if (TYPE_CHANNEL.equals(type) && !actor.hasRole("ADMIN")) {
            throw ApiExceptions.forbidden("Apenas ADMIN pode criar canais");
        }
        if (!TYPE_CHANNEL.equals(type) && !TYPE_PRIVATE_GROUP.equals(type)) {
            throw ApiExceptions.conflict("ROOM_TYPE_INVALID", "Tipo de sala inválido");
        }
        String name = request.name().trim();
        if (roomRepository.existsByName(name)) {
            throw ApiExceptions.roomNameTaken();
        }

        User creator = actorUser(actor.id());
        Room room = new Room();
        room.setName(name);
        room.setDisplayName(request.displayName() != null && !request.displayName().isBlank()
                ? request.displayName().trim() : null);
        room.setType(type);
        room.setReadOnly(false);
        room.setCreatedBy(creator);
        roomRepository.save(room);

        addMembership(room, creator, ROLE_OWNER);
        auditService.record("ROOM_CREATED", creator, "room", room.getId().toString(), ipAddress);
        return RoomResponse.from(room);
    }

    @Transactional
    public RoomResponse createDirect(UUID otherUserId, AuthenticatedUser actor, String ipAddress) {
        User other = userRepository.findById(otherUserId)
                .orElseThrow(() -> ApiExceptions.notFound("user/" + otherUserId));
        if (other.isDisabled()) {
            throw ApiExceptions.userUnavailable();
        }

        List<UUID> existing = actor.id().equals(otherUserId)
                ? roomMemberRepository.findSelfDirectRoomIds(actor.id())
                : roomMemberRepository.findDirectRoomIds(actor.id(), otherUserId);
        if (!existing.isEmpty()) {
            return RoomResponse.from(roomOrThrow(existing.get(0)), directPartnerFor(other));
        }

        User actorUser = actorUser(actor.id());
        Room room = new Room();
        User partner = actor.id().equals(otherUserId) ? actorUser : other;
        room.setName(partner.getUsername());
        room.setDisplayName(partner.getName());
        room.setType(TYPE_DIRECT);
        room.setReadOnly(false);
        room.setCreatedBy(actorUser);
        roomRepository.save(room);

        addMembership(room, actorUser, ROLE_MEMBER);
        if (!otherUserId.equals(actor.id())) {
            addMembership(room, other, ROLE_MEMBER);
        }
        auditService.record("ROOM_CREATED", actorUser, "room", room.getId().toString(), ipAddress);
        return RoomResponse.from(room, directPartnerFor(partner));
    }

    @Transactional(readOnly = true)
    public List<RoomMemberResponse> members(UUID roomId, AuthenticatedUser actor) {
        Room room = roomOrThrow(roomId);
        requireMember(room, actor);
        return roomMemberRepository.findByRoomId(roomId).stream()
                .map(RoomMemberResponse::from)
                .sorted(Comparator.comparing(RoomMemberResponse::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<RoomResponse> adminList() {
        return roomRepository.findByTypeInOrderByNameAsc(List.of(TYPE_CHANNEL, TYPE_PRIVATE_GROUP))
                .stream().map(RoomResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<RoomMemberResponse> adminMembers(UUID roomId) {
        Room room = roomOrThrow(roomId);
        requireAdminRoom(room);
        return roomMemberRepository.findByRoomId(roomId).stream().map(RoomMemberResponse::from)
                .sorted(Comparator.comparing(RoomMemberResponse::name, String.CASE_INSENSITIVE_ORDER)).toList();
    }

    @Transactional(readOnly = true)
    public RoomResponse adminAvatarUpdated(UUID roomId) {
        Room room = roomOrThrow(roomId);
        requireAdminRoom(room);
        return RoomResponse.from(room);
    }

    @Transactional
    public RoomResponse update(UUID roomId, RoomUpdateRequest request, AuthenticatedUser actor, String ipAddress) {
        Room room = roomOrThrow(roomId);
        requireCanUpdate(room, actor);
        if (request.name() != null && !request.name().isBlank()) {
            String name = request.name().trim();
            if (!name.equals(room.getName()) && roomRepository.existsByName(name)) {
                throw ApiExceptions.roomNameTaken();
            }
            room.setName(name);
            room.setDisplayName(name);
            roomRepository.save(room);
            auditService.record("ROOM_UPDATED", actorUser(actor.id()), "room", roomId.toString(), ipAddress);
            chatEventPublisher.publishRoomUpdated(roomId, RoomResponse.from(room));
        }
        return RoomResponse.from(room);
    }

    @Transactional
    public RoomResponse avatarUpdated(UUID roomId, AuthenticatedUser actor, String ipAddress) {
        Room room = roomOrThrow(roomId);
        requireCanUpdate(room, actor);
        room.setUpdatedAt(Instant.now());
        roomRepository.save(room);
        auditService.record("ROOM_AVATAR_UPDATED", actorUser(actor.id()), "room", roomId.toString(), ipAddress);
        chatEventPublisher.publishRoomUpdated(roomId, RoomResponse.from(room));
        return RoomResponse.from(room);
    }

    @Transactional(readOnly = true)
    public void authorizeUpdate(UUID roomId, AuthenticatedUser actor) {
        Room room = roomOrThrow(roomId);
        requireCanUpdate(room, actor);
    }

    @Transactional
    public RoomResponse adminUpdate(UUID roomId, RoomUpdateRequest request, User actor, String ipAddress) {
        Room room = roomOrThrow(roomId);
        requireAdminRoom(room);
        boolean readOnlyChanged = request.readOnly() != null && request.readOnly() != room.isReadOnly();
        if (request.name() != null && !request.name().isBlank()) room.setName(request.name().trim());
        if (request.displayName() != null) room.setDisplayName(request.displayName().isBlank() ? null : request.displayName().trim());
        if (request.readOnly() != null) room.setReadOnly(request.readOnly());
        roomRepository.save(room);
        auditService.record("ROOM_UPDATED", actor, "room", roomId.toString(), ipAddress);
        if (readOnlyChanged) auditService.record("ROOM_READ_ONLY_CHANGED", actor, "room", roomId.toString(), ipAddress);
        chatEventPublisher.publishRoomUpdated(roomId, RoomResponse.from(room));
        return RoomResponse.from(room);
    }

    @Transactional
    public RoomMemberResponse adminAddMember(UUID roomId, AddMemberRequest request, User actor, String ipAddress) {
        Room room = roomOrThrow(roomId);
        requireAdminRoom(room);
        User target = userRepository.findById(request.userId()).orElseThrow(() -> ApiExceptions.notFound("user/" + request.userId()));
        if (roomMemberRepository.existsByRoomIdAndUserId(roomId, target.getId())) throw ApiExceptions.alreadyMember();
        RoomMember member = addMembership(room, target, request.role() == null || request.role().isBlank() ? ROLE_MEMBER : request.role().trim());
        chatEventPublisher.publishRoomAdded(target.getId(), RoomResponse.from(room));
        chatEventPublisher.publishRoomUpdated(roomId, RoomResponse.from(room));
        auditService.record("ROOM_MEMBER_ADDED", actor, "member", roomId + ":" + target.getId(), ipAddress);
        return RoomMemberResponse.from(member);
    }

    @Transactional
    public void adminRemoveMember(UUID roomId, UUID userId, User actor, String ipAddress) {
        Room room = roomOrThrow(roomId);
        requireAdminRoom(room);
        RoomMember member = roomMemberRepository.findByRoomIdAndUserId(roomId, userId)
                .orElseThrow(() -> ApiExceptions.notFound("member/" + userId));
        roomMemberRepository.delete(member);
        chatEventPublisher.publishRoomRemoved(userId, roomId);
        chatEventPublisher.publishRoomUpdated(roomId, RoomResponse.from(room));
        auditService.record("ROOM_MEMBER_REMOVED", actor, "member", roomId + ":" + userId, ipAddress);
    }

    @Transactional
    public RoomMemberResponse adminUpdateMemberRole(UUID roomId, UUID userId, String role, User actor, String ipAddress) {
        Room room = roomOrThrow(roomId);
        requireAdminRoom(room);
        if (role == null || role.isBlank()) throw ApiExceptions.conflict("MEMBER_ROLE_INVALID", "Role do membro inválida");
        RoomMember member = roomMemberRepository.findByRoomIdAndUserId(roomId, userId)
                .orElseThrow(() -> ApiExceptions.notFound("member/" + userId));
        member.setRole(role.trim().toUpperCase());
        roomMemberRepository.save(member);
        auditService.record("ROOM_MEMBER_ROLE_CHANGED", actor, "member", roomId + ":" + userId, ipAddress);
        return RoomMemberResponse.from(member);
    }

    private void requireAdminRoom(Room room) {
        if (TYPE_DIRECT.equals(room.getType())) throw ApiExceptions.directRoomManualMembership();
        if (!TYPE_CHANNEL.equals(room.getType()) && !TYPE_PRIVATE_GROUP.equals(room.getType()))
            throw ApiExceptions.conflict("ROOM_TYPE_INVALID", "Tipo de sala não administrável");
    }

    private void requireCanUpdate(Room room, AuthenticatedUser actor) {
        if (TYPE_DIRECT.equals(room.getType())) {
            throw ApiExceptions.forbidden("Salas DIRECT não podem ser editadas");
        }
        requireAdminRoom(room);
        if (!actor.hasRole("ADMIN")
                && (!roomMemberRepository.existsByRoomIdAndUserId(room.getId(), actor.id()) || !isOwner(room, actor))) {
            throw ApiExceptions.forbidden("Apenas o proprietário/owner pode editar esta sala");
        }
    }

    private void requireCanPin(Room room, AuthenticatedUser actor) {
        if (TYPE_DIRECT.equals(room.getType())) {
            throw ApiExceptions.forbidden("Apenas canais e grupos permitem fixar mensagens");
        }
        requireAdminRoom(room);
        if (!actor.hasRole("ADMIN")
                && (!roomMemberRepository.existsByRoomIdAndUserId(room.getId(), actor.id()) || !isOwner(room, actor))) {
            throw ApiExceptions.forbidden("Apenas administradores e proprietários podem fixar mensagens");
        }
    }

    @Transactional
    public RoomResponse pinMessage(UUID roomId, UUID messageId, AuthenticatedUser actor, String ipAddress) {
        Room room = roomOrThrow(roomId);
        requireCanPin(room, actor);
        Message message = messageRepository.findById(messageId)
                .filter(m -> m.getDeletedAt() == null)
                .orElseThrow(() -> ApiExceptions.notFound("message/" + messageId));
        if (!message.getRoom().getId().equals(roomId)) {
            throw ApiExceptions.conflict("MESSAGE_ROOM_MISMATCH", "A mensagem não pertence a esta sala");
        }
        room.setPinnedMessage(message);
        roomRepository.save(room);
        auditService.record("ROOM_MESSAGE_PINNED", actorUser(actor.id()), "room", roomId + ":" + messageId, ipAddress);
        MessageResponse pinnedResponse = messageService.responseFor(message, actor.id());
        chatEventPublisher.publishPinnedMessage(roomId, pinnedResponse);
        List<RoomMember> members = roomMemberRepository.findByRoomId(roomId);
        return RoomResponse.from(room, partnerOf(room, actor.id(), members), null, 0,
                favoriteOf(room, actor.id(), members), pinnedResponse);
    }

    @Transactional
    public RoomResponse unpinMessage(UUID roomId, AuthenticatedUser actor, String ipAddress) {
        Room room = roomOrThrow(roomId);
        requireCanPin(room, actor);
        if (room.getPinnedMessage() != null) {
            UUID oldMessageId = room.getPinnedMessage().getId();
            room.setPinnedMessage(null);
            roomRepository.save(room);
            auditService.record("ROOM_MESSAGE_UNPINNED", actorUser(actor.id()), "room", roomId + ":" + oldMessageId, ipAddress);
            chatEventPublisher.publishPinnedMessage(roomId, null);
        }
        List<RoomMember> members = roomMemberRepository.findByRoomId(roomId);
        return RoomResponse.from(room, partnerOf(room, actor.id(), members), null, 0,
                favoriteOf(room, actor.id(), members), null);
    }

    @Transactional
    public RoomMemberResponse addMember(UUID roomId, AddMemberRequest request, AuthenticatedUser actor, String ipAddress) {
        Room room = roomOrThrow(roomId);
        requireCanManage(room, actor);

        User target = userRepository.findById(request.userId())
                .orElseThrow(() -> ApiExceptions.notFound("user/" + request.userId()));
        if (roomMemberRepository.existsByRoomIdAndUserId(roomId, target.getId())) {
            throw ApiExceptions.alreadyMember();
        }

        String role = request.role() != null && !request.role().isBlank()
                ? request.role().trim() : ROLE_MEMBER;
        RoomMember member = addMembership(room, target, role);
        chatEventPublisher.publishRoomAdded(target.getId(), RoomResponse.from(room));
        chatEventPublisher.publishRoomUpdated(roomId, RoomResponse.from(room));
        auditService.record("ROOM_MEMBER_ADDED", actorUser(actor.id()), "member",
                roomId + ":" + target.getId(), ipAddress);
        messageService.createSystem(roomId,
                addedText(room, displayName(actorUser(actor.id())), displayName(target)), actorUser(actor.id()));
        return RoomMemberResponse.from(member);
    }

    @Transactional
    public void removeMember(UUID roomId, UUID targetUserId, AuthenticatedUser actor, String ipAddress) {
        Room room = roomOrThrow(roomId);
        requireCanManage(room, actor);

        RoomMember member = roomMemberRepository.findByRoomIdAndUserId(roomId, targetUserId)
                .orElseThrow(() -> ApiExceptions.notFound("member/" + targetUserId + " na sala " + roomId));
        User target = member.getUser();
        roomMemberRepository.delete(member);
        chatEventPublisher.publishRoomRemoved(targetUserId, roomId);
        chatEventPublisher.publishRoomUpdated(roomId, RoomResponse.from(room));
        auditService.record("ROOM_MEMBER_REMOVED", actorUser(actor.id()), "member",
                roomId + ":" + targetUserId, ipAddress);
        messageService.createSystem(roomId,
                removedText(room, displayName(actorUser(actor.id())), displayName(target)), actorUser(actor.id()));
    }

    private String addedText(Room room, String actorName, String targetName) {
        boolean channel = TYPE_CHANNEL.equals(room.getType());
        if (actorName.equals(targetName)) {
            return actorName + " entrou no " + (channel ? "canal" : "grupo");
        }
        return actorName + " adicionou " + targetName + " ao " + (channel ? "canal" : "grupo");
    }

    private String removedText(Room room, String actorName, String targetName) {
        boolean channel = TYPE_CHANNEL.equals(room.getType());
        if (actorName.equals(targetName)) {
            return actorName + " saiu do " + (channel ? "canal" : "grupo");
        }
        return actorName + " removeu " + targetName + " do " + (channel ? "canal" : "grupo");
    }

    private String displayName(User user) {
        if (user == null) {
            return "Sistema";
        }
        return user.getName() != null && !user.getName().isBlank()
                ? user.getName() : user.getUsername();
    }

    private RoomMember addMembership(Room room, User user, String role) {        RoomMember member = new RoomMember();
        member.setRoom(room);
        member.setUser(user);
        member.setRole(role);
        member.setActive(true);
        return roomMemberRepository.save(member);
    }

    private boolean favoriteOf(Room room, UUID userId, List<RoomMember> members) {
        return TYPE_DIRECT.equals(room.getType()) && members.stream()
                .anyMatch(member -> member.getUser().getId().equals(userId) && member.isActive() && member.isFavorite());
    }

    private Room roomOrThrow(UUID id) {
        return roomRepository.findById(id)
                .orElseThrow(() -> ApiExceptions.notFound("room/" + id));
    }

    private void requireMember(Room room, AuthenticatedUser actor) {
        if (!roomMemberRepository.existsByRoomIdAndUserId(room.getId(), actor.id())) {
            throw ApiExceptions.notRoomMember();
        }
    }

    private void requireCanManage(Room room, AuthenticatedUser actor) {
        if (TYPE_DIRECT.equals(room.getType())) {
            throw ApiExceptions.directRoomManualMembership();
        }
        if (TYPE_CHANNEL.equals(room.getType())) {
            if (!actor.hasRole("ADMIN")) {
                throw ApiExceptions.forbidden("Apenas ADMIN gerencia membros de canais");
            }
            return;
        }
        if (TYPE_PRIVATE_GROUP.equals(room.getType()) && !isOwner(room, actor)) {
            throw ApiExceptions.forbidden("Apenas o criador/owner gerencia membros do grupo privado");
        }
    }

    private boolean isOwner(Room room, AuthenticatedUser actor) {
        return roomMemberRepository.findByRoomIdAndUserId(room.getId(), actor.id())
                .map(member -> member.isActive() && ROLE_OWNER.equals(member.getRole()))
                .orElse(false);
    }

    private User actorUser(UUID actorId) {
        return userRepository.findById(actorId).orElse(null);
    }

    private RoomResponse.DirectPartner partnerOf(Room room, UUID actorId, List<RoomMember> members) {
        if (!TYPE_DIRECT.equals(room.getType())) {
            return null;
        }
        boolean selfDm = members.stream()
                .filter(member -> member.getUser() != null)
                .allMatch(member -> member.getUser().getId().equals(actorId));
        return members.stream()
                .filter(member -> member.getUser() != null
                        && (selfDm || !member.getUser().getId().equals(actorId)))
                .findFirst()
                .map(member -> directPartnerFor(member.getUser()))
                .or(() -> members.stream()
                        .filter(member -> member.getUser() != null && member.getUser().getId().equals(actorId))
                        .findFirst()
                        .map(member -> directPartnerFor(member.getUser())))
                .orElse(null);
    }

    private RoomResponse.DirectPartner directPartnerFor(User user) {
        return new RoomResponse.DirectPartner(user.getId(), user.getUsername(), user.getName(),
                user.getEmail(), user.getAccountStatus(), user.getPresenceStatus());
    }
}
