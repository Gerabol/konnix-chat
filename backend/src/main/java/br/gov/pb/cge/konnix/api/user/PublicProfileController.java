package br.gov.pb.cge.konnix.api.user;

import br.gov.pb.cge.konnix.api.common.ApiResponse;
import br.gov.pb.cge.konnix.api.user.dto.PublicProfileResponse;
import br.gov.pb.cge.konnix.service.UserService;
import br.gov.pb.cge.konnix.service.RoomService;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/profiles/users")
public class PublicProfileController {
    private final UserService userService;
    private final RoomService roomService;

    public PublicProfileController(UserService userService, RoomService roomService) {
        this.userService = userService;
        this.roomService = roomService;
    }

    @GetMapping("/{id}")
    public ApiResponse<PublicProfileResponse> get(@PathVariable UUID id) {
        return ApiResponse.ok(userService.publicProfile(id));
    }

    @GetMapping("/{id}/common-rooms")
    public ApiResponse<java.util.List<br.gov.pb.cge.konnix.api.room.dto.RoomResponse>> commonRooms(
            @PathVariable UUID id, Authentication authentication) {
        return ApiResponse.ok(roomService.commonRooms((AuthenticatedUser) authentication.getPrincipal(), id));
    }
}
