# ---- Build stage ----
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /build

COPY pom.xml .
RUN mvn -q -B dependency:go-offline

COPY src ./src
RUN mvn -q -B package -DskipTests

# ---- Runtime stage ----
FROM eclipse-temurin:21-jre

# Instala ffmpeg para processamento de áudio/vídeo e curl para healthchecks
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1001 konnix \
    && useradd -u 1001 -g konnix -s /bin/false -m konnix

WORKDIR /app

# Cria pasta de uploads e ajusta permissões para o usuário não-root
RUN mkdir -p /app/uploads && chown -R konnix:konnix /app

ENV JAVA_OPTS="-Xms256m -Xmx512m"
COPY --from=build --chown=konnix:konnix /build/target/*.jar app.jar

# Executa com usuário não-privilegiado (SEC-06)
USER konnix

EXPOSE 8080
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/app.jar"]
