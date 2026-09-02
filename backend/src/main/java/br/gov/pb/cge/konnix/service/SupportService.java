package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.exception.ApiExceptions;
import br.gov.pb.cge.konnix.api.message.dto.MessageResponse;
import br.gov.pb.cge.konnix.api.room.dto.RoomResponse;
import br.gov.pb.cge.konnix.domain.attachment.Attachment;
import br.gov.pb.cge.konnix.domain.attachment.AttachmentRepository;
import br.gov.pb.cge.konnix.domain.message.Message;
import br.gov.pb.cge.konnix.domain.message.MessageRepository;
import br.gov.pb.cge.konnix.domain.room.Room;
import br.gov.pb.cge.konnix.domain.room.RoomMember;
import br.gov.pb.cge.konnix.domain.room.RoomMemberRepository;
import br.gov.pb.cge.konnix.domain.room.RoomRepository;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.storage.FileStorageService;
import br.gov.pb.cge.konnix.websocket.ChatEventPublisher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class SupportService {

    private static final Logger log = LoggerFactory.getLogger(SupportService.class);
    private static final String BUG_REPORTS_ROOM = "bug-reports";

    private final RoomRepository roomRepository;
    private final RoomMemberRepository roomMemberRepository;
    private final MessageRepository messageRepository;
    private final UserRepository userRepository;
    private final ChatEventPublisher eventPublisher;
    private final MessageService messageService;
    private final FileStorageService storageService;
    private final AttachmentRepository attachmentRepository;
    private final SystemSettingService systemSettingService;

    public SupportService(RoomRepository roomRepository,
                          RoomMemberRepository roomMemberRepository,
                          MessageRepository messageRepository,
                          UserRepository userRepository,
                          ChatEventPublisher eventPublisher,
                          MessageService messageService,
                          FileStorageService storageService,
                          AttachmentRepository attachmentRepository,
                          SystemSettingService systemSettingService) {
        this.roomRepository = roomRepository;
        this.roomMemberRepository = roomMemberRepository;
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
        this.eventPublisher = eventPublisher;
        this.messageService = messageService;
        this.storageService = storageService;
        this.attachmentRepository = attachmentRepository;
        this.systemSettingService = systemSettingService;
    }

    @Transactional
    public void reportIssue(String content, List<MultipartFile> files, AuthenticatedUser actor) {
        Room room = getOrCreateBugReportsRoom();
        syncAdminMembers(room);

        User reporter = userRepository.findById(actor.id())
                .orElseThrow(() -> new IllegalArgumentException("Usuário não encontrado: " + actor.id()));

        Message message = new Message();
        message.setRoom(room);
        message.setUser(reporter);
        message.setContent(content.trim());
        message.setMessageType("USER");

        messageRepository.save(message);

        MessageResponse response = messageService.responseFor(message, actor.id());
        eventPublisher.publish(room.getId(), "message.created", response);

        if (files != null && !files.isEmpty()) {
            long configuredMax = systemSettingService.maxUploadBytes(62914560L);
            for (MultipartFile file : files) {
                if (file == null || file.isEmpty()) {
                    continue;
                }
                String originalName = file.getOriginalFilename();
                if (originalName == null || originalName.isBlank()) {
                    continue;
                }
                if (file.getSize() > configuredMax) {
                    throw ApiExceptions.fileTooLarge(configuredMax);
                }

                try {
                    byte[] data = file.getBytes();
                    String mimeType = file.getContentType();
                    FileStorageService.StoredFile stored = storageService.store(data);

                    Message fileMessage = new Message();
                    fileMessage.setRoom(room);
                    fileMessage.setUser(reporter);
                    fileMessage.setContent(originalName.trim());
                    fileMessage.setMessageType("FILE");
                    messageRepository.save(fileMessage);

                    Attachment attachment = new Attachment();
                    attachment.setMessage(fileMessage);
                    attachment.setUser(reporter);
                    attachment.setOriginalName(originalName.trim());
                    attachment.setStoredName(stored.storedName());
                    attachment.setMimeType(mimeType);
                    attachment.setSize(stored.size());
                    attachment.setStoragePath(stored.storagePath());
                    attachment.setSha256(stored.sha256());
                    attachmentRepository.save(attachment);

                    MessageResponse fileResponse = messageService.responseFor(fileMessage, actor.id());
                    eventPublisher.publish(room.getId(), "message.created", fileResponse);
                } catch (IOException e) {
                    log.error("Erro ao processar anexo no relato: {}", e.getMessage());
                    throw ApiExceptions.storageError();
                }
            }
        }
    }

    @Transactional
    public MessageResponse respondToReport(UUID messageId, String content, AuthenticatedUser actor) {
        User admin = userRepository.findById(actor.id())
                .orElseThrow(() -> ApiExceptions.notFound("user/" + actor.id()));

        if (!admin.getRoles().stream().anyMatch(role -> "ADMIN".equals(role.getName()))) {
            throw ApiExceptions.forbidden("Somente administradores podem responder a relatos");
        }

        Message bugReport = messageRepository.findById(messageId)
                .filter(m -> m.getDeletedAt() == null)
                .orElseThrow(() -> ApiExceptions.notFound("message/" + messageId));

        Room bugReportsRoom = roomRepository.findByName(BUG_REPORTS_ROOM)
                .orElseThrow(() -> ApiExceptions.notFound("bug-reports room"));

        if (!bugReport.getRoom().getId().equals(bugReportsRoom.getId())) {
            throw ApiExceptions.conflict("MESSAGE_NOT_IN_BUG_REPORTS", "A mensagem não pertence ao canal de relatos");
        }

        User reporter = bugReport.getUser();
        if (reporter == null) {
            throw ApiExceptions.conflict("NO_REPORTER", "Autor do relato não encontrado");
        }

        Room dmRoom = findOrCreateDmRoom(admin, reporter);

        Message dmMessageEntity = new Message();
        dmMessageEntity.setRoom(dmRoom);
        dmMessageEntity.setUser(admin);
        dmMessageEntity.setContent(content.trim());
        dmMessageEntity.setMessageType("USER");
        dmMessageEntity.setParentMessage(bugReport);
        messageRepository.save(dmMessageEntity);

        MessageResponse dmMessage = messageService.responseFor(dmMessageEntity, actor.id());
        eventPublisher.publish(dmRoom.getId(), "message.created", dmMessage);

        return dmMessage;
    }

    private Room findOrCreateDmRoom(User admin, User reporter) {
        List<UUID> existing = roomMemberRepository.findDirectRoomIds(admin.getId(), reporter.getId());
        if (!existing.isEmpty()) {
            return roomRepository.findById(existing.get(0))
                    .orElseThrow(() -> ApiExceptions.notFound("dm room"));
        }

        Room room = new Room();
        room.setName(reporter.getUsername());
        room.setDisplayName(reporter.getName());
        room.setType("DIRECT");
        room.setReadOnly(false);
        room.setCreatedBy(admin);
        roomRepository.save(room);

        addMembership(room, admin);
        addMembership(room, reporter);

        return room;
    }

    private void addMembership(Room room, User user) {
        if (!roomMemberRepository.existsByRoomIdAndUserId(room.getId(), user.getId())) {
            RoomMember member = new RoomMember();
            member.setRoom(room);
            member.setUser(user);
            member.setRole("MEMBER");
            member.setJoinedAt(Instant.now());
            member.setActive(true);
            roomMemberRepository.save(member);
        }
    }

    private Room getOrCreateBugReportsRoom() {
        Optional<Room> existing = roomRepository.findByName(BUG_REPORTS_ROOM);
        if (existing.isPresent()) {
            return existing.get();
        }

        Room room = new Room();
        room.setName(BUG_REPORTS_ROOM);
        room.setDisplayName("Relatos de Bugs");
        room.setType(RoomService.TYPE_CHANNEL);
        room.setReadOnly(true);

        return roomRepository.save(room);
    }

    private void syncAdminMembers(Room room) {
        List<User> admins = userRepository.findByActiveTrueAndRoles_Name("ADMIN");
        for (User admin : admins) {
            if (!roomMemberRepository.existsByRoomIdAndUserId(room.getId(), admin.getId())) {
                RoomMember member = new RoomMember();
                member.setRoom(room);
                member.setUser(admin);
                member.setRole("MEMBER");
                member.setJoinedAt(Instant.now());
                member.setActive(true);
                roomMemberRepository.save(member);

                RoomResponse roomResponse = RoomResponse.from(room, null, room.getUpdatedAt() != null ? room.getUpdatedAt() : room.getCreatedAt(), 0L, false, null);
                eventPublisher.publishRoomAdded(admin.getId(), roomResponse);
            }
        }
    }
}