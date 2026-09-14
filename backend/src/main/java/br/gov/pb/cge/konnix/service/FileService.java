package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.exception.ApiExceptions;
import br.gov.pb.cge.konnix.api.message.dto.MessageResponse;
import br.gov.pb.cge.konnix.api.file.dto.FileResponse;
import br.gov.pb.cge.konnix.domain.attachment.Attachment;
import br.gov.pb.cge.konnix.domain.attachment.AttachmentRepository;
import br.gov.pb.cge.konnix.domain.audit.AuditService;
import br.gov.pb.cge.konnix.domain.message.Message;
import br.gov.pb.cge.konnix.domain.message.MessageRepository;
import br.gov.pb.cge.konnix.domain.room.Room;
import br.gov.pb.cge.konnix.domain.room.RoomMemberRepository;
import br.gov.pb.cge.konnix.domain.room.RoomRepository;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.push.PushNotificationService;
import br.gov.pb.cge.konnix.storage.FileStorageService;
import br.gov.pb.cge.konnix.websocket.ChatEventPublisher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.file.Files;
import java.time.Instant;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;

@Service
public class FileService {

    private static final Logger log = LoggerFactory.getLogger(FileService.class);

    public record DownloadedFile(File file, String mimeType, String originalName) {
    }

    private final FileStorageService storageService;
    private final AttachmentRepository attachmentRepository;
    private final MessageRepository messageRepository;
    private final RoomRepository roomRepository;
    private final RoomMemberRepository roomMemberRepository;
    private final UserRepository userRepository;
    private final AuditService auditService;
    private final ChatEventPublisher eventPublisher;
    private final PushNotificationService pushNotificationService;
    private final SystemSettingService systemSettingService;
    private final long maxFileSize;
    private final RoomAccessService roomAccessService;

    public FileService(FileStorageService storageService,
                       AttachmentRepository attachmentRepository,
                       MessageRepository messageRepository,
                       RoomRepository roomRepository,
                       RoomMemberRepository roomMemberRepository,
                       UserRepository userRepository,
                       AuditService auditService,
                       ChatEventPublisher eventPublisher,
                       PushNotificationService pushNotificationService,
                       SystemSettingService systemSettingService,
                       RoomAccessService roomAccessService,
                       @Value("${konnix.files.max-size:62914560}") long maxFileSize) {
        this.storageService = storageService;
        this.attachmentRepository = attachmentRepository;
        this.messageRepository = messageRepository;
        this.roomRepository = roomRepository;
        this.roomMemberRepository = roomMemberRepository;
        this.userRepository = userRepository;
        this.auditService = auditService;
        this.eventPublisher = eventPublisher;
        this.pushNotificationService = pushNotificationService;
        this.systemSettingService = systemSettingService;
        this.roomAccessService = roomAccessService;
        this.maxFileSize = maxFileSize;
    }

    @Transactional
    public MessageResponse upload(UUID roomId, MultipartFile file, AuthenticatedUser actor, String ipAddress) {
        return upload(roomId, file, null, actor, ipAddress);
    }

    @Transactional
    public MessageResponse upload(UUID roomId, MultipartFile file, String content, AuthenticatedUser actor, String ipAddress) {
        requireWritable(actor);
        Room room = roomOrThrow(roomId);
        requireMember(room, actor);
        if (!roomAccessService.canWriteToRoom(room, actor.id(), actor.hasRole("ADMIN"))) {
            throw ApiExceptions.roomReadOnly();
        }
        if (file == null || file.isEmpty()) {
            throw ApiExceptions.fileEmpty();
        }
        String originalName = file.getOriginalFilename();
        if (originalName == null || originalName.isBlank()) {
            throw ApiExceptions.fileEmpty();
        }
        long configuredMax = systemSettingService.maxUploadBytes(maxFileSize);
        if (file.getSize() > configuredMax) {
            throw ApiExceptions.fileTooLarge(configuredMax);
        }

        String mimeType = file.getContentType();
        byte[] data = readBytes(file);
        if (isAudio(file, mimeType) && !"audio/mpeg".equalsIgnoreCase(mimeType)) {
            ConvertedAudio converted = convertToMp3(data, originalName);
            data = converted.data();
            originalName = converted.originalName();
            mimeType = "audio/mpeg";
        }
        FileStorageService.StoredFile stored = storageService.store(data);
        try {
            User actorUser = actorUser(actor.id());
            Message message = new Message();
            message.setRoom(room);
            message.setUser(actorUser);
            message.setContent(content == null || content.isBlank() ? originalName.trim() : content.trim());
            message.setMessageType("FILE");
            room.setUpdatedAt(Instant.now());
            roomRepository.save(room);
            messageRepository.save(message);

            Attachment attachment = new Attachment();
            attachment.setMessage(message);
            attachment.setUser(actorUser);
            attachment.setOriginalName(originalName.trim());
            attachment.setStoredName(stored.storedName());
            attachment.setMimeType(mimeType);
            attachment.setSize(stored.size());
            attachment.setStoragePath(stored.storagePath());
            attachment.setSha256(stored.sha256());
            attachmentRepository.save(attachment);

            auditService.record("FILE_UPLOADED", actorUser, "attachment",
                    room.getId() + ":" + attachment.getId(), ipAddress);
            MessageResponse response = MessageResponse.from(message, attachment);
            eventPublisher.publish(room.getId(), MessageService.EVENT_MESSAGE_CREATED, response);
            pushNotificationService.notifyNewMessage(room.getId(), response, displayName(room));
            return response;
        } catch (RuntimeException e) {
            storageService.delete(stored.storagePath());
            throw e;
        }
    }

    @Transactional(readOnly = true)
    public DownloadedFile download(UUID attachmentId, AuthenticatedUser actor, String ipAddress) {
        Attachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(ApiExceptions::fileNotFound);
        Message message = attachment.getMessage();
        Room room = message.getRoom();
        requireMember(room, actor);
        File file = storageService.fileFor(attachment.getStoragePath());
        auditService.record("FILE_DOWNLOADED", actorUser(actor.id()), "attachment",
                room.getId() + ":" + attachment.getId(), ipAddress);
        return new DownloadedFile(file, attachment.getMimeType(), attachment.getOriginalName());
    }

    @Transactional(readOnly = true)
    public List<FileResponse> list(UUID roomId, AuthenticatedUser actor) {
        Room room = roomOrThrow(roomId);
        requireMember(room, actor);
        return attachmentRepository.findAllByRoomId(roomId).stream()
                .map(attachment -> new FileResponse(
                        attachment.getId(),
                        attachment.getOriginalName(),
                        attachment.getMimeType(),
                        attachment.getSize(),
                        attachment.getCreatedAt(),
                        attachment.getUser().getId(),
                        attachment.getUser().getUsername(),
                        attachment.getUser().getName()))
                .toList();
    }

    public String contentDisposition(String originalName) {
        String base = sanitizeFileName(originalName);
        String encoded = URLEncoder.encode(base, StandardCharsets.UTF_8).replace("+", "%20");
        return "attachment; filename=\"" + base + "\"; filename*=UTF-8''" + encoded;
    }

    private String sanitizeFileName(String name) {
        String normalized = name == null ? "" : name.replace('\\', '/');
        String base = normalized.substring(normalized.lastIndexOf('/') + 1);
        String cleaned = base.replaceAll("[\\x00-\\x1F\\x7F\"']", "_").trim();
        if (cleaned.isBlank() || cleaned.equals(".") || cleaned.equals("..")) {
            return "arquivo";
        }
        return cleaned;
    }

    private byte[] readBytes(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw ApiExceptions.storageError();
        }
    }

    private boolean isAudio(MultipartFile file, String mimeType) {
        return (mimeType != null && mimeType.toLowerCase(Locale.ROOT).startsWith("audio/"))
                || (file.getOriginalFilename() != null
                && file.getOriginalFilename().toLowerCase(Locale.ROOT).matches(".*\\.(webm|mp4|m4a|wav|ogg|oga|aac|flac|mp3)$"));
    }

    private ConvertedAudio convertToMp3(byte[] data, String originalName) {
        Path input = null;
        Path output = null;
        try {
            input = Files.createTempFile("konnix-audio-", ".source");
            output = Files.createTempFile("konnix-audio-", ".mp3");
            Files.write(input, data);
            Process process = new ProcessBuilder("ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                    "-i", input.toString(), "-vn", "-codec:a", "libmp3lame", "-b:a", "128k", output.toString())
                    .redirectErrorStream(true)
                    .start();
            if (!process.waitFor(60, TimeUnit.SECONDS) || process.exitValue() != 0) {
                process.destroyForcibly();
                throw ApiExceptions.storageError();
            }
            String baseName = originalName.replaceFirst("(?i)\\.[^.]+$", "");
            return new ConvertedAudio(Files.readAllBytes(output), baseName + ".mp3");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw ApiExceptions.storageError();
        } catch (IOException e) {
            throw ApiExceptions.storageError();
        } finally {
            try { if (input != null) Files.deleteIfExists(input); } catch (IOException ignored) { }
            try { if (output != null) Files.deleteIfExists(output); } catch (IOException ignored) { }
        }
    }

    private record ConvertedAudio(byte[] data, String originalName) { }

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
}
