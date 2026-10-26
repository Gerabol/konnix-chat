package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.domain.attachment.AttachmentRepository;
import br.gov.pb.cge.konnix.domain.audit.AuditService;
import br.gov.pb.cge.konnix.domain.message.Message;
import br.gov.pb.cge.konnix.domain.message.MessageMention;
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
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.push.PushNotificationService;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.storage.FileStorageService;
import br.gov.pb.cge.konnix.websocket.ChatEventPublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MessageServiceMentionTest {

    @Mock private MessageRepository messageRepository;
    @Mock private RoomRepository roomRepository;
    @Mock private RoomMemberRepository roomMemberRepository;
    @Mock private UserRepository userRepository;
    @Mock private AttachmentRepository attachmentRepository;
    @Mock private AuditService auditService;
    @Mock private ChatEventPublisher eventPublisher;
    @Mock private PushNotificationService pushNotificationService;
    @Mock private MessageReadRepository messageReadRepository;
    @Mock private MessageMentionRepository messageMentionRepository;
    @Mock private SystemSettingService systemSettingService;
    @Mock private MessageReactionRepository reactionRepository;
    @Mock private PollRepository pollRepository;
    @Mock private PollOptionRepository pollOptionRepository;
    @Mock private PollVoteRepository pollVoteRepository;
    @Mock private RoomAccessService roomAccessService;
    @Mock private FileStorageService storageService;

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
    void processMentions_quandoMembroCitado_salvaMencaoENotificaWebSocket() {
        UUID roomId = UUID.randomUUID();
        Room room = new Room();
        room.setId(roomId);

        User author = new User();
        author.setId(UUID.randomUUID());
        author.setUsername("carlos");

        User target = new User();
        target.setId(UUID.randomUUID());
        target.setUsername("maria");

        RoomMember memberAuthor = new RoomMember();
        memberAuthor.setUser(author);
        memberAuthor.setActive(true);

        RoomMember memberTarget = new RoomMember();
        memberTarget.setUser(target);
        memberTarget.setActive(true);

        when(roomMemberRepository.findByRoomId(roomId)).thenReturn(List.of(memberAuthor, memberTarget));
        when(messageMentionRepository.countUnreadByRoomId(roomId, target.getId())).thenReturn(1L);

        Message message = new Message();
        message.setId(UUID.randomUUID());
        message.setRoom(room);
        message.setUser(author);
        message.setContent("Olá @maria, você pode verificar o relatório?");

        messageService.processMentions(message, room, author);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<MessageMention>> captor = ArgumentCaptor.forClass(List.class);
        verify(messageMentionRepository).saveAll(captor.capture());
        List<MessageMention> saved = captor.getValue();
        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getUser().getId()).isEqualTo(target.getId());

        verify(eventPublisher).publishMentionsUpdated(target.getId(), roomId, 1L);
    }

    @Test
    void processMentions_quandoMencionaASiMesmo_naoSalvaMencao() {
        UUID roomId = UUID.randomUUID();
        Room room = new Room();
        room.setId(roomId);

        User author = new User();
        author.setId(UUID.randomUUID());
        author.setUsername("carlos");

        RoomMember memberAuthor = new RoomMember();
        memberAuthor.setUser(author);
        memberAuthor.setActive(true);

        when(roomMemberRepository.findByRoomId(roomId)).thenReturn(List.of(memberAuthor));

        Message message = new Message();
        message.setId(UUID.randomUUID());
        message.setRoom(room);
        message.setUser(author);
        message.setContent("Nota para mim mesmo @carlos");

        messageService.processMentions(message, room, author);

        verify(messageMentionRepository, never()).saveAll(any());
        verify(eventPublisher, never()).publishMentionsUpdated(any(), any(), anyLong());
    }

    @Test
    void processMentions_quandoConversaDireta_naoSalvaMencao() {
        UUID roomId = UUID.randomUUID();
        Room room = new Room();
        room.setId(roomId);
        room.setType("DIRECT");

        User author = new User();
        author.setId(UUID.randomUUID());
        author.setUsername("carlos");

        User partner = new User();
        partner.setId(UUID.randomUUID());
        partner.setUsername("maria");

        RoomMember memberPartner = new RoomMember();
        memberPartner.setUser(partner);
        memberPartner.setActive(true);

        Message message = new Message();
        message.setId(UUID.randomUUID());
        message.setRoom(room);
        message.setUser(author);
        message.setContent("Olá @maria, tudo bem?");

        messageService.processMentions(message, room, author);

        verify(messageMentionRepository, never()).saveAll(any());
        verify(eventPublisher, never()).publishMentionsUpdated(any(), any(), anyLong());
    }

    @Test
    void markRoomRead_marcaMencoesComoLidasENotificaZero() {
        UUID roomId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        AuthenticatedUser actor = new AuthenticatedUser(userId, "carlos", "Carlos", Set.of("ROLE_USER"));

        Room room = new Room();
        room.setId(roomId);
        when(roomRepository.findById(roomId)).thenReturn(Optional.of(room));
        when(roomMemberRepository.existsByRoomIdAndUserId(roomId, userId)).thenReturn(true);
        when(roomMemberRepository.findByRoomIdAndUserId(roomId, userId)).thenReturn(Optional.empty());

        messageService.markRoomRead(roomId, actor);

        verify(messageMentionRepository).markRoomMentionsAsRead(eq(roomId), eq(userId), any(Instant.class));
        verify(eventPublisher).publishMentionsUpdated(userId, roomId, 0L);
    }
}
