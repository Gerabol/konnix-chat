package br.gov.pb.cge.konnix.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class FileServiceAudioDetectionTest {

    @Test
    void videoMp4NaoEhAudioMesmoComMimeAusente() {
        assertThat(FileService.isAudio("video/mp4", "apresentacao.mp4")).isFalse();
        assertThat(FileService.isAudio(null, "apresentacao.mp4")).isFalse();
        assertThat(FileService.isAudio("application/octet-stream", "apresentacao.mp4")).isFalse();
    }

    @Test
    void videoWebmNaoEhAudio() {
        assertThat(FileService.isAudio("video/webm", "gravacao-da-tela.webm")).isFalse();
        assertThat(FileService.isAudio("video/webm;codecs=vp9", "gravacao-da-tela.webm")).isFalse();
        assertThat(FileService.isAudio(null, "gravacao-da-tela.webm")).isFalse();
    }

    @Test
    void arquivosDeAudioContinuamSendoDetectados() {
        assertThat(FileService.isAudio("audio/webm", "gravacao.webm")).isTrue();
        assertThat(FileService.isAudio("audio/mpeg", "gravacao.mp3")).isTrue();
        assertThat(FileService.isAudio("audio/mp4", "nota.m4a")).isTrue();
        assertThat(FileService.isAudio("application/octet-stream", "nota.m4a")).isTrue();
        assertThat(FileService.isAudio(null, "nota.wav")).isTrue();
    }

    @Test
    void outrosTiposNaoSaoAudio() {
        assertThat(FileService.isAudio("text/plain", "relatorio.txt")).isFalse();
        assertThat(FileService.isAudio("image/png", "foto.png")).isFalse();
        assertThat(FileService.isAudio(null, "documento.pdf")).isFalse();
    }
}
