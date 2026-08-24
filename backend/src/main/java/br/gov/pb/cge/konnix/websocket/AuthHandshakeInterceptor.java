package br.gov.pb.cge.konnix.websocket;

import br.gov.pb.cge.konnix.domain.user.User;
import br.gov.pb.cge.konnix.security.TokenService;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

@Component
public class AuthHandshakeInterceptor implements HandshakeInterceptor {

    private static final String USER_ATTRIBUTE = "authenticatedUser";

    private final TokenService tokenService;

    public AuthHandshakeInterceptor(TokenService tokenService) {
        this.tokenService = tokenService;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        String token = request.getURI().getQuery() != null
                ? queryParam(request.getURI().getQuery(), "token")
                : null;
        if (token == null || token.isBlank()) {
            return false;
        }
        return tokenService.validate(token)
                .map(user -> {
                    if (user.isPasswordChangeRequired()) return false;
                    attributes.put(USER_ATTRIBUTE, user);
                    return true;
                })
                .orElse(false);
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
    }

    public static User authenticatedUser(Map<String, Object> attributes) {
        Object value = attributes.get(USER_ATTRIBUTE);
        return value instanceof User user ? user : null;
    }

    private String queryParam(String query, String key) {
        for (String pair : query.split("&")) {
            int idx = pair.indexOf('=');
            String name = idx > 0 ? pair.substring(0, idx) : pair;
            if (key.equals(name)) {
                String value = idx > 0 && idx + 1 < pair.length() ? pair.substring(idx + 1) : "";
                try {
                    return java.net.URLDecoder.decode(value, java.nio.charset.StandardCharsets.UTF_8);
                } catch (IllegalArgumentException e) {
                    return null;
                }
            }
        }
        return null;
    }
}
