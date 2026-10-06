package br.gov.pb.cge.konnix.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import com.fasterxml.jackson.databind.ObjectMapper;
import br.gov.pb.cge.konnix.api.common.ApiErrorResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
public class TokenAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final TokenService tokenService;
    private final ObjectMapper objectMapper;

    public TokenAuthenticationFilter(TokenService tokenService, ObjectMapper objectMapper) {
        this.tokenService = tokenService;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith(BEARER_PREFIX) && SecurityContextHolder.getContext().getAuthentication() == null) {
            String rawToken = header.substring(BEARER_PREFIX.length());
            var userOpt = tokenService.validate(rawToken);
            if (userOpt.isPresent()) {
                var user = userOpt.get();
                List<GrantedAuthority> authorities = user.getRoles().stream()
                        .map(role -> new SimpleGrantedAuthority("ROLE_" + role.getName()))
                        .map(GrantedAuthority.class::cast)
                        .toList();
                AuthenticatedUser principal = new AuthenticatedUser(
                        user.getId(), user.getUsername(), user.getName(),
                        user.getRoles().stream().map(r -> r.getName()).collect(java.util.stream.Collectors.toSet()));
                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(principal, rawToken, authorities);
                SecurityContextHolder.getContext().setAuthentication(authentication);

                if (user.isPasswordChangeRequired() && !isAllowedDuringRequiredChange(request)) {
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.setContentType("application/json");
                    objectMapper.writeValue(response.getWriter(), ApiErrorResponse.of(
                            "PASSWORD_CHANGE_REQUIRED", "Defina uma nova senha antes de acessar"));
                    return;
                }
            }
        }

        filterChain.doFilter(request, response);
    }

    private boolean isAllowedDuringRequiredChange(HttpServletRequest request) {
        return isAllowedPath(request.getRequestURI()) || isAllowedPath(request.getServletPath());
    }

    private boolean isAllowedPath(String path) {
        if (path == null || path.isBlank()) {
            return false;
        }
        String cleanPath = path.split("\\?")[0];
        return cleanPath.endsWith("/api/v1/auth/me")
                || cleanPath.endsWith("/api/v1/auth/logout")
                || cleanPath.endsWith("/api/v1/auth/change-required-password");
    }
}
