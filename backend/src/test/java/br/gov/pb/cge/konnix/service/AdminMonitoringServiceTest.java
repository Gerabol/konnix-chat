package br.gov.pb.cge.konnix.service;

import br.gov.pb.cge.konnix.api.admin.dto.MessageTimeSeriesPeriod;
import br.gov.pb.cge.konnix.api.admin.dto.MessageTimeSeriesResponse;
import br.gov.pb.cge.konnix.domain.attachment.AttachmentRepository;
import br.gov.pb.cge.konnix.domain.audit.AuditLogRepository;
import br.gov.pb.cge.konnix.domain.message.MessageRepository;
import br.gov.pb.cge.konnix.domain.room.RoomRepository;
import br.gov.pb.cge.konnix.domain.session.SessionRepository;
import br.gov.pb.cge.konnix.domain.user.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminMonitoringServiceTest {

    @Mock
    private AttachmentRepository attachmentRepository;
    @Mock
    private AuditLogRepository auditLogRepository;
    @Mock
    private MessageRepository messageRepository;
    @Mock
    private RoomRepository roomRepository;
    @Mock
    private SessionRepository sessionRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private EntityManager entityManager;

    private AdminMonitoringService service;

    @BeforeEach
    void setUp() {
        service = new AdminMonitoringService(
                attachmentRepository,
                auditLogRepository,
                messageRepository,
                roomRepository,
                sessionRepository,
                userRepository,
                entityManager
        );
    }

    @Test
    void serieTemporal7DiasComPreenchimentoDeLacunas() {
        ZoneId zone = ZoneId.systemDefault();
        String todayStr = LocalDate.now(zone).toString();

        List<Object[]> mockDbRows = List.<Object[]>of(
                new Object[]{todayStr, 25L, 5L}
        );

        when(messageRepository.countActivitySince(any(), eq(zone.getId()))).thenReturn(mockDbRows);

        MessageTimeSeriesResponse response = service.messageTimeSeries(MessageTimeSeriesPeriod.DAYS_7);

        assertThat(response).isNotNull();
        assertThat(response.granularity()).isEqualTo("day");
        assertThat(response.period()).isEqualTo("DAYS_7");
        assertThat(response.points()).hasSize(7);
        assertThat(response.totalMessages()).isEqualTo(25L);
        assertThat(response.peakMessages()).isEqualTo(25L);

        var lastPoint = response.points().get(6);
        assertThat(lastPoint.dateKey()).isEqualTo(todayStr);
        assertThat(lastPoint.messages()).isEqualTo(25L);
        assertThat(lastPoint.activeUsers()).isEqualTo(5L);

        var firstPoint = response.points().get(0);
        assertThat(firstPoint.messages()).isEqualTo(0L);
        assertThat(firstPoint.activeUsers()).isEqualTo(0L);
    }

    @Test
    void serieTemporal12Meses() {
        ZoneId zone = ZoneId.systemDefault();
        String currentMonthStr = YearMonth.now(zone).toString();

        List<Object[]> mockDbRows = List.<Object[]>of(
                new Object[]{currentMonthStr, 150L, 20L}
        );

        when(messageRepository.countActivityByMonthSince(any(), eq(zone.getId()))).thenReturn(mockDbRows);

        MessageTimeSeriesResponse response = service.messageTimeSeries(MessageTimeSeriesPeriod.MONTHS_12);

        assertThat(response).isNotNull();
        assertThat(response.granularity()).isEqualTo("month");
        assertThat(response.period()).isEqualTo("MONTHS_12");
        assertThat(response.points()).hasSize(12);
        assertThat(response.totalMessages()).isEqualTo(150L);
        assertThat(response.peakMessages()).isEqualTo(150L);

        var lastPoint = response.points().get(11);
        assertThat(lastPoint.dateKey()).isEqualTo(currentMonthStr);
        assertThat(lastPoint.messages()).isEqualTo(150L);
        assertThat(lastPoint.activeUsers()).isEqualTo(20L);
    }

    @Test
    void serieTemporalAnual() {
        ZoneId zone = ZoneId.systemDefault();
        int currentYear = LocalDate.now(zone).getYear();
        String currentYearStr = String.valueOf(currentYear);

        List<Object[]> mockDbRows = List.<Object[]>of(
                new Object[]{currentYearStr, 1200L, 80L}
        );

        when(messageRepository.countActivityByYear(eq(zone.getId()))).thenReturn(mockDbRows);

        MessageTimeSeriesResponse response = service.messageTimeSeries(MessageTimeSeriesPeriod.YEARS);

        assertThat(response).isNotNull();
        assertThat(response.granularity()).isEqualTo("year");
        assertThat(response.period()).isEqualTo("YEARS");
        assertThat(response.points().size()).isGreaterThanOrEqualTo(3);
        assertThat(response.totalMessages()).isEqualTo(1200L);

        var lastPoint = response.points().get(response.points().size() - 1);
        assertThat(lastPoint.dateKey()).isEqualTo(currentYearStr);
        assertThat(lastPoint.messages()).isEqualTo(1200L);
        assertThat(lastPoint.activeUsers()).isEqualTo(80L);
    }
}
