package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.admin.dto.AuditOptionsResponse;
import br.gov.pb.cge.konnix.api.admin.dto.MonitoringMetricsResponse;
import br.gov.pb.cge.konnix.domain.attachment.AttachmentRepository;
import br.gov.pb.cge.konnix.domain.audit.AuditLogRepository;
import br.gov.pb.cge.konnix.domain.message.MessageRepository;
import br.gov.pb.cge.konnix.domain.room.RoomRepository;
import br.gov.pb.cge.konnix.domain.session.SessionRepository;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.Objects;
import java.util.List;

@Service
public class AdminMonitoringService {
    private final AttachmentRepository attachmentRepository;
    private final AuditLogRepository auditLogRepository;
    private final MessageRepository messageRepository;
    private final RoomRepository roomRepository;
    private final SessionRepository sessionRepository;
    private final UserRepository userRepository;
    private final EntityManager entityManager;

    public AdminMonitoringService(AttachmentRepository attachmentRepository,
                                  AuditLogRepository auditLogRepository,
                                  MessageRepository messageRepository,
                                  RoomRepository roomRepository,
                                  SessionRepository sessionRepository,
                                  UserRepository userRepository,
                                  EntityManager entityManager) {
        this.attachmentRepository = attachmentRepository;
        this.auditLogRepository = auditLogRepository;
        this.messageRepository = messageRepository;
        this.roomRepository = roomRepository;
        this.sessionRepository = sessionRepository;
        this.userRepository = userRepository;
        this.entityManager = entityManager;
    }

    @Transactional(readOnly = true)
    public AuditOptionsResponse auditOptions() {
        var users = userRepository.findAll().stream()
                .sorted(Comparator.comparing(user -> user.getName() == null ? user.getUsername() : user.getName(),
                        String.CASE_INSENSITIVE_ORDER))
                .map(user -> new AuditOptionsResponse.UserOption(user.getId(), user.getUsername(), user.getName()))
                .toList();
        var actions = auditLogRepository.findDistinctActionByOrderByActionAsc().stream()
                .filter(Objects::nonNull)
                .toList();
        var resources = auditLogRepository.findDistinctResourceByOrderByResourceAsc().stream()
                .filter(Objects::nonNull)
                .toList();
        return new AuditOptionsResponse(users, actions, resources);
    }

    @Transactional(readOnly = true)
    public MonitoringMetricsResponse metrics() {
        Instant today = Instant.now().atZone(ZoneId.systemDefault()).toLocalDate()
                .atStartOfDay(ZoneId.systemDefault()).toInstant();
        long activeUsers = userRepository.countByAccountStatus("ACTIVE");
        long readOnlyUsers = userRepository.countByAccountStatus("READ_ONLY");
        long disabledUsers = userRepository.countByAccountStatus("DISABLED");
        ZoneId zone = ZoneId.systemDefault();
        Instant activityFrom = today.minus(6, ChronoUnit.DAYS);
        var activityByDay = messageRepository.countActivitySince(activityFrom, zone.getId()).stream()
                .collect(java.util.stream.Collectors.toMap(
                        row -> (String) row[0],
                        row -> new MonitoringMetricsResponse.ActivityPoint((String) row[0], ((Number) row[1]).longValue(), ((Number) row[2]).longValue())));
        List<MonitoringMetricsResponse.ActivityPoint> activity = java.util.stream.IntStream.range(0, 7)
                .mapToObj(offset -> {
                    String day = today.plus(offset - 6L, ChronoUnit.DAYS).atZone(zone).toLocalDate().toString();
                    return activityByDay.getOrDefault(day, new MonitoringMetricsResponse.ActivityPoint(day, 0, 0));
                }).toList();
        Number databaseSize = (Number) entityManager
                .createNativeQuery("select pg_database_size(current_database())")
                .getSingleResult();
        return new MonitoringMetricsResponse(
                attachmentRepository.count(),
                attachmentRepository.totalBytes(),
                messageRepository.count(),
                userRepository.count(),
                activeUsers,
                readOnlyUsers,
                disabledUsers,
                roomRepository.countByType("PRIVATE_GROUP"),
                roomRepository.countByType("CHANNEL"),
                auditLogRepository.countByActionAndCreatedAtGreaterThanEqual("LOGIN_SUCCESS", today),
                sessionRepository.countByRevokedAtIsNullAndExpiresAtAfter(Instant.now()),
                auditLogRepository.count(),
                databaseSize.longValue(),
                activity);
    }
}
