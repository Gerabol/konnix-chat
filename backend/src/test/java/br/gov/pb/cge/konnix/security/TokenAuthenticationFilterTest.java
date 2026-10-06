package br.gov.pb.cge.konnix.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import br.gov.pb.cge.konnix.domain.user.Role;
import br.gov.pb.cge.konnix.domain.user.User;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TokenAuthenticationFilterTest {

    @Mock
    private TokenService tokenService;

    @Mock
    private FilterChain filterChain;

    private TokenAuthenticationFilter filter;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        SecurityContextHolder.clearContext();
        filter = new TokenAuthenticationFilter(tokenService, objectMapper);
    }

    @Test
    @DisplayName("Permite chamada de troca de senha obrigatória mesmo com servletPath vazio (padrão MockMvc)")
    void permiteTrocaDeSenhaObrigatoriaComServletPathVazio() throws Exception {
        User user = createUserWithPasswordChangeRequired(true);
        when(tokenService.validate("valid-token")).thenReturn(Optional.of(user));

        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/auth/change-required-password");
        request.addHeader("Authorization", "Bearer valid-token");
        // Emulando comportamento padrão do MockMvc onde getServletPath() pode ser vazio
        request.setServletPath("");
        request.setRequestURI("/api/v1/auth/change-required-password");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilterInternal(request, response, filterChain);

        assertThat(response.getStatus()).isEqualTo(200);
        verify(filterChain).doFilter(request, response);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
    }

    @Test
    @DisplayName("Permite chamada de /api/v1/auth/me quando troca de senha é obrigatória")
    void permiteAuthMeDuranteTrocaDeSenhaObrigatoria() throws Exception {
        User user = createUserWithPasswordChangeRequired(true);
        when(tokenService.validate("valid-token")).thenReturn(Optional.of(user));

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/auth/me");
        request.addHeader("Authorization", "Bearer valid-token");
        request.setServletPath("/api/v1/auth/me");
        request.setRequestURI("/api/v1/auth/me");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilterInternal(request, response, filterChain);

        assertThat(response.getStatus()).isEqualTo(200);
        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("Bloqueia com 403 PASSWORD_CHANGE_REQUIRED quando usuário tenta acessar rota restrita")
    void bloqueiaAcessoARotasRestritasQuandoExigeTrocaDeSenha() throws Exception {
        User user = createUserWithPasswordChangeRequired(true);
        when(tokenService.validate("valid-token")).thenReturn(Optional.of(user));

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/rooms");
        request.addHeader("Authorization", "Bearer valid-token");
        request.setServletPath("/api/v1/rooms");
        request.setRequestURI("/api/v1/rooms");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilterInternal(request, response, filterChain);

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString()).contains("PASSWORD_CHANGE_REQUIRED");
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    @DisplayName("Permite acesso normal quando o usuário não precisa trocar senha")
    void permiteAcessoGeralQuandoUsuarioNaoExigeTrocaDeSenha() throws Exception {
        User user = createUserWithPasswordChangeRequired(false);
        when(tokenService.validate("valid-token")).thenReturn(Optional.of(user));

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/rooms");
        request.addHeader("Authorization", "Bearer valid-token");
        request.setServletPath("/api/v1/rooms");
        request.setRequestURI("/api/v1/rooms");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilterInternal(request, response, filterChain);

        assertThat(response.getStatus()).isEqualTo(200);
        verify(filterChain).doFilter(request, response);
    }

    private User createUserWithPasswordChangeRequired(boolean required) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setUsername("testuser");
        user.setName("Test User");
        user.setPasswordChangeRequired(required);
        Role role = new Role();
        role.setName("USER");
        user.setRoles(Set.of(role));
        return user;
    }
}
