package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.message.dto.MessageResponse;
import br.gov.pb.cge.konnix.domain.attachment.Attachment;
import br.gov.pb.cge.konnix.domain.attachment.AttachmentRepository;
import br.gov.pb.cge.konnix.domain.audit.AuditService;
import br.gov.pb.cge.konnix.domain.message.Message;
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
import br.gov.pb.cge.konnix.websocket.ChatEventPublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
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
                systemSettingService,
                reactionRepository,
                pollRepository,
                pollOptionRepository,
                pollVoteRepository,
                roomAccessService
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
}
