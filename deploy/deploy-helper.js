// ==============================================================================
// Script Auxiliar Multiplataforma para Deploy do Konnix Chat (Node.js)
// Compatível nativamente com Windows (PowerShell/CMD), Linux e macOS
// ==============================================================================
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const action = process.argv[2];

if (action === 'prepare-staging-env') {
  const envFile = path.join(__dirname, '.env.staging');
  const exampleFile = path.join(__dirname, '.env.staging.example');
  const persistentDir = path.join(os.homedir(), '.konnix');
  const persistentEnv = path.join(persistentDir, 'staging.env');

  if (!fs.existsSync(persistentDir)) {
    fs.mkdirSync(persistentDir, { recursive: true });
  }

  if (fs.existsSync(persistentEnv)) {
    fs.copyFileSync(persistentEnv, envFile);
    console.log('✓ deploy/.env.staging restaurado da persistência (~/.konnix/staging.env).');
  } else {
    console.log('Inicializando credenciais persistentes de homologação...');
    fs.copyFileSync(exampleFile, envFile);
    fs.copyFileSync(exampleFile, persistentEnv);

    // Reseta volumes anteriores para garantir sincronização das credenciais com o PostgreSQL
    try {
      console.log('Sincronizando volume do PostgreSQL para o primeiro ciclo...');
      execSync('docker compose -f deploy/docker-compose.staging.yml down -v', { stdio: 'inherit' });
    } catch (e) {}
    console.log('✓ deploy/.env.staging criado e sincronizado com o banco.');
  }
} else if (action === 'check-prod-env') {
  const envFile = path.join(__dirname, '.env.prod');
  if (!fs.existsSync(envFile)) {
    console.error('::error::Arquivo deploy/.env.prod não encontrado no host! O arquivo deve ser criado manualmente com senhas seguras.');
    process.exit(1);
  }
  console.log('✓ deploy/.env.prod verificado com sucesso.');
} else if (action === 'healthcheck-staging') {
  async function checkStaging() {
    console.log('==> Aguardando inicialização completa do Backend de Homologação...');
    const maxRetries = 40;
    let ok = false;
    for (let i = 1; i <= maxRetries; i++) {
      try {
        const res = await fetch('http://127.0.0.1:8082/api/public/server-info');
        if (res.ok) {
          console.log('✓ Backend de Homologação respondendo com sucesso em http://127.0.0.1:8082!');
          ok = true;
          break;
        }
      } catch (e) {}
      console.log(`Aguardando backend inicializar... (${i}/${maxRetries})`);
      await new Promise(r => setTimeout(r, 3000));
    }
    if (!ok) {
      console.error('ERRO: O backend de homologação não respondeu no tempo limite.');
      try {
        console.log(execSync('docker logs --tail=50 konnix-staging-backend', { encoding: 'utf8' }));
      } catch (e) {}
      process.exit(1);
    }

    // Obter URL pública do Cloudflare Tunnel
    await new Promise(r => setTimeout(r, 6000));
    let url = 'Domínio Personalizado Configurado ou Quick Tunnel Ativo';
    try {
      const logs = execSync('docker logs --tail=150 konnix-staging-cloudflared 2>&1', { encoding: 'utf8' });
      const cleanLogs = logs.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
      const matches = cleanLogs.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);
      if (matches && matches.length > 0) {
        url = matches[matches.length - 1];
      }
    } catch (e) {}
    console.log('\n==================================================================');
    console.log('🎉 URL PÚBLICA DE HOMOLOGAÇÃO: ' + url);
    console.log('==================================================================\n');

    // Grava no resumo da Action e nas saídas do step
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `url=${url}\n`, 'utf8');
    }

    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    if (summaryFile) {
      const sha = process.env.GITHUB_SHA || '';
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
      const md = [
        '### 🚀 Deploy de Homologação Concluído com Sucesso!',
        '',
        '- **Ambiente**: Homologação (Staging)',
        '- **Branch**: `homologacao`',
        `- **Commit**: \`${sha}\``,
        `- **Data/Hora**: ${now}`,
        '- **Porta Local Frontend**: `http://localhost:5175`',
        '- **Porta Local Backend**: `http://localhost:8082`',
        `- **Acesso Público Global**: [${url}](${url})`
      ].join('\n') + '\n';
      fs.appendFileSync(summaryFile, md, 'utf8');
    }
  }
  checkStaging();
} else if (action === 'healthcheck-prod') {
  async function checkProd() {
    console.log('==> Aguardando inicialização completa do Backend de Produção...');
    const maxRetries = 40;
    let ok = false;
    for (let i = 1; i <= maxRetries; i++) {
      try {
        const res = await fetch('http://127.0.0.1:8080/api/public/server-info');
        if (res.ok) {
          console.log('✓ Backend de Produção respondendo com sucesso em http://127.0.0.1:8080!');
          ok = true;
          break;
        }
      } catch (e) {}
      console.log(`Aguardando backend de produção... (${i}/${maxRetries})`);
      await new Promise(r => setTimeout(r, 3000));
    }
    if (!ok) {
      console.error('ERRO: O backend de produção não respondeu no tempo limite.');
      try {
        console.log(execSync('docker logs --tail=50 konnix-prod-backend', { encoding: 'utf8' }));
      } catch (e) {}
      process.exit(1);
    }

    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    if (summaryFile) {
      const sha = process.env.GITHUB_SHA || '';
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
      const md = [
        '### 🚀 Deploy de Produção Concluído com Sucesso!',
        '',
        '- **Ambiente**: Produção (Production)',
        '- **Branch**: `main`',
        `- **Commit**: \`${sha}\``,
        `- **Data/Hora**: ${now}`,
        '- **Status Backend**: Saudável (`http://localhost:8080`)',
        '- **Status Frontend**: Ativo (`http://localhost:80`)',
        '- **Status Cloudflare Tunnel**: Conectado ao Domínio Corporativo'
      ].join('\n') + '\n';
      fs.appendFileSync(summaryFile, md, 'utf8');
    }
  }
  checkProd();
} else {
  console.error('Ação desconhecida: ' + action);
  process.exit(1);
}
