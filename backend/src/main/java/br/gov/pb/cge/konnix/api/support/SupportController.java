package br.gov.pb.cge.konnix.api.support;

import br.gov.pb.cge.konnix.api.common.ApiResponse;
import br.gov.pb.cge.konnix.api.message.dto.MessageResponse;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.service.SupportService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.MediaType;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/support")
public class SupportController {

    private final SupportService supportService;

    public SupportController(SupportService supportService) {
        this.supportService = supportService;
    }

    @PostMapping(value = "/report", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<Map<String, String>> reportIssue(@RequestParam("content") String content,
                                                        @RequestParam(value = "files", required = false) MultipartFile[] files,
                                                        Authentication authentication) {
        AuthenticatedUser actor = (AuthenticatedUser) authentication.getPrincipal();
        supportService.reportIssue(content, files != null ? java.util.Arrays.asList(files) : java.util.Collections.emptyList(), actor);
        return ApiResponse.ok(Map.of("message", "Relato enviado com sucesso"));
    }

    @PostMapping(value = "/respond", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<MessageResponse> respondToReport(@RequestParam("messageId") UUID messageId,
                                                        @RequestParam("content") String content,
                                                        @RequestParam(value = "files", required = false) MultipartFile[] files,
                                                        Authentication authentication) {
        AuthenticatedUser actor = (AuthenticatedUser) authentication.getPrincipal();
        MessageResponse response = supportService.respondToReport(messageId, content, files != null ? java.util.Arrays.asList(files) : java.util.Collections.emptyList(), actor);
        return ApiResponse.ok(response);
    }
}