#!/usr/bin/env bash
# ==============================================================================
# Script de Configuração do GitHub Actions Self-Hosted Runner para o Konnix Chat
# ==============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}===================================================================${NC}"
echo -e "${BLUE}   Konnix Chat - Assistente de Instalação do GitHub Actions Runner   ${NC}"
echo -e "${BLUE}===================================================================${NC}\n"

# 1. Verificação de Pré-requisitos
echo -e "${YELLOW}[1/5] Verificando pré-requisitos do sistema...${NC}"

check_cmd() {
    if ! command -v "$1" &>/dev/null; then
        echo -e "${RED}ERRO: Comando '$1' não foi encontrado no sistema.${NC}"
        echo -e "Por favor, instale '$1' antes de prosseguir."
        exit 1
    fi
}

check_cmd "curl"
check_cmd "tar"
check_cmd "docker"

# Verifica se o Docker Compose está disponível (como plugin ou standalone)
if docker compose version &>/dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo -e "${RED}ERRO: Docker Compose não foi encontrado.${NC}"
    echo -e "Por favor, instale o plugin 'docker-compose-plugin' ou 'docker-compose'."
    exit 1
fi

# Verifica se o usuário atual tem permissão para rodar Docker sem sudo
if ! docker info &>/dev/null; then
    echo -e "${RED}AVISO: Não foi possível conectar ao Docker sem privilégios elevados.${NC}"
    echo -e "Se você estiver no Linux, adicione seu usuário ao grupo docker:"
    echo -e "  sudo usermod -aG docker \$USER && newgrp docker"
    echo -e "Ou execute este script com as devidas permissões.\n"
    read -rp "Deseja tentar continuar mesmo assim? (s/N): " FORCE_CONTINUE
    if [[ ! "$FORCE_CONTINUE" =~ ^[sS]$ ]]; then
        exit 1
    fi
fi

echo -e "${GREEN}✓ Pré-requisitos atendidos (Docker, Docker Compose, Curl, Tar).${NC}\n"

# 2. Detecção de Plataforma e Arquitetura
echo -e "${YELLOW}[2/5] Detectando arquitetura do sistema operacional...${NC}"
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

RUNNER_OS=""
RUNNER_ARCH=""

if [[ "$OS" == "linux" ]]; then
    RUNNER_OS="linux"
elif [[ "$OS" == "darwin" ]]; then
    RUNNER_OS="osx"
else
    echo -e "${RED}Sistema operacional não suportado automaticamente: $OS${NC}"
    exit 1
fi

if [[ "$ARCH" == "x86_64" || "$ARCH" == "amd64" ]]; then
    RUNNER_ARCH="x64"
elif [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
    RUNNER_ARCH="arm64"
else
    echo -e "${RED}Arquitetura de CPU não suportada: $ARCH${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Plataforma detectada: ${RUNNER_OS}-${RUNNER_ARCH}${NC}\n"

# 3. Informações do Repositório e Token
echo -e "${YELLOW}[3/5] Configurações de Conexão com o GitHub...${NC}"

DEFAULT_REPO="https://github.com/Gerabol/konnix-chat"
read -rp "URL do Repositório GitHub [$DEFAULT_REPO]: " REPO_URL
REPO_URL="${REPO_URL:-$DEFAULT_REPO}"

echo -e "\nPara obter o Token de Registro do Runner:"
echo -e "1. Acesse o repositório no GitHub: ${REPO_URL}/settings/actions/runners/new"
echo -e "2. Copie o valor do token de registro (após a flag --token).\n"

read -rp "Cole o TOKEN de registro do GitHub Runner: " RUNNER_TOKEN
if [[ -z "$RUNNER_TOKEN" ]]; then
    echo -e "${RED}ERRO: O token de registro é obrigatório.${NC}"
    exit 1
fi

DEFAULT_NAME="konnix-host-$(hostname | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')"
read -rp "Nome deste Runner [$DEFAULT_NAME]: " RUNNER_NAME
RUNNER_NAME="${RUNNER_NAME:-$DEFAULT_NAME}"

DEFAULT_LABELS="self-hosted,linux,konnix-deploy"
read -rp "Labels adicionais (separadas por vírgula) [$DEFAULT_LABELS]: " RUNNER_LABELS
RUNNER_LABELS="${RUNNER_LABELS:-$DEFAULT_LABELS}"

RUNNER_DIR="${HOME}/actions-runner-konnix"
echo -e "\nDiretório de instalação: ${RUNNER_DIR}"
mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

# 4. Download, Validação SHA-256 e Configuração do Runner (INCONS-04)
echo -e "\n${YELLOW}[4/5] Baixando e validando a integridade do GitHub Actions Runner...${NC}"

RUNNER_VERSION="2.322.0"
TAR_FILE="actions-runner-${RUNNER_OS}-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
DOWNLOAD_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${TAR_FILE}"

# Checksums SHA-256 oficiais da versão v2.322.0
declare -A CHECKSUMS=(
    ["linux-x64"]="b13b784808359f31bc79b08a191f5f83757852957dd8fe3dbfcc38202ccf5768"
    ["linux-arm64"]="501d6836109dfb00355f3f0907e155ea1b4f4cbe6ebc5e219fb0934091a13fa4"
    ["osx-x64"]="a64284d728514936b8017c603fc5b9319be7fefae8a7efbc7f0ad72a39a9c97b"
    ["osx-arm64"]="cf2b4dbad5fa16f86b763ec813eb4d8ee590e0c0347895d36e2f1837a76059fd"
)

TARGET_KEY="${RUNNER_OS}-${RUNNER_ARCH}"
EXPECTED_HASH="${CHECKSUMS[$TARGET_KEY]:-}"

if [[ ! -f "$TAR_FILE" && ! -f "config.sh" ]]; then
    echo -e "Baixando de: $DOWNLOAD_URL"
    curl -o "$TAR_FILE" -L "$DOWNLOAD_URL"
fi

if [[ -f "$TAR_FILE" && ! -f "config.sh" ]]; then
    if [[ -n "$EXPECTED_HASH" ]]; then
        echo -e "Validando integridade SHA-256..."
        if command -v sha256sum &>/dev/null; then
            CALCULATED_HASH=$(sha256sum "$TAR_FILE" | awk '{print $1}')
        else
            CALCULATED_HASH=$(shasum -a 256 "$TAR_FILE" | awk '{print $1}')
        fi

        if [[ "$CALCULATED_HASH" != "$EXPECTED_HASH" ]]; then
            echo -e "${RED}ERRO CRÍTICO: Falha na validação SHA-256 do pacote baixado!${NC}"
            echo -e "Esperado: $EXPECTED_HASH"
            echo -e "Obtido:   $CALCULATED_HASH"
            rm -f "$TAR_FILE"
            exit 1
        fi
        echo -e "${GREEN}✓ Checksum SHA-256 verificado com sucesso!${NC}"
    fi

    tar xzf "./$TAR_FILE"
fi

echo -e "Registrando o runner no GitHub..."
./config.sh \
    --url "$REPO_URL" \
    --token "$RUNNER_TOKEN" \
    --name "$RUNNER_NAME" \
    --labels "$RUNNER_LABELS" \
    --work "_work" \
    --unattended \
    --replace

echo -e "${GREEN}✓ Runner registrado com sucesso!${NC}\n"

# 5. Instalação como Serviço em Segundo Plano (Systemd / Launchd)
echo -e "${YELLOW}[5/5] Instalação como serviço do sistema...${NC}"

if [[ -f "./svc.sh" ]]; then
    read -rp "Deseja instalar e iniciar o Runner como serviço de background (systemd) agora? (S/n): " INSTALL_SVC
    INSTALL_SVC="${INSTALL_SVC:-S}"
    if [[ "$INSTALL_SVC" =~ ^[sS]$ ]]; then
        echo -e "Instalando serviço (pode solicitar senha sudo)..."
        sudo ./svc.sh install
        sudo ./svc.sh start
        echo -e "${GREEN}✓ Serviço do GitHub Actions Runner instalado e iniciado!${NC}"
    else
        echo -e "\nVocê pode iniciar o runner manualmente quando desejar executando:"
        echo -e "  cd ${RUNNER_DIR} && ./run.sh"
    fi
else
    echo -e "Para iniciar o runner manualmente execute:"
    echo -e "  cd ${RUNNER_DIR} && ./run.sh"
fi

echo -e "\n${BLUE}===================================================================${NC}"
echo -e "${GREEN}🎉 Parabéns! O servidor está configurado e pronto para CI/CD!${NC}"
echo -e "${BLUE}===================================================================${NC}"
echo -e "Próximos passos:"
echo -e "1. Verifique se o Runner está 'Idle / Online' em: ${REPO_URL}/settings/actions/runners"
echo -e "2. Faça push na branch 'homologacao' ou 'main' para disparar o primeiro deploy automático."
echo -e "3. Para checar os logs dos containers rodando:"
echo -e "   docker ps"
echo -e "   docker logs -f konnix-staging-cloudflared"
echo -e "${BLUE}===================================================================${NC}\n"
