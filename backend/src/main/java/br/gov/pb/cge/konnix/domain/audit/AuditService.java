package br.gov.pb.cge.konnix.domain.audit;

import br.gov.pb.cge.konnix.domain.user.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import jakarta.persistence.criteria.Predicate;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class AuditService {

    private final AuditLogRepository auditLogRepository;

    public AuditService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String action, User user, String resource, String resourceId, String ipAddress) {
        AuditLog log = new AuditLog();
        log.setAction(action);
        log.setUser(user);
        log.setResource(resource);
        log.setResourceId(resourceId);
        log.setIpAddress(ipAddress);
        auditLogRepository.save(log);
    }

    @Transactional(readOnly = true)
    public Page<AuditLog> search(UUID userId, String action, String resource, Instant from, Instant to, Pageable pageable) {
        String normalizedAction = blankToNull(action);
        String normalizedResource = blankToNull(resource);
        Specification<AuditLog> specification = (root, query, builder) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (userId != null) predicates.add(builder.equal(root.get("user").get("id"), userId));
            if (normalizedAction != null) predicates.add(builder.equal(root.get("action"), normalizedAction));
            if (normalizedResource != null) predicates.add(builder.equal(root.get("resource"), normalizedResource));
            if (from != null) predicates.add(builder.greaterThanOrEqualTo(root.get("createdAt"), from));
            if (to != null) predicates.add(builder.lessThan(root.get("createdAt"), to));
            if (!Long.class.equals(query.getResultType()) && !long.class.equals(query.getResultType())) {
                query.orderBy(builder.desc(root.get("createdAt")));
            }
            return builder.and(predicates.toArray(Predicate[]::new));
        };
        return auditLogRepository.findAll(specification, pageable);
    }

    private String blankToNull(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
