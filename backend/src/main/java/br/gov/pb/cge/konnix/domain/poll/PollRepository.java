package br.gov.pb.cge.konnix.domain.poll;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PollRepository extends JpaRepository<Poll, UUID> {
    Optional<Poll> findByMessageId(UUID messageId);
    List<Poll> findByMessageIdIn(Collection<UUID> messageIds);
}
