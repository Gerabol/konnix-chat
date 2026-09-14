package br.gov.pb.cge.konnix.api.message.dto;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class MessageResponseTest {

    @Test
    void rolesVaziasQuandoNaoProprietarioNemAdmin() {
        List<String> roles = MessageResponse.buildRoles("MEMBER", false);

        assertThat(roles).isEmpty();
    }

    @Test
    void rolesOwnerApenasQuandoProprietarioDoGrupo() {
        List<String> roles = MessageResponse.buildRoles("OWNER", false);

        assertThat(roles).containsExactly("OWNER");
    }

    @Test
    void rolesAdminApenasQuandoRoleGlobalAdmin() {
        List<String> roles = MessageResponse.buildRoles("MEMBER", true);

        assertThat(roles).containsExactly("ADMIN");
    }

    @Test
    void rolesOwnerEAdminQuandoAmbos() {
        List<String> roles = MessageResponse.buildRoles("OWNER", true);

        assertThat(roles).containsExactly("OWNER", "ADMIN");
    }

    @Test
    void roleCaseInsensitiveParaProprietario() {
        List<String> roles = MessageResponse.buildRoles("owner", false);

        assertThat(roles).containsExactly("OWNER");
    }
}