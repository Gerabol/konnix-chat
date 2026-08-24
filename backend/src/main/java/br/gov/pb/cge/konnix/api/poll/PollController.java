package br.gov.pb.cge.konnix.api.poll;

import br.gov.pb.cge.konnix.api.common.ApiResponse;
import br.gov.pb.cge.konnix.api.message.dto.MessageResponse;
import br.gov.pb.cge.konnix.api.poll.dto.CreatePollRequest;
import br.gov.pb.cge.konnix.api.poll.dto.PollVoteRequest;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.service.PollService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
public class PollController {
    private final PollService pollService;

    public PollController(PollService pollService) {
        this.pollService = pollService;
    }

    @PostMapping("/api/v1/rooms/{roomId}/polls")
    public ApiResponse<MessageResponse> create(@PathVariable UUID roomId,
                                                @Valid @RequestBody CreatePollRequest request,
                                                Authentication authentication, HttpServletRequest http) {
        return ApiResponse.ok(pollService.create(roomId, request, principal(authentication), clientIp(http)));
    }

    @PostMapping("/api/v1/polls/{pollId}/votes")
    public ApiResponse<MessageResponse> vote(@PathVariable UUID pollId,
                                             @Valid @RequestBody PollVoteRequest request,
                                             Authentication authentication) {
        return ApiResponse.ok(pollService.vote(pollId, request, principal(authentication)));
    }

    private AuthenticatedUser principal(Authentication authentication) {
        return (AuthenticatedUser) authentication.getPrincipal();
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
