package br.gov.pb.cge.konnix.storage;

import br.gov.pb.cge.konnix.api.exception.ApiExceptions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.UUID;

@Service
public class FileStorageService {

    private static final Logger log = LoggerFactory.getLogger(FileStorageService.class);

    private final Path root;

    public FileStorageService(@Value("${konnix.uploads.dir:./uploads}") String uploadsDir) {
        this.root = Paths.get(uploadsDir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(root);
        } catch (IOException e) {
            throw new IllegalStateException("Não foi possível criar o diretório de uploads: " + root, e);
        }
    }

    public record StoredFile(UUID id, String storagePath, String storedName, long size, String sha256) {
    }

    public StoredFile store(byte[] data) {
        UUID id = UUID.randomUUID();
        LocalDate today = LocalDate.now();
        String year = String.valueOf(today.getYear());
        String month = today.format(DateTimeFormatter.ofPattern("MM"));
        Path subdir = root.resolve(year).resolve(month);
        try {
            Files.createDirectories(subdir);
        } catch (IOException e) {
            throw ApiExceptions.storageError();
        }
        Path target = subdir.resolve(id.toString());
        try {
            Files.write(target, data);
        } catch (IOException e) {
            log.error("Falha ao gravar arquivo físico {}", target, e);
            throw ApiExceptions.storageError();
        }
        String storagePath = year + "/" + month + "/" + id;
        return new StoredFile(id, storagePath, id.toString(), data.length, sha256Hex(data));
    }

    public File fileFor(String storagePath) {
        if (storagePath == null || storagePath.isBlank()) {
            throw ApiExceptions.filePhysicalMissing();
        }
        Path resolved = resolveSafe(storagePath);
        File file = resolved.toFile();
        if (!file.isFile()) {
            throw ApiExceptions.filePhysicalMissing();
        }
        return file;
    }

    public void delete(String storagePath) {
        if (storagePath == null || storagePath.isBlank()) {
            return;
        }
        try {
            Path resolved = resolveSafe(storagePath);
            Files.deleteIfExists(resolved);
            Files.deleteIfExists(resolved.getParent());
            Files.deleteIfExists(resolved.getParent().getParent());
        } catch (IOException e) {
            log.warn("Falha ao remover arquivo físico {}", storagePath, e);
        }
    }

    /** Arquivo de avatar migrado do Rocket: <root>/avatars/{kind}/{id}. */
    public File avatar(String kind, UUID id) {
        Path resolved = resolveSafe("avatars/" + kind + "/" + id);
        File file = resolved.toFile();
        if (!file.isFile()) {
            throw ApiExceptions.filePhysicalMissing();
        }
        return file;
    }

    public void storeAvatar(String kind, UUID id, byte[] data, String mimeType) {
        Path directory = root.resolve("avatars").resolve(kind).normalize();
        if (!directory.startsWith(root)) throw ApiExceptions.forbidden("Caminho de arquivo inválido");
        try {
            Files.createDirectories(directory);
            Files.write(directory.resolve(id.toString()), data);
            Files.writeString(directory.resolve(id + ".mime"), mimeType == null ? "application/octet-stream" : mimeType);
        } catch (IOException e) {
            throw ApiExceptions.storageError();
        }
    }

    /** Content-type do avatar (sidecar {id}.mime escrito pelo migrator). */
    public String avatarMime(String kind, UUID id) {
        Path mime = resolveSafe("avatars/" + kind + "/" + id + ".mime");
        try {
            if (Files.isRegularFile(mime)) {
                String type = Files.readString(mime).trim();
                if (!type.isBlank()) {
                    return type;
                }
            }
        } catch (IOException e) {
            log.warn("Falha ao ler mime do avatar {} {}", kind, id, e);
        }
        return "application/octet-stream";
    }

    private Path resolveSafe(String storagePath) {
        Path resolved = root.resolve(storagePath).normalize();
        if (!resolved.startsWith(root)) {
            throw ApiExceptions.forbidden("Caminho de arquivo inválido");
        }
        return resolved;
    }

    private String sha256Hex(byte[] data) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(data));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 indisponível", e);
        }
    }
}
