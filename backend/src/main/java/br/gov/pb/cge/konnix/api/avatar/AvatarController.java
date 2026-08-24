package br.gov.pb.cge.konnix.api.avatar;

import br.gov.pb.cge.konnix.api.exception.ApiExceptions;
import br.gov.pb.cge.konnix.storage.FileStorageService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.security.access.prepost.PreAuthorize;
import br.gov.pb.cge.konnix.api.common.ApiResponse;
import br.gov.pb.cge.konnix.api.user.dto.UserResponse;
import br.gov.pb.cge.konnix.security.AuthenticatedUser;
import br.gov.pb.cge.konnix.service.UserService;
import br.gov.pb.cge.konnix.service.RoomService;
import br.gov.pb.cge.konnix.api.room.dto.RoomResponse;
import jakarta.servlet.http.HttpServletRequest;

import java.io.File;
import java.util.UUID;

/**
 * Avatares migrados do Rocket (usuarios e salas), servidos do disco em
 * <uploads>/avatars/{user|room}/{id}. Requer autenticacao (qualquer usuario logado).
 */
@RestController
public class AvatarController {

    private final FileStorageService storageService;
    private final UserService userService;
    private final RoomService roomService;

    public AvatarController(FileStorageService storageService, UserService userService, RoomService roomService) {
        this.storageService = storageService;
        this.userService = userService;
        this.roomService = roomService;
    }

    @PutMapping("/api/v1/rooms/{id}/avatar")
    public ApiResponse<RoomResponse> updateRoomAvatar(@PathVariable UUID id,
                                                       @RequestPart("file") MultipartFile file,
                                                       org.springframework.security.core.Authentication authentication,
                                                       HttpServletRequest request) {
        if (file.isEmpty() || !isSupportedImage(file)) {
            throw ApiExceptions.conflict("AVATAR_INVALID", "Envie uma imagem válida");
        }
        if (file.getSize() > 5 * 1024 * 1024) {
            throw ApiExceptions.conflict("AVATAR_TOO_LARGE", "A imagem deve ter no máximo 5 MB");
        }
        try {
            AuthenticatedUser actor = (AuthenticatedUser) authentication.getPrincipal();
            roomService.authorizeUpdate(id, actor);
            storageService.storeAvatar("room", id, file.getBytes(), file.getContentType());
            return ApiResponse.ok(roomService.avatarUpdated(id, actor, clientIp(request)));
        } catch (java.io.IOException e) {
            throw ApiExceptions.storageError();
        }
    }

    @PutMapping("/api/v1/users/{id}/avatar")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<UserResponse> updateUserAvatar(@PathVariable UUID id,
                                                       @RequestPart("file") MultipartFile file,
                                                       org.springframework.security.core.Authentication authentication,
                                                       HttpServletRequest request) {
        if (file.isEmpty() || file.getContentType() == null || !file.getContentType().startsWith("image/")) {
            throw ApiExceptions.conflict("AVATAR_INVALID", "Envie uma imagem válida");
        }
        if (file.getSize() > 5 * 1024 * 1024) {
            throw ApiExceptions.conflict("AVATAR_TOO_LARGE", "A imagem deve ter no máximo 5 MB");
        }
        try {
            storageService.storeAvatar("user", id, file.getBytes(), file.getContentType());
            AuthenticatedUser actor = (AuthenticatedUser) authentication.getPrincipal();
            return ApiResponse.ok(userService.avatarUpdated(id, actor.id(), clientIp(request)));
        } catch (java.io.IOException e) {
            throw ApiExceptions.storageError();
        }
    }

    @PutMapping("/api/v1/auth/avatar")
    public ApiResponse<UserResponse> updateOwnAvatar(@RequestPart("file") MultipartFile file,
                                                      org.springframework.security.core.Authentication authentication,
                                                      HttpServletRequest request) {
        if (file.isEmpty() || file.getContentType() == null || !file.getContentType().startsWith("image/")) {
            throw ApiExceptions.conflict("AVATAR_INVALID", "Envie uma imagem válida");
        }
        if (file.getSize() > 5 * 1024 * 1024) {
            throw ApiExceptions.conflict("AVATAR_TOO_LARGE", "A imagem deve ter no máximo 5 MB");
        }
        try {
            AuthenticatedUser actor = (AuthenticatedUser) authentication.getPrincipal();
            storageService.storeAvatar("user", actor.id(), file.getBytes(), file.getContentType());
            return ApiResponse.ok(userService.avatarUpdated(actor.id(), actor.id(), clientIp(request)));
        } catch (java.io.IOException e) {
            throw ApiExceptions.storageError();
        }
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }

    @GetMapping("/api/v1/users/{id}/avatar")
    public ResponseEntity<Resource> userAvatar(@PathVariable UUID id) {
        return avatar("user", id);
    }

    @GetMapping("/api/v1/rooms/{id}/avatar")
    public ResponseEntity<Resource> roomAvatar(@PathVariable UUID id) {
        return avatar("room", id);
    }

    private ResponseEntity<Resource> avatar(String kind, UUID id) {
        File file;
        try {
            file = storageService.avatar(kind, id);
        } catch (RuntimeException e) {
            throw ApiExceptions.notFound("avatar/" + kind + "/" + id);
        }
        return ResponseEntity.ok()
                .contentType(mediaType(storageService.avatarMime(kind, id)))
                .contentLength(file.length())
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=86400")
                .body(new FileSystemResource(file));
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

    private boolean isSupportedImage(MultipartFile file) {
        String contentType = file.getContentType();
        return "image/png".equalsIgnoreCase(contentType)
                || "image/jpeg".equalsIgnoreCase(contentType)
                || "image/webp".equalsIgnoreCase(contentType);
    }
}
