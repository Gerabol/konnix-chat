package br.gov.pb.cge.konnix.api.room;

import br.gov.pb.cge.konnix.api.common.ApiResponse;
import br.gov.pb.cge.konnix.api.room.dto.CreateRoomRequest;
import br.gov.pb.cge.konnix.api.room.dto.RoomResponse;
import br.gov.pb.cge.konnix.api.admin.dto.RoomUpdateRequest;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.service.RoomService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/rooms")
public class RoomController {

    private final RoomService roomService;

    public RoomController(RoomService roomService) {
        this.roomService = roomService;
    }

    @GetMapping
    public ApiResponse<List<RoomResponse>> list(Authentication authentication) {
        return ApiResponse.ok(roomService.listForUser(principal(authentication)));
    }

    @GetMapping("/{id}")
    public ApiResponse<RoomResponse> get(@PathVariable UUID id, Authentication authentication) {
        return ApiResponse.ok(roomService.get(id, principal(authentication)));
    }

    @PatchMapping("/{id}")
    public ApiResponse<RoomResponse> update(@PathVariable UUID id,
                                             @Valid @RequestBody RoomUpdateRequest request,
                                             Authentication authentication,
                                             HttpServletRequest http) {
        return ApiResponse.ok(roomService.update(id, request, principal(authentication), clientIp(http)));
    }

    @PostMapping
    public ApiResponse<RoomResponse> create(@Valid @RequestBody CreateRoomRequest request,
                                            Authentication authentication,
                                            HttpServletRequest http) {
        AuthenticatedUser actor = principal(authentication);
        return ApiResponse.ok(roomService.create(request, actor, clientIp(http)));
    }

    @PostMapping("/{id}/favorite")
    public ApiResponse<RoomResponse> toggleFavorite(@PathVariable UUID id, Authentication authentication) {
        return ApiResponse.ok(roomService.toggleFavorite(id, principal(authentication)));
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
