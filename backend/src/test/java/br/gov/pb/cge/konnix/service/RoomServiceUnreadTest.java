package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.exception.ApiException;
import br.gov.pb.cge.konnix.api.room.dto.RoomResponse;
import br.gov.pb.cge.konnix.domain.audit.AuditService;
import br.gov.pb.cge.konnix.domain.message.MessageRepository;
import br.gov.pb.cge.konnix.domain.room.Room;
import br.gov.pb.cge.konnix.domain.room.RoomMember;
import br.gov.pb.cge.konnix.domain.room.RoomMemberRepository;
import br.gov.pb.cge.konnix.domain.room.RoomRepository;
import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.websocket.ChatEventPublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RoomServiceUnreadTest {

    @Mock
    private RoomRepository roomRepository;
    @Mock
    private RoomMemberRepository roomMemberRepository;
    @Mock
    private MessageRepository messageRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private AuditService auditService;
    @Mock
    private MessageService messageService;
    @Mock
    private SystemSettingService systemSettingService;
    @Mock
    private ChatEventPublisher chatEventPublisher;
    @Mock
    private br.gov.pb.cge.konnix.domain.message.MessageMentionRepository messageMentionRepository;

    private RoomService roomService;

    @BeforeEach
    void setUp() {
        roomService = new RoomService(
                roomRepository,
                roomMemberRepository,
                messageRepository,
                userRepository,
                auditService,
                messageService,
                systemSettingService,
                chatEventPublisher,
                messageMentionRepository
        );
    }

    @Test
    void markAsUnread_quandoMembroAtivo_marcaComoNaoLidoENotificaWebSocket() {
        UUID roomId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Room room = new Room();
        room.setId(roomId);
        room.setName("grupo-geral");
        room.setType("CHANNEL");

        User user = new User();
        user.setId(userId);
        user.setUsername("maria");

        RoomMember member = new RoomMember();
        member.setId(UUID.randomUUID());
        member.setRoom(room);
        member.setUser(user);
        member.setActive(true);
        member.setMarkedUnread(false);

        when(roomRepository.findById(roomId)).thenReturn(Optional.of(room));
        when(roomMemberRepository.findByRoomId(roomId)).thenReturn(List.of(member));
        when(roomMemberRepository.findByRoomIdAndUserId(roomId, userId)).thenReturn(Optional.of(member));
        when(roomMemberRepository.save(any(RoomMember.class))).thenAnswer(invocation -> invocation.getArgument(0));

        RoomResponse response = roomService.markAsUnread(roomId, new AuthenticatedUser(userId, "maria", "USER", null));

        assertThat(response).isNotNull();
        assertThat(response.markedUnread()).isTrue();
        assertThat(member.isMarkedUnread()).isTrue();

        verify(roomMemberRepository).save(member);
        verify(chatEventPublisher).publishUnreadUpdated(userId, roomId, true);
    }

    @Test
    void markAsUnread_quandoNaoEMembro_lancaExcecao() {
        UUID roomId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Room room = new Room();
        room.setId(roomId);
        room.setName("grupo-restrito");
        room.setType("PRIVATE_GROUP");

        when(roomRepository.findById(roomId)).thenReturn(Optional.of(room));
        when(roomMemberRepository.findByRoomIdAndUserId(roomId, userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> roomService.markAsUnread(roomId, new AuthenticatedUser(userId, "joao", "USER", null)))
                .isInstanceOf(ApiException.class)
                .matches(e -> ((ApiException) e).getCode().equals("NOT_ROOM_MEMBER"));

        verify(chatEventPublisher, never()).publishUnreadUpdated(any(), any(), anyBoolean());
    }

    @Test
    void listForUser_retornaStatusMarkedUnreadCorreto() {
        UUID roomId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Room room = new Room();
        room.setId(roomId);
        room.setName("canal-noticias");
        room.setType("CHANNEL");
        room.setCreatedAt(Instant.now());

        User user = new User();
        user.setId(userId);
        user.setUsername("maria");

        RoomMember member = new RoomMember();
        member.setId(UUID.randomUUID());
        member.setRoom(room);
        member.setUser(user);
        member.setActive(true);
        member.setMarkedUnread(true);

        when(roomMemberRepository.findByUserId(userId)).thenReturn(List.of(member));
        when(roomMemberRepository.findByRoomIdIn(List.of(roomId))).thenReturn(List.of(member));
        when(roomRepository.findAllById(List.of(roomId))).thenReturn(List.of(room));
        when(systemSettingService.readReceiptsEnabled()).thenReturn(false);

        List<RoomResponse> list = roomService.listForUser(new AuthenticatedUser(userId, "maria", "USER", null));

        assertThat(list).hasSize(1);
        assertThat(list.get(0).markedUnread()).isTrue();
    }
}
