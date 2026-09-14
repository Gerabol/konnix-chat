package br.gov.pb.cge.konnix.api.admin.dto;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class MessageTimeSeriesPeriodTest {

    @Test
    void parsePadraoParaValoresNulosOuVazios() {
        assertThat(MessageTimeSeriesPeriod.fromString(null)).isEqualTo(MessageTimeSeriesPeriod.DAYS_7);
        assertThat(MessageTimeSeriesPeriod.fromString("")).isEqualTo(MessageTimeSeriesPeriod.DAYS_7);
        assertThat(MessageTimeSeriesPeriod.fromString("   ")).isEqualTo(MessageTimeSeriesPeriod.DAYS_7);
    }

    @Test
    void parseNomesExatosEnum() {
        assertThat(MessageTimeSeriesPeriod.fromString("DAYS_7")).isEqualTo(MessageTimeSeriesPeriod.DAYS_7);
        assertThat(MessageTimeSeriesPeriod.fromString("DAYS_30")).isEqualTo(MessageTimeSeriesPeriod.DAYS_30);
        assertThat(MessageTimeSeriesPeriod.fromString("DAYS_90")).isEqualTo(MessageTimeSeriesPeriod.DAYS_90);
        assertThat(MessageTimeSeriesPeriod.fromString("MONTHS_12")).isEqualTo(MessageTimeSeriesPeriod.MONTHS_12);
        assertThat(MessageTimeSeriesPeriod.fromString("YEARS")).isEqualTo(MessageTimeSeriesPeriod.YEARS);
    }

    @ParameterizedTest
    @ValueSource(strings = {"7", "7d", "days_7"})
    void parseAliases7Dias(String alias) {
        assertThat(MessageTimeSeriesPeriod.fromString(alias)).isEqualTo(MessageTimeSeriesPeriod.DAYS_7);
    }

    @ParameterizedTest
    @ValueSource(strings = {"30", "30d", "days_30"})
    void parseAliases30Dias(String alias) {
        assertThat(MessageTimeSeriesPeriod.fromString(alias)).isEqualTo(MessageTimeSeriesPeriod.DAYS_30);
    }

    @ParameterizedTest
    @ValueSource(strings = {"12", "12m", "months_12"})
    void parseAliases12Meses(String alias) {
        assertThat(MessageTimeSeriesPeriod.fromString(alias)).isEqualTo(MessageTimeSeriesPeriod.MONTHS_12);
    }

    @ParameterizedTest
    @ValueSource(strings = {"year", "years"})
    void parseAliasesAnual(String alias) {
        assertThat(MessageTimeSeriesPeriod.fromString(alias)).isEqualTo(MessageTimeSeriesPeriod.YEARS);
    }

    @Test
    void granulosidadeECorrespondemAosValoresEsperados() {
        assertThat(MessageTimeSeriesPeriod.DAYS_7.getGranularity()).isEqualTo("day");
        assertThat(MessageTimeSeriesPeriod.DAYS_7.getCount()).isEqualTo(7);

        assertThat(MessageTimeSeriesPeriod.MONTHS_12.getGranularity()).isEqualTo("month");
        assertThat(MessageTimeSeriesPeriod.MONTHS_12.getCount()).isEqualTo(12);

        assertThat(MessageTimeSeriesPeriod.YEARS.getGranularity()).isEqualTo("year");
    }
}
