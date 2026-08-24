package br.gov.pb.cge.konnix.domain.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Query;

import java.util.UUID;
import java.time.Instant;
import java.util.List;

public interface AuditLogRepository extends JpaRepository<AuditLog, UUID>, JpaSpecificationExecutor<AuditLog> {
    @Override
    @EntityGraph(attributePaths = "user")
    Page<AuditLog> findAll(Specification<AuditLog> specification, Pageable pageable);

    @Query("select distinct a.action from AuditLog a where a.action is not null order by a.action")
    List<String> findDistinctActionByOrderByActionAsc();

    @Query("select distinct a.resource from AuditLog a where a.resource is not null order by a.resource")
    List<String> findDistinctResourceByOrderByResourceAsc();

    long countByActionAndCreatedAtGreaterThanEqual(String action, Instant from);
}
