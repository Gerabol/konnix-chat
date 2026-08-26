# ==============================================================================
# Script de Configuracao do GitHub Actions Self-Hosted Runner no Windows
# Repositorio: Konnix Chat (https://github.com/Gerabol/konnix-chat)
# ==============================================================================

[CmdletBinding()]
param(
    [string]$RepoUrl = "https://github.com/Gerabol/konnix-chat",
    [string]$Token = "",
    [string]$RunnerName = "",
    [string]$RunnerDir = "C:\actions-runner-konnix",
    [string]$RunnerVersion = "2.322.0"
)

$ErrorActionPreference = "Stop"

Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "   Konnix Chat - Assistente de Instalacao do GitHub Runner (Windows)" -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificacao de Pre-requisitos
Write-Host "[1/5] Verificando pre-requisitos do sistema..." -ForegroundColor Yellow

# Verificar Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "ERRO: O comando 'docker' nao foi encontrado." -ForegroundColor Red
    Write-Host "Por favor, instale e inicie o Docker Desktop antes de continuar." -ForegroundColor Red
    exit 1
}

try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO: O Docker Desktop nao esta em execucao." -ForegroundColor Red
        Write-Host "Certifique-se de que o Docker Desktop esta aberto e iniciado." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "ERRO ao conectar com o Docker: $_" -ForegroundColor Red
    exit 1
}

# Verificar Docker Compose
try {
    $composeVer = docker compose version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO: 'docker compose' nao esta disponivel." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "ERRO: 'docker compose' falhou: $_" -ForegroundColor Red
    exit 1
}

# Verificar Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "ERRO: 'git' nao foi encontrado no PATH." -ForegroundColor Red
    Write-Host "Instale o Git for Windows (https://git-scm.com/download/win)." -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Pre-requisitos atendidos (Docker Desktop ativo, Docker Compose, Git)." -ForegroundColor Green
Write-Host ""

# 2. Informacoes de Conexao com o GitHub
Write-Host "[2/5] Configuracoes de Conexao com o GitHub..." -ForegroundColor Yellow

if ([string]::IsNullOrWhiteSpace($RepoUrl)) {
    $RepoUrl = Read-Host "URL do Repositorio GitHub [https://github.com/Gerabol/konnix-chat]"
    if ([string]::IsNullOrWhiteSpace($RepoUrl)) {
        $RepoUrl = "https://github.com/Gerabol/konnix-chat"
    }
}

if ([string]::IsNullOrWhiteSpace($Token)) {
    Write-Host "`nPara obter o Token de Registro do Runner:" -ForegroundColor Gray
    Write-Host "1. Acesse: $RepoUrl/settings/actions/runners/new?os=win" -ForegroundColor Gray
    Write-Host "2. Copie o token exibido apos a flag --token.`n" -ForegroundColor Gray
    $Token = Read-Host "Cole o TOKEN de registro do GitHub Runner"
    if ([string]::IsNullOrWhiteSpace($Token)) {
        Write-Host "ERRO: O token de registro e obrigatorio." -ForegroundColor Red
        exit 1
    }
}

if ([string]::IsNullOrWhiteSpace($RunnerName)) {
    $cleanHost = ($env:COMPUTERNAME -replace '[^a-zA-Z0-9-]', '').ToLower()
    $defaultName = "konnix-host-$cleanHost"
    $RunnerName = Read-Host "Nome deste Runner [$defaultName]"
    if ([string]::IsNullOrWhiteSpace($RunnerName)) {
        $RunnerName = $defaultName
    }
}

$defaultLabels = "self-hosted,windows,konnix-deploy"
$RunnerLabels = Read-Host "Labels adicionais (separadas por virgula) [$defaultLabels]"
if ([string]::IsNullOrWhiteSpace($RunnerLabels)) {
    $RunnerLabels = $defaultLabels
}

# 3. Preparacao do Diretorio de Instalacao
Write-Host "`n[3/5] Preparando diretorio de instalacao..." -ForegroundColor Yellow
Write-Host "Diretorio do Runner: $RunnerDir" -ForegroundColor Gray

if (-not (Test-Path $RunnerDir)) {
    New-Item -ItemType Directory -Path $RunnerDir -Force | Out-Null
}

Set-Location $RunnerDir

# 4. Download e Validacao SHA-256 do Runner
Write-Host "`n[4/5] Baixando e validando integridade do GitHub Actions Runner..." -ForegroundColor Yellow

$zipFile = "actions-runner-win-x64-$RunnerVersion.zip"
$downloadUrl = "https://github.com/actions/runner/releases/download/v$RunnerVersion/$zipFile"
$expectedHash = "ace5de018c88492ca80a2323af53ff3f43d2c82741853efb302928f250516015"

if ((-not (Test-Path $zipFile)) -and (-not (Test-Path "config.cmd"))) {
    Write-Host "Baixando pacote oficial ($downloadUrl)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipFile -UseBasicParsing
}

if ((Test-Path $zipFile) -and (-not (Test-Path "config.cmd"))) {
    Write-Host "Validando checksum SHA-256..." -ForegroundColor Cyan
    $calculatedHash = (Get-FileHash -Path $zipFile -Algorithm SHA256).Hash.ToLower()

    if ($calculatedHash -ne $expectedHash.ToLower()) {
        Write-Host "ERRO CRITICO: Falha na validacao SHA-256 do pacote baixado!" -ForegroundColor Red
        Write-Host "Esperado: $expectedHash" -ForegroundColor Red
        Write-Host "Obtido:   $calculatedHash" -ForegroundColor Red
        Remove-Item -Path $zipFile -Force -ErrorAction SilentlyContinue
        exit 1
    }
    Write-Host "[OK] Checksum SHA-256 verificado com sucesso!" -ForegroundColor Green

    Write-Host "Extraindo arquivos do instalador..." -ForegroundColor Cyan
    Expand-Archive -Path $zipFile -DestinationPath $RunnerDir -Force
}

# 5. Registro do Runner no GitHub
Write-Host "`n[5/5] Registrando o Runner no GitHub..." -ForegroundColor Yellow

$configArgs = @(
    "--url", $RepoUrl,
    "--token", $Token,
    "--name", $RunnerName,
    "--labels", $RunnerLabels,
    "--work", "_work",
    "--unattended",
    "--replace"
)

& .\config.cmd $configArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO ao registrar o runner no GitHub. Verifique se o token ainda e valido." -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Runner registrado com sucesso!" -ForegroundColor Green
Write-Host ""

# Instalacao como Servico do Windows ou execucao manual
$installSvc = Read-Host "Deseja instalar e iniciar o Runner como Servico do Windows agora? (S/n)"
if ([string]::IsNullOrWhiteSpace($installSvc) -or ($installSvc -match "^[sSyY]$")) {
    Write-Host "Instalando servico do Windows (requer permissao de Administrador)..." -ForegroundColor Cyan
    try {
        & .\svc.cmd install
        & .\svc.cmd start
        Write-Host "[OK] Servico do GitHub Actions Runner instalado e iniciado!" -ForegroundColor Green
    } catch {
        Write-Host "AVISO: Para instalar como servico, execute o PowerShell como Administrador." -ForegroundColor Yellow
        Write-Host "Voce pode iniciar o runner interativamente executando:" -ForegroundColor Gray
        Write-Host "  cd $RunnerDir" -ForegroundColor White
        Write-Host "  .\run.cmd" -ForegroundColor White
    }
} else {
    Write-Host "Para iniciar o runner interativamente, execute:" -ForegroundColor Gray
    Write-Host "  cd $RunnerDir" -ForegroundColor White
    Write-Host "  .\run.cmd" -ForegroundColor White
}

Write-Host ""
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "   Pronto! Esta maquina esta configurada para receber os deploys!  " -ForegroundColor Green
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "Proximos passos:" -ForegroundColor Yellow
Write-Host "1. Verifique se o status esta 'Idle / Online' em: $RepoUrl/settings/actions/runners"
Write-Host "2. Ao fazer push na branch 'homologacao' ou 'main', o deploy sera executado aqui automaticamente."
Write-Host "3. Para acompanhar os containers locais:"
Write-Host "   docker ps"
Write-Host "   docker logs -f konnix-staging-backend"
Write-Host "   docker logs -f konnix-staging-cloudflared"
Write-Host "===================================================================" -ForegroundColor Cyan
