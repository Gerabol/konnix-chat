package br.gov.pb.cge.konnix.api.support;

import br.gov.pb.cge.konnix.api.common.ApiResponse;
import br.gov.pb.cge.konnix.api.message.dto.MessageResponse;
import br.gov.pb.cge.konnix.api.support.dto.ReportIssueRequest;
import br.gov.pb.cge.konnix.api.support.dto.ReportResponseRequest;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.service.SupportService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/support")
public class SupportController {

    private final SupportService supportService;

    public SupportController(SupportService supportService) {
        this.supportService = supportService;
    }

    @PostMapping("/report")
    public ApiResponse<Map<String, String>> reportIssue(@Valid @RequestBody ReportIssueRequest request,
                                                         Authentication authentication) {
        AuthenticatedUser actor = (AuthenticatedUser) authentication.getPrincipal();
        supportService.reportIssue(request.content(), actor);
        return ApiResponse.ok(Map.of("message", "Relato enviado com sucesso"));
    }

    @PostMapping("/respond")
    public ApiResponse<MessageResponse> respondToReport(@Valid @RequestBody ReportResponseRequest request,
                                                         Authentication authentication) {
        AuthenticatedUser actor = (AuthenticatedUser) authentication.getPrincipal();
        MessageResponse response = supportService.respondToReport(request.messageId(), request.content(), actor);
        return ApiResponse.ok(response);
    }
}