package br.gov.pb.cge.konnix.api.room;

import br.gov.pb.cge.konnix.api.common.ApiResponse;
import br.gov.pb.cge.konnix.api.room.dto.AddMemberRequest;
import br.gov.pb.cge.konnix.api.room.dto.RoomMemberResponse;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.service.RoomService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/rooms/{roomId}/members")
public class RoomMemberController {

    private final RoomService roomService;

    public RoomMemberController(RoomService roomService) {
        this.roomService = roomService;
    }

    @GetMapping
    public ApiResponse<List<RoomMemberResponse>> list(@PathVariable UUID roomId, Authentication authentication) {
        return ApiResponse.ok(roomService.members(roomId, principal(authentication)));
    }

    @PostMapping
    public ApiResponse<RoomMemberResponse> add(@PathVariable UUID roomId,
                                               @Valid @RequestBody AddMemberRequest request,
                                               Authentication authentication,
                                               HttpServletRequest http) {
        return ApiResponse.ok(roomService.addMember(roomId, request, principal(authentication), clientIp(http)));
    }

    @DeleteMapping("/{userId}")
    public ApiResponse<Void> remove(@PathVariable UUID roomId,
                                    @PathVariable UUID userId,
                                    Authentication authentication,
                                    HttpServletRequest http) {
        roomService.removeMember(roomId, userId, principal(authentication), clientIp(http));
        return ApiResponse.ok(null);
    }

    private AuthenticatedUser principal(Authentication authentication) {
        return (AuthenticatedUser) authentication.getPrincipal();
    }

    private String clientIp(HttpServletRequest http) {
        String forwarded = http.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return http.getRemoteAddr();
    }
}
