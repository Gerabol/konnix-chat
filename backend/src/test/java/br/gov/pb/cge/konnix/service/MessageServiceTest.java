package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.exception.ApiException;
import br.gov.pb.cge.konnix.api.message.dto.CreateMessageRequest;
import br.gov.pb.cge.konnix.api.message.dto.MessageResponse;
import br.gov.pb.cge.konnix.api.message.dto.UpdateMessageRequest;
import br.gov.pb.cge.konnix.domain.attachment.Attachment;
import br.gov.pb.cge.konnix.domain.attachment.AttachmentRepository;
import br.gov.pb.cge.konnix.domain.audit.AuditService;
import br.gov.pb.cge.konnix.domain.message.Message;
import br.gov.pb.cge.konnix.domain.message.MessageMentionRepository;
import br.gov.pb.cge.konnix.domain.message.MessageReadRepository;
import br.gov.pb.cge.konnix.domain.message.MessageReactionRepository;
import br.gov.pb.cge.konnix.domain.message.MessageRepository;
import br.gov.pb.cge.konnix.domain.poll.PollOptionRepository;
import br.gov.pb.cge.konnix.domain.poll.PollRepository;
import br.gov.pb.cge.konnix.domain.poll.PollVoteRepository;
import br.gov.pb.cge.konnix.domain.room.Room;
import br.gov.pb.cge.konnix.domain.room.RoomMember;
import br.gov.pb.cge.konnix.domain.room.RoomMemberRepository;
import br.gov.pb.cge.konnix.domain.room.RoomRepository;
import br.gov.pb.cge.konnix.domain.user.Role;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.push.PushNotificationService;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.storage.FileStorageService;
import br.gov.pb.cge.konnix.websocket.ChatEventPublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MessageServiceTest {

    @Mock
    private MessageRepository messageRepository;
    @Mock
    private RoomRepository roomRepository;
    @Mock
    private RoomMemberRepository roomMemberRepository;
    @Mock
    private AttachmentRepository attachmentRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private ChatEventPublisher eventPublisher;
    @Mock
    private AuditService auditService;
    @Mock
    private MessageReadRepository messageReadRepository;
    @Mock
    private MessageMentionRepository messageMentionRepository;
    @Mock
    private MessageReactionRepository reactionRepository;
    @Mock
    private PollRepository pollRepository;
    @Mock
    private PollOptionRepository pollOptionRepository;
    @Mock
    private PollVoteRepository pollVoteRepository;
    @Mock
    private SystemSettingService systemSettingService;
    @Mock
    private PushNotificationService pushNotificationService;
    @Mock
    private RoomAccessService roomAccessService;
    @Mock
    private FileStorageService storageService;

    @TempDir
    Path tempDir;

    private MessageService messageService;

    @BeforeEach
    void setUp() {
        messageService = new MessageService(
                messageRepository,
                roomRepository,
                roomMemberRepository,
                userRepository,
                attachmentRepository,
                auditService,
                eventPublisher,
                pushNotificationService,
                messageReadRepository,
                messageMentionRepository,
                systemSettingService,
                reactionRepository,
                pollRepository,
                pollOptionRepository,
                pollVoteRepository,
                roomAccessService,
                storageService
        );
    }

    @Test
    void responsesForMessagesEmptyReturnsEmptyMap() {
        Map<UUID, MessageResponse> result = messageService.responsesForMessages(List.of(), UUID.randomUUID());
        assertThat(result).isEmpty();

        result = messageService.responsesForMessages(null, UUID.randomUUID());
        assertThat(result).isEmpty();
    }

    @Test
    void responsesForMessagesBatchLoadsSuccessfully() {
        UUID actorId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();

        Room room = new Room();
        room.setId(roomId);

        User author = new User();
        author.setId(actorId);
        author.setUsername("maria");
        author.setName("Maria Silva");
        Role userRole = new Role();
        userRole.setName("USER");
        author.setRoles(Set.of(userRole));

        Message m1 = new Message();
        m1.setId(UUID.randomUUID());
        m1.setRoom(room);
        m1.setUser(author);
        m1.setContent("Primeira mensagem");
        m1.setCreatedAt(Instant.now());

        Message m2 = new Message();
        m2.setId(UUID.randomUUID());
        m2.setRoom(room);
        m2.setUser(author);
        m2.setContent("Segunda mensagem");
        m2.setCreatedAt(Instant.now());

        Attachment attachment = new Attachment();
        attachment.setId(UUID.randomUUID());
        attachment.setMessage(m1);
        attachment.setOriginalName("relatorio.pdf");
        attachment.setMimeType("application/pdf");
        attachment.setSize(1024L);

        RoomMember rm = new RoomMember();
        rm.setRoom(room);
        rm.setUser(author);
        rm.setRole("OWNER");

        when(attachmentRepository.findAllByMessageIdIn(List.of(m1.getId(), m2.getId()))).thenReturn(List.of(attachment));
        when(messageReadRepository.findByMessageIdIn(List.of(m1.getId(), m2.getId()))).thenReturn(List.of());
        when(reactionRepository.findByMessageIdIn(List.of(m1.getId(), m2.getId()))).thenReturn(List.of());
        when(systemSettingService.readReceiptsEnabled()).thenReturn(true);
        when(roomMemberRepository.findByRoomIdIn(any())).thenReturn(List.of(rm));
        when(pollRepository.findByMessageIdIn(List.of(m1.getId(), m2.getId()))).thenReturn(List.of());

        Map<UUID, MessageResponse> responses = messageService.responsesForMessages(List.of(m1, m2), actorId);

        assertThat(responses).hasSize(2);
        assertThat(responses.get(m1.getId())).isNotNull();
        assertThat(responses.get(m1.getId()).attachment()).isNotNull();
        assertThat(responses.get(m1.getId()).attachment().originalName()).isEqualTo("relatorio.pdf");
        assertThat(responses.get(m1.getId()).roles()).contains("OWNER");

        assertThat(responses.get(m2.getId())).isNotNull();
        assertThat(responses.get(m2.getId()).attachment()).isNull();
        assertThat(responses.get(m2.getId()).roles()).contains("OWNER");
    }
    @Test
    void preservesMultipleAttachmentsInHistoryBatchAndSingleResponses() {
        Room room = new Room(); room.setId(UUID.randomUUID());
        Message message = new Message(); message.setId(UUID.randomUUID()); message.setRoom(room);
        Attachment first = new Attachment(); first.setId(UUID.randomUUID()); first.setMessage(message);
        first.setOriginalName("first.txt");
        Attachment second = new Attachment(); second.setId(UUID.randomUUID()); second.setMessage(message);
        second.setOriginalName("second.txt");
        when(attachmentRepository.findAllByMessageIdIn(List.of(message.getId())))
                .thenReturn(List.of(first, second));
        UUID actor = UUID.randomUUID();
        List<MessageResponse> history = org.springframework.test.util.ReflectionTestUtils.invokeMethod(
                messageService, "toResponses", List.of(message), actor);
        MessageResponse batch = messageService.responsesForMessages(List.of(message), actor).get(message.getId());
        MessageResponse single = messageService.responseFor(message, actor);
        for (MessageResponse response : List.of(history.getFirst(), batch, single)) {
            assertThat(response.attachments()).extracting(MessageResponse.AttachmentMetadata::id)
                    .containsExactlyInAnyOrder(first.getId(), second.getId());
            assertThat(response.attachment()).isEqualTo(response.attachments().getFirst());
        }
    }
    @Test
    void hidesGeneratedPreviewInHistoryBatchAndSingleResponsesWithoutDeletingIt() {
        Room room = new Room(); room.setId(UUID.randomUUID());
        Message message = new Message(); message.setId(UUID.randomUUID()); message.setRoom(room);
        Attachment original = new Attachment(); original.setId(UUID.randomUUID()); original.setMessage(message);
        original.setOriginalName("photo.jpg");
        Attachment preview = new Attachment(); preview.setId(UUID.randomUUID()); preview.setMessage(message);
        preview.setOriginalName("thumb-photo.jpg"); preview.setPreview(true);
        when(attachmentRepository.findAllByMessageIdIn(List.of(message.getId())))
                .thenReturn(List.of(preview, original));
        UUID actor = UUID.randomUUID();
        List<MessageResponse> history = org.springframework.test.util.ReflectionTestUtils.invokeMethod(
                messageService, "toResponses", List.of(message), actor);
        for (MessageResponse response : List.of(history.getFirst(),
                messageService.responsesForMessages(List.of(message), actor).get(message.getId()),
                messageService.responseFor(message, actor))) {
            assertThat(response.attachments()).extracting(MessageResponse.AttachmentMetadata::id)
                    .containsExactly(original.getId());
            assertThat(response.attachment().id()).isEqualTo(original.getId());
        }
        org.mockito.Mockito.verify(attachmentRepository, org.mockito.Mockito.never()).delete(any());
        when(attachmentRepository.findAllByMessageIdIn(List.of(message.getId())))
                .thenReturn(List.of(preview));
        assertThat(messageService.responseFor(message, actor).attachments())
                .extracting(MessageResponse.AttachmentMetadata::id).containsExactly(preview.getId());
        // A user-supplied file named thumb-* remains a normal attachment unless explicitly marked.
        preview.setPreview(false);
        when(attachmentRepository.findAllByMessageIdIn(List.of(message.getId())))
                .thenReturn(List.of(preview, original));
        assertThat(messageService.responseFor(message, actor).attachments()).hasSize(2);
    }
    @Test
    void forwardsAttachmentsCopyingThePhysicalFileAndDroppingTheGeneratedCaption() throws Exception {
        UUID actorId = UUID.randomUUID();
        UUID originRoomId = UUID.randomUUID();
        UUID targetRoomId = UUID.randomUUID();
        UUID sourceMessageId = UUID.randomUUID();

        User actor = new User();
        actor.setId(actorId);
        actor.setUsername("ana");
        User originalAuthor = new User();
        originalAuthor.setId(UUID.randomUUID());
        originalAuthor.setUsername("bruno");

        Room target = new Room();
        target.setId(targetRoomId);
        target.setName("Grupo");
        Room origin = new Room();
        origin.setId(originRoomId);
        origin.setName("Privada");

        Message source = new Message();
        source.setId(sourceMessageId);
        source.setRoom(origin);
        source.setUser(originalAuthor);
        source.setContent("diagrama.png");

        Attachment sourceFile = new Attachment();
        sourceFile.setId(UUID.randomUUID());
        sourceFile.setMessage(source);
        sourceFile.setUser(originalAuthor);
        sourceFile.setOriginalName("diagrama.png");
        sourceFile.setMimeType("image/png");
        sourceFile.setSize(9L);
        sourceFile.setStoragePath("2026/09/original");
        sourceFile.setStoredName("original");
        sourceFile.setSha256("abc");

        AuthenticatedUser principal = new AuthenticatedUser(actorId, "ana", "Ana", Set.of("USER"));
        Path physical = tempDir.resolve("original");
        when(userRepository.findById(actorId)).thenReturn(Optional.of(actor));
        when(roomRepository.findById(targetRoomId)).thenReturn(Optional.of(target));
        when(roomMemberRepository.existsByRoomIdAndUserId(targetRoomId, actorId)).thenReturn(true);
        when(roomMemberRepository.existsByRoomIdAndUserId(originRoomId, actorId)).thenReturn(true);
        when(roomAccessService.canWriteToRoom(target, actorId, false)).thenReturn(true);
        when(messageRepository.findById(sourceMessageId)).thenReturn(Optional.of(source));
        when(attachmentRepository.findOriginalsByMessageId(sourceMessageId)).thenReturn(List.of(sourceFile));
        when(storageService.fileFor("2026/09/original")).thenReturn(physical.toFile());
        when(storageService.store(any(byte[].class)))
                .thenReturn(new FileStorageService.StoredFile(UUID.randomUUID(),
                        "2026/09/copy", "copy", 9L, "abc"));
        when(attachmentRepository.save(any(Attachment.class))).thenAnswer(call -> call.getArgument(0));
        when(attachmentRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(messageRepository.save(any(Message.class))).thenAnswer(call -> {
            Message saved = call.getArgument(0);
            if (saved.getId() == null) {
                saved.setId(UUID.randomUUID());
            }
            return saved;
        });

        Files.writeString(physical, "conteudo");

        MessageResponse response = messageService.create(targetRoomId,
                new CreateMessageRequest("diagrama.png", null, sourceMessageId), principal, "10.0.0.1");

        ArgumentCaptor<Attachment> saved = ArgumentCaptor.forClass(Attachment.class);
        verify(attachmentRepository).save(saved.capture());
        Attachment copy = saved.getValue();
        assertThat(copy.getMessage()).isNotNull();
        assertThat(copy.getUser()).isSameAs(actor);
        assertThat(copy.getOriginalName()).isEqualTo("diagrama.png");
        assertThat(copy.getMimeType()).isEqualTo("image/png");
        assertThat(copy.getStoragePath()).isEqualTo("2026/09/copy");
        assertThat(copy.getSha256()).isEqualTo("abc");
        assertThat(copy.isPreview()).isFalse();
        // Arquivo novo, sem reaproveitar o caminho da origem.
        assertThat(copy.getStoragePath()).isNotEqualTo(sourceFile.getStoragePath());
        // A legenda que só repetia o nome do arquivo não é enviada.
        assertThat(response.content()).isEmpty();
        assertThat(response.messageType()).isEqualTo("FILE");
        assertThat(response.forwardedFromUsername()).isEqualTo("bruno");
    }

    @Test
    void forwardedTextMessageKeepsItsContentAndCreatesNoAttachment() {
        UUID actorId = UUID.randomUUID();
        UUID sourceMessageId = UUID.randomUUID();
        UUID targetRoomId = UUID.randomUUID();
        UUID originRoomId = UUID.randomUUID();

        User actor = new User();
        actor.setId(actorId);
        Room target = new Room();
        target.setId(targetRoomId);
        target.setName("Canal");
        Room origin = new Room();
        origin.setId(originRoomId);
        Message source = new Message();
        source.setId(sourceMessageId);
        source.setRoom(origin);
        source.setUser(actor);
        source.setContent("Bom dia pessoal");

        AuthenticatedUser principal = new AuthenticatedUser(actorId, "ana", "Ana", Set.of("USER"));
        when(userRepository.findById(actorId)).thenReturn(Optional.of(actor));
        when(roomRepository.findById(targetRoomId)).thenReturn(Optional.of(target));
        when(roomMemberRepository.existsByRoomIdAndUserId(targetRoomId, actorId)).thenReturn(true);
        when(roomMemberRepository.existsByRoomIdAndUserId(originRoomId, actorId)).thenReturn(true);
        when(roomAccessService.canWriteToRoom(target, actorId, false)).thenReturn(true);
        when(messageRepository.findById(sourceMessageId)).thenReturn(Optional.of(source));
        when(attachmentRepository.findOriginalsByMessageId(sourceMessageId)).thenReturn(List.of());
        when(attachmentRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(messageRepository.save(any(Message.class))).thenAnswer(call -> {
            Message saved = call.getArgument(0);
            if (saved.getId() == null) {
                saved.setId(UUID.randomUUID());
            }
            return saved;
        });

        MessageResponse response = messageService.create(targetRoomId,
                new CreateMessageRequest("Bom dia pessoal", null, sourceMessageId), principal, null);

        assertThat(response.content()).isEqualTo("Bom dia pessoal");
        assertThat(response.messageType()).isEqualTo("USER");
        verify(attachmentRepository, never()).save(any(Attachment.class));
        verify(storageService, never()).store(any(byte[].class));
    }

    @Test
    void removesTheCopiedFileWhenTheForwardFails() throws Exception {
        UUID actorId = UUID.randomUUID();
        UUID sourceMessageId = UUID.randomUUID();
        UUID targetRoomId = UUID.randomUUID();
        UUID originRoomId = UUID.randomUUID();

        User actor = new User();
        actor.setId(actorId);
        Room target = new Room();
        target.setId(targetRoomId);
        Room origin = new Room();
        origin.setId(originRoomId);
        Message source = new Message();
        source.setId(sourceMessageId);
        source.setRoom(origin);
        source.setUser(actor);
        source.setContent("planilha.xlsx");

        Attachment sourceFile = new Attachment();
        sourceFile.setId(UUID.randomUUID());
        sourceFile.setMessage(source);
        sourceFile.setOriginalName("planilha.xlsx");
        sourceFile.setStoragePath("2026/09/original");

        AuthenticatedUser principal = new AuthenticatedUser(actorId, "ana", "Ana", Set.of("USER"));
        when(userRepository.findById(actorId)).thenReturn(Optional.of(actor));
        when(roomRepository.findById(targetRoomId)).thenReturn(Optional.of(target));
        when(roomMemberRepository.existsByRoomIdAndUserId(targetRoomId, actorId)).thenReturn(true);
        when(roomMemberRepository.existsByRoomIdAndUserId(originRoomId, actorId)).thenReturn(true);
        when(roomAccessService.canWriteToRoom(target, actorId, false)).thenReturn(true);
        when(messageRepository.findById(sourceMessageId)).thenReturn(Optional.of(source));
        when(attachmentRepository.findOriginalsByMessageId(sourceMessageId)).thenReturn(List.of(sourceFile));
        when(storageService.fileFor("2026/09/original")).thenReturn(tempDir.resolve("original").toFile());
        when(storageService.store(any(byte[].class)))
                .thenReturn(new FileStorageService.StoredFile(UUID.randomUUID(),
                        "2026/09/copy", "copy", 4L, "def"));
        when(attachmentRepository.save(any(Attachment.class))).thenThrow(new IllegalStateException("falha ao gravar"));
        when(messageRepository.save(any(Message.class))).thenAnswer(call -> {
            Message saved = call.getArgument(0);
            if (saved.getId() == null) {
                saved.setId(UUID.randomUUID());
            }
            return saved;
        });

        Files.writeString(tempDir.resolve("original"), "planilha");

        assertThatThrownBy(() -> messageService.create(targetRoomId,
                new CreateMessageRequest("planilha.xlsx", null, sourceMessageId), principal, null))
                .isInstanceOf(IllegalStateException.class);

        verify(storageService).delete("2026/09/copy");
    }

    @Test
    void keepsTheCaptionWhenTheAuthorWroteOneAlongsideTheFile() throws Exception {
        UUID actorId = UUID.randomUUID();
        UUID sourceMessageId = UUID.randomUUID();
        UUID targetRoomId = UUID.randomUUID();
        UUID originRoomId = UUID.randomUUID();

        User actor = new User();
        actor.setId(actorId);
        Room target = new Room();
        target.setId(targetRoomId);
        Room origin = new Room();
        origin.setId(originRoomId);
        Message source = new Message();
        source.setId(sourceMessageId);
        source.setRoom(origin);
        source.setUser(actor);
        source.setContent("Olha esse print");

        Attachment sourceFile = new Attachment();
        sourceFile.setId(UUID.randomUUID());
        sourceFile.setMessage(source);
        sourceFile.setOriginalName("print.png");
        sourceFile.setStoragePath("2026/09/original");

        AuthenticatedUser principal = new AuthenticatedUser(actorId, "ana", "Ana", Set.of("USER"));
        Files.writeString(tempDir.resolve("original"), "png");
        when(userRepository.findById(actorId)).thenReturn(Optional.of(actor));
        when(roomRepository.findById(targetRoomId)).thenReturn(Optional.of(target));
        when(roomMemberRepository.existsByRoomIdAndUserId(targetRoomId, actorId)).thenReturn(true);
        when(roomMemberRepository.existsByRoomIdAndUserId(originRoomId, actorId)).thenReturn(true);
        when(roomAccessService.canWriteToRoom(target, actorId, false)).thenReturn(true);
        when(messageRepository.findById(sourceMessageId)).thenReturn(Optional.of(source));
        when(attachmentRepository.findOriginalsByMessageId(sourceMessageId)).thenReturn(List.of(sourceFile));
        when(storageService.fileFor("2026/09/original")).thenReturn(tempDir.resolve("original").toFile());
        when(storageService.store(any(byte[].class)))
                .thenReturn(new FileStorageService.StoredFile(UUID.randomUUID(),
                        "2026/09/copy", "copy", 3L, "ghi"));
        when(attachmentRepository.save(any(Attachment.class))).thenAnswer(call -> call.getArgument(0));
        when(attachmentRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(messageRepository.save(any(Message.class))).thenAnswer(call -> {
            Message saved = call.getArgument(0);
            if (saved.getId() == null) {
                saved.setId(UUID.randomUUID());
            }
            return saved;
        });

        MessageResponse response = messageService.create(targetRoomId,
                new CreateMessageRequest("Olha esse print", null, sourceMessageId), principal, null);

        assertThat(response.content()).isEqualTo("Olha esse print");
        verify(attachmentRepository).save(any(Attachment.class));
    }

    private Message editableMessage(UUID authorId, String content) {
        Room room = new Room();
        room.setId(UUID.randomUUID());

        User author = new User();
        author.setId(authorId);
        author.setUsername("ana");
        author.setName("Ana");
        author.setRoles(Set.of());

        Message message = new Message();
        message.setId(UUID.randomUUID());
        message.setRoom(room);
        message.setUser(author);
        message.setContent(content);
        message.setMessageType("USER");
        return message;
    }

    private void stubResponseDependencies() {
        when(attachmentRepository.findAllByMessageIdIn(any())).thenReturn(List.of());
        when(reactionRepository.findByMessageIdIn(any())).thenReturn(List.of());
        when(pollRepository.findByMessageId(any())).thenReturn(Optional.empty());
        when(systemSettingService.readReceiptsEnabled()).thenReturn(false);
        when(roomMemberRepository.findByRoomIdAndUserId(any(), any())).thenReturn(Optional.empty());
        when(messageRepository.save(any(Message.class))).thenAnswer(call -> call.getArgument(0));
    }

    @Test
    void updatesCaptionOfMessageWithAttachment() {
        UUID actorId = UUID.randomUUID();
        Message message = editableMessage(actorId, "print.png");
        AuthenticatedUser principal = new AuthenticatedUser(actorId, "ana", "Ana", Set.of("USER"));

        User actor = new User();
        actor.setId(actorId);
        when(userRepository.findById(actorId)).thenReturn(Optional.of(actor));
        when(messageRepository.findById(message.getId())).thenReturn(Optional.of(message));
        stubResponseDependencies();

        MessageResponse response = messageService.update(
                message.getId(), new UpdateMessageRequest("Relatório do trimestre"), principal, null);

        assertThat(response.content()).isEqualTo("Relatório do trimestre");
        assertThat(message.getContent()).isEqualTo("Relatório do trimestre");
        assertThat(message.getEditedAt()).isNotNull();
    }

    @Test
    void allowsClearingCaptionWhenMessageHasAttachment() {
        UUID actorId = UUID.randomUUID();
        Message message = editableMessage(actorId, "print.png");
        AuthenticatedUser principal = new AuthenticatedUser(actorId, "ana", "Ana", Set.of("USER"));

        User actor = new User();
        actor.setId(actorId);
        when(userRepository.findById(actorId)).thenReturn(Optional.of(actor));
        when(messageRepository.findById(message.getId())).thenReturn(Optional.of(message));
        when(attachmentRepository.findByMessageId(message.getId())).thenReturn(Optional.of(new Attachment()));
        stubResponseDependencies();

        MessageResponse response = messageService.update(message.getId(), new UpdateMessageRequest("   "), principal, null);

        assertThat(response.content()).isEmpty();
    }

    @Test
    void rejectsClearingTextOfMessageWithoutAttachment() {
        UUID actorId = UUID.randomUUID();
        Message message = editableMessage(actorId, "Bom dia");
        AuthenticatedUser principal = new AuthenticatedUser(actorId, "ana", "Ana", Set.of("USER"));

        User actor = new User();
        actor.setId(actorId);
        when(userRepository.findById(actorId)).thenReturn(Optional.of(actor));
        when(messageRepository.findById(message.getId())).thenReturn(Optional.of(message));
        when(attachmentRepository.findByMessageId(message.getId())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> messageService.update(message.getId(), new UpdateMessageRequest(""), principal, null))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getCode())
                .isEqualTo("MESSAGE_CONTENT_REQUIRED");

        assertThat(message.getContent()).isEqualTo("Bom dia");
    }

    @Test
    void rejectsNullContentOnMessageWithoutAttachment() {
        UUID actorId = UUID.randomUUID();
        Message message = editableMessage(actorId, "Bom dia");
        AuthenticatedUser principal = new AuthenticatedUser(actorId, "ana", "Ana", Set.of("USER"));

        User actor = new User();
        actor.setId(actorId);
        when(userRepository.findById(actorId)).thenReturn(Optional.of(actor));
        when(messageRepository.findById(message.getId())).thenReturn(Optional.of(message));
        when(attachmentRepository.findByMessageId(message.getId())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> messageService.update(message.getId(), new UpdateMessageRequest(null), principal, null))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getCode())
                .isEqualTo("MESSAGE_CONTENT_REQUIRED");
    }

}
