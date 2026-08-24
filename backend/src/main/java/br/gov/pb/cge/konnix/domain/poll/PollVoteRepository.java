package br.gov.pb.cge.konnix.domain.poll;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface PollVoteRepository extends JpaRepository<PollVote, UUID> {
    List<PollVote> findByPollIdIn(Collection<UUID> pollIds);
    List<PollVote> findByPollIdAndUserId(UUID pollId, UUID userId);
}
