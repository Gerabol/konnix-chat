package br.gov.pb.cge.konnix.domain.poll;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface PollOptionRepository extends JpaRepository<PollOption, UUID> {
    List<PollOption> findByPollIdInOrderByPositionAsc(Collection<UUID> pollIds);
}
