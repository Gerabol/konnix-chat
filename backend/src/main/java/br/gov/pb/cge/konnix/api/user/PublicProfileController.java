package br.gov.pb.cge.konnix.api.user;

import br.gov.pb.cge.konnix.api.common.ApiResponse;
import br.gov.pb.cge.konnix.api.user.dto.PublicProfileResponse;
import br.gov.pb.cge.konnix.service.UserService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/profiles/users")
public class PublicProfileController {
    private final UserService userService;

    public PublicProfileController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/{id}")
    public ApiResponse<PublicProfileResponse> get(@PathVariable UUID id) {
        return ApiResponse.ok(userService.publicProfile(id));
    }
}
