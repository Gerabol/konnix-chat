package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.exception.ApiException;
import br.gov.pb.cge.konnix.api.room.dto.RoomResponse;
import br.gov.pb.cge.konnix.domain.audit.AuditService;
import br.gov.pb.cge.konnix.domain.message.MessageMentionRepository;
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
class RoomServiceFavoriteTest {

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
    private MessageMentionRepository messageMentionRepository;

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
    void grupoPrivadoFavoritadoContinuaFavoritoNaReleitura() {
        UUID roomId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Room room = new Room();
        room.setId(roomId);
        room.setType(RoomService.TYPE_PRIVATE_GROUP);
        room.setName("Grupo Teste");

        User user = new User();
        user.setId(userId);

        RoomMember member = new RoomMember();
        member.setRoom(room);
        member.setUser(user);
        member.setActive(true);
        member.setFavorite(true);

        when(roomRepository.findById(roomId)).thenReturn(Optional.of(room));
        when(roomMemberRepository.existsByRoomIdAndUserId(roomId, userId)).thenReturn(true);
        when(roomMemberRepository.findByRoomId(roomId)).thenReturn(List.of(member));

        RoomResponse response = roomService.get(roomId, new AuthenticatedUser(userId, "user", "USER", null));

        assertThat(response.favorite()).isTrue();
    }

    @Test
    void canalFavoritadoContinuaFavoritoNaListagemDoUsuario() {
        UUID roomId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Room room = new Room();
        room.setId(roomId);
        room.setType(RoomService.TYPE_CHANNEL);
        room.setName("Canal Teste");
        room.setCreatedAt(Instant.now());
        room.setUpdatedAt(Instant.now());

        User user = new User();
        user.setId(userId);

        RoomMember member = new RoomMember();
        member.setRoom(room);
        member.setUser(user);
        member.setActive(true);
        member.setFavorite(true);

        when(roomMemberRepository.findByUserId(userId)).thenReturn(List.of(member));
        when(roomMemberRepository.findByRoomIdIn(List.of(roomId))).thenReturn(List.of(member));
        when(messageRepository.findLastCreatedAtByRoomIds(List.of(roomId)))
                .thenReturn(List.<Object[]>of(new Object[]{roomId, Instant.now()}));
        when(systemSettingService.readReceiptsEnabled()).thenReturn(false);
        when(roomRepository.findAllById(List.of(roomId))).thenReturn(List.of(room));
        when(messageService.responsesForMessages(any(), eq(userId))).thenReturn(java.util.Map.of());

        List<RoomResponse> responses = roomService.listForUser(new AuthenticatedUser(userId, "user", "USER", null));

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).favorite()).isTrue();
    }

    @Test
    void alternaFavoritoDeGrupoPrivadoEmDuasChamadas() {
        UUID roomId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Room room = new Room();
        room.setId(roomId);
        room.setType(RoomService.TYPE_PRIVATE_GROUP);
        room.setName("Grupo Teste");

        User user = new User();
        user.setId(userId);

        RoomMember member = new RoomMember();
        member.setRoom(room);
        member.setUser(user);
        member.setActive(true);
        member.setFavorite(false);

        when(roomRepository.findById(roomId)).thenReturn(Optional.of(room));
        when(roomMemberRepository.findByRoomId(roomId)).thenReturn(List.of(member));

        RoomResponse first = roomService.toggleFavorite(roomId, new AuthenticatedUser(userId, "user", "USER", null));
        assertThat(first.favorite()).isTrue();

        RoomResponse second = roomService.toggleFavorite(roomId, new AuthenticatedUser(userId, "user", "USER", null));
        assertThat(second.favorite()).isFalse();

        verify(roomMemberRepository, times(2)).save(member);
    }

    @Test
    void favoritaConversaDiretaContinuaFuncionando() {
        UUID roomId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID partnerId = UUID.randomUUID();

        Room room = new Room();
        room.setId(roomId);
        room.setType(RoomService.TYPE_DIRECT);
        room.setName("Conversa Direta");

        User user = new User();
        user.setId(userId);

        User partner = new User();
        partner.setId(partnerId);

        RoomMember member = new RoomMember();
        member.setRoom(room);
        member.setUser(user);
        member.setActive(true);
        member.setFavorite(false);

        RoomMember partnerMember = new RoomMember();
        partnerMember.setRoom(room);
        partnerMember.setUser(partner);
        partnerMember.setActive(true);
        partnerMember.setFavorite(false);

        when(roomRepository.findById(roomId)).thenReturn(Optional.of(room));
        when(roomMemberRepository.findByRoomId(roomId)).thenReturn(List.of(member, partnerMember));

        RoomResponse first = roomService.toggleFavorite(roomId, new AuthenticatedUser(userId, "user", "USER", null));
        assertThat(first.favorite()).isTrue();

        RoomResponse second = roomService.toggleFavorite(roomId, new AuthenticatedUser(userId, "user", "USER", null));
        assertThat(second.favorite()).isFalse();

        verify(roomMemberRepository, times(2)).save(member);
    }

    @Test
    void membroInativoNaoTemFavoritoNaReleitura() {
        UUID roomId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Room room = new Room();
        room.setId(roomId);
        room.setType(RoomService.TYPE_PRIVATE_GROUP);
        room.setName("Grupo Teste");

        User user = new User();
        user.setId(userId);

        RoomMember member = new RoomMember();
        member.setRoom(room);
        member.setUser(user);
        member.setActive(false);
        member.setFavorite(true);

        when(roomRepository.findById(roomId)).thenReturn(Optional.of(room));
        when(roomMemberRepository.existsByRoomIdAndUserId(roomId, userId)).thenReturn(true);
        when(roomMemberRepository.findByRoomId(roomId)).thenReturn(List.of(member));

        RoomResponse response = roomService.get(roomId, new AuthenticatedUser(userId, "user", "USER", null));

        assertThat(response.favorite()).isFalse();
    }

    @Test
    void naoMembroNaoFavoritaSala() {
        UUID roomId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID otherUserId = UUID.randomUUID();

        Room room = new Room();
        room.setId(roomId);
        room.setType(RoomService.TYPE_PRIVATE_GROUP);
        room.setName("Grupo Teste");

        User otherUser = new User();
        otherUser.setId(otherUserId);

        RoomMember otherMember = new RoomMember();
        otherMember.setRoom(room);
        otherMember.setUser(otherUser);
        otherMember.setActive(true);
        otherMember.setFavorite(false);

        when(roomRepository.findById(roomId)).thenReturn(Optional.of(room));
        when(roomMemberRepository.findByRoomId(roomId)).thenReturn(List.of(otherMember));

        assertThatThrownBy(() -> roomService.toggleFavorite(roomId, new AuthenticatedUser(userId, "user", "USER", null)))
                .isInstanceOfSatisfying(ApiException.class,
                        ex -> assertThat(ex.getCode()).isEqualTo("NOT_ROOM_MEMBER"));
    }
}
