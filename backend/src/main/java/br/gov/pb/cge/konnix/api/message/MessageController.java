package br.gov.pb.cge.konnix.api.message;

import br.gov.pb.cge.konnix.api.common.ApiResponse;
import br.gov.pb.cge.konnix.api.message.dto.CreateMessageRequest;
import br.gov.pb.cge.konnix.api.message.dto.MessageHistoryResponse;
import br.gov.pb.cge.konnix.api.message.dto.MessageResponse;
import br.gov.pb.cge.konnix.api.message.dto.UpdateMessageRequest;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.service.MessageService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.UUID;
import java.util.List;

@RestController
public class MessageController {

    private final MessageService messageService;

    public MessageController(MessageService messageService) {
        this.messageService = messageService;
    }

    @GetMapping("/api/v1/rooms/{roomId}/messages")
    public ApiResponse<MessageHistoryResponse> history(@PathVariable UUID roomId,
                                                       @RequestParam(required = false) Integer limit,
                                                       @RequestParam(required = false)
                                                       @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant before,
                                                       Authentication authentication) {
        return ApiResponse.ok(messageService.history(roomId, limit, before, principal(authentication)));
    }

    @PostMapping("/api/v1/rooms/{roomId}/messages")
    public ApiResponse<MessageResponse> create(@PathVariable UUID roomId,
                                               @Valid @RequestBody CreateMessageRequest request,
                                               Authentication authentication,
                                               HttpServletRequest http) {
        AuthenticatedUser actor = principal(authentication);
        return ApiResponse.ok(messageService.create(roomId, request, actor, clientIp(http)));
    }

    @PostMapping("/api/v1/rooms/{roomId}/read")
    public ApiResponse<Void> markRead(@PathVariable UUID roomId, Authentication authentication) {
        messageService.markRoomRead(roomId, principal(authentication));
        return ApiResponse.ok(null);
    }

    @GetMapping("/api/v1/rooms/{roomId}/messages/search")
    public ApiResponse<List<MessageResponse>> search(@PathVariable UUID roomId,
                                                     @RequestParam String q,
                                                     Authentication authentication) {
        return ApiResponse.ok(messageService.search(roomId, q, principal(authentication)));
    }

    @PostMapping("/api/v1/messages/{id}/reactions")
    public ApiResponse<br.gov.pb.cge.konnix.api.message.dto.MessageReactionResponse> reaction(
            @PathVariable UUID id, @RequestBody java.util.Map<String, String> body,
            Authentication authentication) {
        return ApiResponse.ok(messageService.toggleReaction(id, body.get("emoji"), principal(authentication)));
    }

    @PatchMapping("/api/v1/messages/{id}")
    public ApiResponse<MessageResponse> update(@PathVariable UUID id,
                                               @Valid @RequestBody UpdateMessageRequest request,
                                               Authentication authentication,
                                               HttpServletRequest http) {
        return ApiResponse.ok(messageService.update(id, request, principal(authentication), clientIp(http)));
    }

    @DeleteMapping("/api/v1/messages/{id}")
    public ApiResponse<MessageResponse> delete(@PathVariable UUID id,
                                               Authentication authentication,
                                               HttpServletRequest http) {
        return ApiResponse.ok(messageService.delete(id, principal(authentication), clientIp(http)));
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
