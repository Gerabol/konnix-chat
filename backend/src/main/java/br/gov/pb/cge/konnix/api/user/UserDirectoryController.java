package br.gov.pb.cge.konnix.api.user;

import br.gov.pb.cge.konnix.api.common.ApiResponse;
import br.gov.pb.cge.konnix.api.user.dto.UserDirectoryResponse;
import br.gov.pb.cge.konnix.service.UserService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/users/directory")
public class UserDirectoryController {

    private final UserService userService;

    public UserDirectoryController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public ApiResponse<List<UserDirectoryResponse>> directory(
            @RequestParam(name = "q", required = false) String q) {
        return ApiResponse.ok(userService.directory(q));
    }
}
