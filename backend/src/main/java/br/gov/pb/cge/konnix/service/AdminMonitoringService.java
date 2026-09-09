package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.admin.dto.AuditOptionsResponse;
import br.gov.pb.cge.konnix.api.admin.dto.MessageTimeSeriesPeriod;
import br.gov.pb.cge.konnix.api.admin.dto.MessageTimeSeriesResponse;
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
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

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
        return metrics(7);
    }

    @Transactional(readOnly = true)
    public MonitoringMetricsResponse metrics(int days) {
        int rangeDays = Math.min(Math.max(days, 1), 90);
        Instant today = Instant.now().atZone(ZoneId.systemDefault()).toLocalDate()
                .atStartOfDay(ZoneId.systemDefault()).toInstant();
        long activeUsers = userRepository.countByAccountStatus("ACTIVE");
        long readOnlyUsers = userRepository.countByAccountStatus("READ_ONLY");
        long disabledUsers = userRepository.countByAccountStatus("DISABLED");
        ZoneId zone = ZoneId.systemDefault();
        Instant activityFrom = today.minus(rangeDays - 1L, ChronoUnit.DAYS);
        var activityByDay = messageRepository.countActivitySince(activityFrom, zone.getId()).stream()
                .collect(java.util.stream.Collectors.toMap(
                        row -> (String) row[0],
                        row -> new MonitoringMetricsResponse.ActivityPoint((String) row[0], ((Number) row[1]).longValue(), ((Number) row[2]).longValue())));
        List<MonitoringMetricsResponse.ActivityPoint> activity = java.util.stream.IntStream.range(0, rangeDays)
                .mapToObj(offset -> {
                    String day = today.plus(offset - (rangeDays - 1L), ChronoUnit.DAYS).atZone(zone).toLocalDate().toString();
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

    @Transactional(readOnly = true)
    public MessageTimeSeriesResponse messageTimeSeries(MessageTimeSeriesPeriod period) {
        MessageTimeSeriesPeriod selectedPeriod = period == null ? MessageTimeSeriesPeriod.DAYS_7 : period;
        ZoneId zone = ZoneId.systemDefault();

        return switch (selectedPeriod) {
            case DAYS_7, DAYS_30, DAYS_90 -> buildDailyTimeSeries(selectedPeriod, zone);
            case MONTHS_12 -> buildMonthlyTimeSeries(selectedPeriod, zone);
            case YEARS -> buildYearlyTimeSeries(selectedPeriod, zone);
        };
    }

    private MessageTimeSeriesResponse buildDailyTimeSeries(MessageTimeSeriesPeriod period, ZoneId zone) {
        int days = period.getCount();
        LocalDate endDate = LocalDate.now(zone);
        LocalDate startDate = endDate.minusDays(days - 1L);
        Instant fromInstant = startDate.atStartOfDay(zone).toInstant();

        var activityMap = messageRepository.countActivitySince(fromInstant, zone.getId()).stream()
                .collect(Collectors.toMap(
                        row -> (String) row[0],
                        row -> new long[]{((Number) row[1]).longValue(), ((Number) row[2]).longValue()}));

        DateTimeFormatter labelFormatter = DateTimeFormatter.ofPattern("dd/MM");
        List<MessageTimeSeriesResponse.Point> points = new ArrayList<>(days);

        for (int i = 0; i < days; i++) {
            LocalDate date = startDate.plusDays(i);
            String dateKey = date.toString();
            String label = date.format(labelFormatter);
            long[] counts = activityMap.getOrDefault(dateKey, new long[]{0L, 0L});
            points.add(new MessageTimeSeriesResponse.Point(dateKey, label, counts[0], counts[1]));
        }

        return createResponse("day", period.name(), points);
    }

    private MessageTimeSeriesResponse buildMonthlyTimeSeries(MessageTimeSeriesPeriod period, ZoneId zone) {
        int months = period.getCount();
        YearMonth currentMonth = YearMonth.now(zone);
        YearMonth startMonth = currentMonth.minusMonths(months - 1L);
        Instant fromInstant = startMonth.atDay(1).atStartOfDay(zone).toInstant();

        var activityMap = messageRepository.countActivityByMonthSince(fromInstant, zone.getId()).stream()
                .collect(Collectors.toMap(
                        row -> (String) row[0],
                        row -> new long[]{((Number) row[1]).longValue(), ((Number) row[2]).longValue()}));

        DateTimeFormatter labelFormatter = DateTimeFormatter.ofPattern("MMM/yy", Locale.forLanguageTag("pt-BR"));
        List<MessageTimeSeriesResponse.Point> points = new ArrayList<>(months);

        for (int i = 0; i < months; i++) {
            YearMonth ym = startMonth.plusMonths(i);
            String dateKey = ym.toString();
            String label = ym.format(labelFormatter);
            long[] counts = activityMap.getOrDefault(dateKey, new long[]{0L, 0L});
            points.add(new MessageTimeSeriesResponse.Point(dateKey, label, counts[0], counts[1]));
        }

        return createResponse("month", period.name(), points);
    }

    private MessageTimeSeriesResponse buildYearlyTimeSeries(MessageTimeSeriesPeriod period, ZoneId zone) {
        var rawData = messageRepository.countActivityByYear(zone.getId());
        var activityMap = rawData.stream()
                .collect(Collectors.toMap(
                        row -> (String) row[0],
                        row -> new long[]{((Number) row[1]).longValue(), ((Number) row[2]).longValue()}));

        int currentYear = LocalDate.now(zone).getYear();
        int minYear = rawData.stream()
                .map(row -> Integer.parseInt((String) row[0]))
                .min(Integer::compareTo)
                .orElse(currentYear - 2);

        int startYear = Math.min(minYear, currentYear - 2);
        int totalYears = currentYear - startYear + 1;
        List<MessageTimeSeriesResponse.Point> points = new ArrayList<>(totalYears);

        for (int year = startYear; year <= currentYear; year++) {
            String dateKey = String.valueOf(year);
            String label = dateKey;
            long[] counts = activityMap.getOrDefault(dateKey, new long[]{0L, 0L});
            points.add(new MessageTimeSeriesResponse.Point(dateKey, label, counts[0], counts[1]));
        }

        return createResponse("year", period.name(), points);
    }

    private MessageTimeSeriesResponse createResponse(String granularity, String periodName, List<MessageTimeSeriesResponse.Point> points) {
        long totalMessages = 0;
        long totalActiveUsers = 0;
        long peakMessages = 0;
        String peakPeriodLabel = points.isEmpty() ? "" : points.get(0).label();

        for (var point : points) {
            totalMessages += point.messages();
            totalActiveUsers = Math.max(totalActiveUsers, point.activeUsers());
            if (point.messages() > peakMessages) {
                peakMessages = point.messages();
                peakPeriodLabel = point.label();
            }
        }

        double averageMessages = points.isEmpty() ? 0.0 : (double) totalMessages / points.size();
        double roundedAverage = Math.round(averageMessages * 100.0) / 100.0;

        return new MessageTimeSeriesResponse(
                granularity,
                periodName,
                totalMessages,
                totalActiveUsers,
                roundedAverage,
                peakMessages,
                peakPeriodLabel,
                points
        );
    }
}
