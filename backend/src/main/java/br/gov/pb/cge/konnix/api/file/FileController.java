package br.gov.pb.cge.konnix.api.file;

import br.gov.pb.cge.konnix.api.common.ApiResponse;
import br.gov.pb.cge.konnix.api.message.dto.MessageResponse;
import br.gov.pb.cge.konnix.api.file.dto.FileResponse;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.service.FileService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;
import java.util.List;

@RestController
public class FileController {

    private final FileService fileService;

    public FileController(FileService fileService) {
        this.fileService = fileService;
    }

    @PostMapping("/api/v1/rooms/{roomId}/files")
    public ApiResponse<MessageResponse> upload(@PathVariable UUID roomId,
                                               @RequestParam("file") MultipartFile file,
                                               @RequestParam(value = "content", required = false) String content,
                                               Authentication authentication,
                                               HttpServletRequest http) {
        AuthenticatedUser actor = (AuthenticatedUser) authentication.getPrincipal();
        return ApiResponse.ok(fileService.upload(roomId, file, content, actor, clientIp(http)));
    }

    @GetMapping("/api/v1/files/{id}")
    public ResponseEntity<Resource> download(@PathVariable UUID id,
                                             Authentication authentication,
                                             HttpServletRequest http) {
        AuthenticatedUser actor = (AuthenticatedUser) authentication.getPrincipal();
        FileService.DownloadedFile downloaded = fileService.download(id, actor, clientIp(http));
        return ResponseEntity.ok()
                .contentType(mediaType(downloaded.mimeType()))
                .contentLength(downloaded.file().length())
                .header(HttpHeaders.CONTENT_DISPOSITION, fileService.contentDisposition(downloaded.originalName()))
                .body(new FileSystemResource(downloaded.file()));
    }

    @GetMapping("/api/v1/rooms/{roomId}/files")
    public ApiResponse<List<FileResponse>> list(@PathVariable UUID roomId,
                                                Authentication authentication) {
        return ApiResponse.ok(fileService.list(roomId, (AuthenticatedUser) authentication.getPrincipal()));
    }

    private MediaType mediaType(String mimeType) {
        if (mimeType == null || mimeType.isBlank()) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
        try {
            return MediaType.parseMediaType(mimeType);
        } catch (RuntimeException e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }

    private String clientIp(HttpServletRequest http) {
        String forwarded = http.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return http.getRemoteAddr();
    }
}
