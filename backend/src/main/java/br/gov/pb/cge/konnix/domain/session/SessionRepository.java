package br.gov.pb.cge.konnix.domain.session;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.time.Instant;

public interface SessionRepository extends JpaRepository<Session, UUID> {

    Optional<Session> findByTokenHash(String tokenHash);

    List<Session> findByUser_IdAndRevokedAtIsNull(UUID userId);

    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query("update Session s set s.revokedAt = :revokedAt where s.user.id = :userId and s.revokedAt is null")
    int revokeActiveByUserId(@org.springframework.data.repository.query.Param("userId") UUID userId,
                             @org.springframework.data.repository.query.Param("revokedAt") Instant revokedAt);

    void deleteByExpiresAtBefore(Instant now);

    long countByRevokedAtIsNullAndExpiresAtAfter(Instant now);

    @EntityGraph(attributePaths = {"user", "createdBy"})
    List<Session> findByApiTokenTrueOrderByCreatedAtDesc();
}
