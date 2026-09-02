package br.gov.pb.cge.konnix.api.exception;

import org.springframework.http.HttpStatus;

public final class ApiExceptions {

    private ApiExceptions() {
    }

    public static ApiException invalidCredentials() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Usuário ou senha inválidos");
    }

    public static ApiException userInactive() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "USER_INACTIVE", "Usuário inativo");
    }

    public static ApiException passwordMigrationRequired() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "PASSWORD_MIGRATION_REQUIRED", "Defina uma nova senha antes de acessar");
    }

    public static ApiException passwordChangeRequired() {
        return new ApiException(HttpStatus.FORBIDDEN, "PASSWORD_CHANGE_REQUIRED", "Defina uma nova senha antes de acessar");
    }

    public static ApiException passwordsDoNotMatch() {
        return new ApiException(HttpStatus.BAD_REQUEST, "PASSWORDS_DO_NOT_MATCH", "As senhas não coincidem");
    }

    public static ApiException passwordMustDiffer() {
        return new ApiException(HttpStatus.BAD_REQUEST, "PASSWORD_MUST_DIFFER", "A nova senha deve ser diferente da senha temporária");
    }

    public static ApiException unauthorized(String message) {
        return new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", message);
    }

    public static ApiException forbidden(String message) {
        return new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", message);
    }

    public static ApiException notFound(String resource) {
        return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Recurso não encontrado: " + resource);
    }

    public static ApiException conflict(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message);
    }

    public static ApiException tooManyAttempts() {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_ATTEMPTS", "Muitas tentativas de login. Aguarde alguns minutos.");
    }

    public static ApiException roomReadOnly() {
        return new ApiException(HttpStatus.FORBIDDEN, "ROOM_READ_ONLY", "Sala somente leitura");
    }

    public static ApiException accountReadOnly() {
        return new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_READ_ONLY", "A conta está em modo somente leitura");
    }

    public static ApiException pollInvalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "POLL_INVALID", "A enquete precisa de uma pergunta e pelo menos duas opções diferentes");
    }

    public static ApiException pollOptionInvalid() {
        return new ApiException(HttpStatus.NOT_FOUND, "POLL_OPTION_NOT_FOUND", "Opção de enquete não encontrada");
    }

    public static ApiException userUnavailable() {
        return new ApiException(HttpStatus.CONFLICT, "USER_UNAVAILABLE", "Este usuário não está disponível para novas conversas");
    }

    public static ApiException selfDm() {
        return new ApiException(HttpStatus.CONFLICT, "SELF_DM", "Não é possível iniciar conversa consigo mesmo");
    }

    public static ApiException alreadyMember() {
        return new ApiException(HttpStatus.CONFLICT, "ALREADY_MEMBER", "Usuário já é membro da sala");
    }

    public static ApiException directRoomManualMembership() {
        return new ApiException(HttpStatus.FORBIDDEN, "DIRECT_MEMBERSHIP_FORBIDDEN", "Membros de conversas diretas não podem ser gerenciados manualmente");
    }

    public static ApiException parentRoomMismatch() {
        return new ApiException(HttpStatus.CONFLICT, "PARENT_ROOM_MISMATCH", "Mensagem pai pertence a outra sala");
    }

    public static ApiException roomNameTaken() {
        return new ApiException(HttpStatus.CONFLICT, "ROOM_NAME_TAKEN", "Já existe uma sala com esse nome");
    }

    public static ApiException notRoomMember() {
        return new ApiException(HttpStatus.FORBIDDEN, "NOT_ROOM_MEMBER", "Você não é membro desta sala");
    }

    public static ApiException cannotEditMessage() {
        return new ApiException(HttpStatus.FORBIDDEN, "CANNOT_EDIT_MESSAGE", "Só é possível editar a própria mensagem");
    }

    public static ApiException cannotDeleteMessage() {
        return new ApiException(HttpStatus.FORBIDDEN, "CANNOT_DELETE_MESSAGE", "Só é possível excluir a própria mensagem");
    }

    public static ApiException fileTooLarge(long maxBytes) {
        return new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE",
                "Arquivo excede o limite de " + maxBytes + " bytes");
    }

    public static ApiException fileEmpty() {
        return new ApiException(HttpStatus.BAD_REQUEST, "FILE_EMPTY", "Arquivo vazio ou sem nome");
    }

    public static ApiException fileNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "FILE_NOT_FOUND", "Arquivo não encontrado");
    }

    public static ApiException filePhysicalMissing() {
        return new ApiException(HttpStatus.NOT_FOUND, "FILE_NOT_FOUND", "Arquivo físico não encontrado");
    }

    public static ApiException storageError() {
        return new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "STORAGE_ERROR", "Falha ao acessar o armazenamento de arquivos");
    }

    public static ApiException invalidPushSubscription() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PUSH_SUBSCRIPTION", "Subscription de push inválida");
    }
}
