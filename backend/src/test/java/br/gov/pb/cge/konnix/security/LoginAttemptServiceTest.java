package br.gov.pb.cge.konnix.security;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LoginAttemptServiceTest {

    private final LoginAttemptService service = new LoginAttemptService();

    @Test
    void bloqueiaUsuarioApenasAposLimiteDeFalhas() {
        for (int i = 0; i < LoginAttemptService.MAX_ATTEMPTS - 1; i++) {
            service.registerFailure("Joao");
        }
        assertThat(service.isBlocked("joao")).isFalse();

        service.registerFailure("JOAO ");

        assertThat(service.isBlocked("joao")).isTrue();
    }

    @Test
    void clearLiberaUsuario() {
        for (int i = 0; i < LoginAttemptService.MAX_ATTEMPTS; i++) {
            service.registerFailure("maria");
        }
        service.clear("maria");

        assertThat(service.isBlocked("maria")).isFalse();
    }

    @Test
    void bloqueioDeUmUsuarioNaoAfetaOutros() {
        for (int i = 0; i < LoginAttemptService.MAX_ATTEMPTS; i++) {
            service.registerFailure("ana");
        }

        assertThat(service.isBlocked("ana")).isTrue();
        assertThat(service.isBlocked("bruno")).isFalse();
    }
}
