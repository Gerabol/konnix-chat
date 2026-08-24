package br.gov.pb.cge.konnix.api.room;

import br.gov.pb.cge.konnix.api.common.ApiResponse;
import br.gov.pb.cge.konnix.api.room.dto.DirectMessageRequest;
import br.gov.pb.cge.konnix.api.room.dto.RoomResponse;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.service.RoomService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/direct-messages")
public class DirectMessageController {

    private final RoomService roomService;

    public DirectMessageController(RoomService roomService) {
        this.roomService = roomService;
    }

    @PostMapping
    public ApiResponse<RoomResponse> create(@Valid @RequestBody DirectMessageRequest request,
                                            Authentication authentication,
                                            HttpServletRequest http) {
        AuthenticatedUser actor = (AuthenticatedUser) authentication.getPrincipal();
        return ApiResponse.ok(roomService.createDirect(request.userId(), actor, clientIp(http)));
    }

    private String clientIp(HttpServletRequest http) {
        String forwarded = http.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return http.getRemoteAddr();
    }
}
