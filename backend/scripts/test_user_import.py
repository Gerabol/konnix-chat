#!/usr/bin/env python3
"""
Bateria de Testes e Validação: Cadastro de Novos Usuários no Konnix Chat
Governança e Diretrizes:
- Perfil padrão para todos: USER
- Senha inicial padrão: cge@2026 (com passwordChangeRequired = true)
- Usuários inativos: mantidos como DISABLED para preservar histórico
- Sem dependência de ID legado: novos UUIDs nativos
- Zero Vazamento de PII: arquivos gerados na pasta backend/data/ protegidos pelo .gitignore
"""

import json
import os
import re
import sys
import uuid
from typing import Dict, List, Any

# Caminhos dos arquivos
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(BACKEND_DIR, "data")
JSON_INPUT = os.path.join(DATA_DIR, "Json usuarios.json")
SQL_OUTPUT = os.path.join(DATA_DIR, "cadastrar_usuarios.sql")
CSV_OUTPUT = os.path.join(DATA_DIR, "usuarios_cadastrados_para_colegas.csv")

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
DEFAULT_PASSWORD = "cge@2026"
ROLE_USER_ID = "22222222-2222-2222-2222-222222222222" # ID fixo da role USER (V5__seed_roles.sql)

class TestFailure(Exception):
    pass

def log_test(name: str):
    print(f"\n[TESTE] {name}...")

def assert_true(condition: bool, message: str):
    if not condition:
        raise TestFailure(message)

def run_tests():
    print("=" * 70)
    print("INICIANDO BATERIA DE TESTES DE CADASTRO DE USUÁRIOS (KONNIX CHAT)")
    print("=" * 70)

    # -------------------------------------------------------------
    # TESTE 1: Existência e Leitura do Arquivo de Origem
    # -------------------------------------------------------------
    log_test("1. Carregamento e Parsing do JSON de Usuários")
    assert_true(os.path.exists(JSON_INPUT), f"Arquivo não encontrado: {JSON_INPUT}")
    
    with open(JSON_INPUT, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    assert_true("users" in data, "Chave 'users' ausente no JSON")
    raw_users: List[Dict[str, Any]] = data["users"]
    assert_true(len(raw_users) == 50, f"Esperado 50 usuários, mas encontrou {len(raw_users)}")
    print(f"  ✓ {len(raw_users)} registros carregados com sucesso do JSON.")

    # -------------------------------------------------------------
    # TESTE 2: Validação de Regras de Negócio e Constraints do Schema
    # -------------------------------------------------------------
    log_test("2. Validação de Constraints (Username, Nome, E-mail, Unicidade)")
    usernames = set()
    emails = set()
    cleaned_users = []

    for idx, u in enumerate(raw_users, start=1):
        raw_username = u.get("username", "")
        raw_name = u.get("name", "")
        emails_list = u.get("emails", [])
        active_flag = bool(u.get("active", False))

        # Sanitização
        username = raw_username.strip()
        name = raw_name.strip()
        email = emails_list[0].get("address", "").strip().lower() if emails_list else None

        # Validações de tamanho e formato
        assert_true(len(username) >= 3, f"Usuário #{idx}: username '{username}' menor que 3 caracteres")
        assert_true(len(username) <= 60, f"Usuário #{idx}: username '{username}' excede 60 caracteres")
        assert_true(len(name) >= 1, f"Usuário #{idx}: nome vazio")
        assert_true(len(name) <= 160, f"Usuário #{idx}: nome '{name}' excede 160 caracteres")
        assert_true(email is not None, f"Usuário #{idx} ({username}): e-mail ausente")
        assert_true(EMAIL_REGEX.match(email) is not None, f"Usuário #{idx}: e-mail inválido '{email}'")
        assert_true(len(email) <= 254, f"Usuário #{idx}: e-mail '{email}' excede 254 caracteres")

        # Unicidade
        assert_true(username.lower() not in usernames, f"Username duplicado no arquivo: '{username}'")
        assert_true(email not in emails, f"E-mail duplicado no arquivo: '{email}'")

        usernames.add(username.lower())
        emails.add(email)

        account_status = "ACTIVE" if active_flag else "DISABLED"

        cleaned_users.append({
            "id": str(uuid.uuid4()),
            "username": username,
            "name": name,
            "email": email,
            "active": active_flag,
            "account_status": account_status,
            "role": "USER",
            "password": DEFAULT_PASSWORD,
            "password_change_required": True
        })

    print(f"  ✓ Todos os 50 usuários passaram em 100% das constraints de integridade.")
    print(f"  ✓ 50 usernames únicos e 50 e-mails únicos validados.")

    # -------------------------------------------------------------
    # TESTE 3: Verificação de Status Ativo vs Inativo (Disabled)
    # -------------------------------------------------------------
    log_test("3. Mapeamento de Status de Conta (Preservação de Inativos)")
    active_count = sum(1 for u in cleaned_users if u["account_status"] == "ACTIVE")
    disabled_count = sum(1 for u in cleaned_users if u["account_status"] == "DISABLED")

    assert_true(active_count == 36, f"Esperado 36 usuários ACTIVE, encontrou {active_count}")
    assert_true(disabled_count == 14, f"Esperado 14 usuários DISABLED, encontrou {disabled_count}")
    print(f"  ✓ Status mapeado: {active_count} ativos (ACTIVE) e {disabled_count} inativos (DISABLED).")

    # -------------------------------------------------------------
    # TESTE 4: Política de Credenciais e Primeiro Acesso
    # -------------------------------------------------------------
    log_test("4. Validação da Política de Senhas e Primeiro Acesso")
    assert_true(len(DEFAULT_PASSWORD) >= 8, "Senha padrão deve ter no mínimo 8 caracteres")
    for u in cleaned_users:
        assert_true(u["password_change_required"] is True, f"Usuário {u['username']} sem flag de troca obrigatória")
        assert_true(u["role"] == "USER", f"Usuário {u['username']} não recebeu role USER")
    print(f"  ✓ Senha padrão '{DEFAULT_PASSWORD}' configurada com password_change_required = true para todos.")

    # -------------------------------------------------------------
    # TESTE 5: Geração e Teste de Carga SQL (Idempotência PostgreSQL)
    # -------------------------------------------------------------
    log_test("5. Geração e Verificação de Script SQL para Inserção no PostgreSQL")
    
    sql_lines = [
        "-- ==========================================================================",
        "-- Script de Cadastro de Usuários no Konnix Chat",
        "-- Gerado automaticamente a partir do export de usuários sanitizado",
        "-- Total de usuários: 50 (36 Ativos, 14 Desativados)",
        "-- Senha inicial padrão: cge@2026 (bcrypt via pgcrypto, troca obrigatória)",
        "-- ==========================================================================\n",
        "BEGIN;\n",
        "-- Garante que a role USER existe",
        f"INSERT INTO roles (id, name, description, created_at) VALUES ('{ROLE_USER_ID}', 'USER', 'Usuário comum', now()) ON CONFLICT (name) DO NOTHING;\n"
    ]

    for u in cleaned_users:
        esc_username = u["username"].replace("'", "''")
        esc_name = u["name"].replace("'", "''")
        esc_email = u["email"].replace("'", "''")
        active_str = "true" if u["active"] else "false"
        status_str = u["account_status"]

        # Usa pgcrypto crypt() com bcrypt cost 10
        sql_lines.append(f"""-- Usuário: {esc_username} ({status_str})
INSERT INTO users (
    id, username, name, email, password_hash,
    active, account_status, user_type,
    password_change_required, password_migration_required,
    presence_status, theme, created_at, updated_at
) VALUES (
    '{u["id"]}',
    '{esc_username}',
    '{esc_name}',
    '{esc_email}',
    crypt('{DEFAULT_PASSWORD}', gen_salt('bf', 10)),
    {active_str},
    '{status_str}',
    'USER',
    true,
    false,
    'offline',
    'DEFAULT',
    now(),
    now()
) ON CONFLICT (username) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    active = EXCLUDED.active,
    account_status = EXCLUDED.account_status,
    updated_at = now();

-- Atribui a role USER
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, '{ROLE_USER_ID}'
FROM users u
WHERE u.username = '{esc_username}'
ON CONFLICT (user_id, role_id) DO NOTHING;
""")

    sql_lines.append("COMMIT;\n")

    with open(SQL_OUTPUT, "w", encoding="utf-8") as f:
        f.write("\n".join(sql_lines))

    assert_true(os.path.exists(SQL_OUTPUT), f"Falha ao gerar arquivo SQL: {SQL_OUTPUT}")
    sql_size = os.path.getsize(SQL_OUTPUT)
    assert_true(sql_size > 1000, f"Arquivo SQL muito pequeno: {sql_size} bytes")
    print(f"  ✓ Script SQL gerado com sucesso: {SQL_OUTPUT} ({sql_size} bytes).")
    print(f"  ✓ Utiliza 'crypt(..., gen_salt('bf', 10))' e 'ON CONFLICT DO UPDATE' para total idempotência.")

    # -------------------------------------------------------------
    # TESTE 6: Geração de Planilha/CSV para Disponibilização aos Colegas
    # -------------------------------------------------------------
    log_test("6. Geração da Planilha de Credenciais e Instruções para os Colegas")

    csv_header = "Username,Nome,Email,Status,Perfil,Senha_Inicial,Troca_Obrigatoria,Instrucoes_Acesso\n"
    csv_rows = [csv_header]

    for u in cleaned_users:
        status_label = "Ativo" if u["active"] else "Desativado"
        instrucao = (
            "Acessar o Konnix Chat com seu usuário e a senha temporária 'cge@2026'. "
            "No primeiro login, o sistema solicitará a definição da sua nova senha pessoal e definitiva."
            if u["active"] else
            "Conta atualmente desativada para preservação de histórico. Solicitar ativação ao administrador caso necessário."
        )
        # Escapar campos CSV
        row = f'"{u["username"]}","{u["name"]}","{u["email"]}","{status_label}","USER","{DEFAULT_PASSWORD}","SIM","{instrucao}"\n'
        csv_rows.append(row)

    with open(CSV_OUTPUT, "w", encoding="utf-8") as f:
        f.writelines(csv_rows)

    assert_true(os.path.exists(CSV_OUTPUT), f"Falha ao gerar arquivo CSV: {CSV_OUTPUT}")
    csv_size = os.path.getsize(CSV_OUTPUT)
    assert_true(csv_size > 500, f"Arquivo CSV muito pequeno: {csv_size} bytes")
    print(f"  ✓ CSV gerado com sucesso: {CSV_OUTPUT} ({csv_size} bytes, 50 registros).")

    # -------------------------------------------------------------
    # TESTE 7: Teste de Proteção Git (.gitignore)
    # -------------------------------------------------------------
    log_test("7. Validação de Blindagem contra Vazamentos no Git (.gitignore)")
    gitignore_path = os.path.join(BACKEND_DIR, "..", ".gitignore")
    with open(gitignore_path, "r", encoding="utf-8") as f:
        gitignore_content = f.read()

    assert_true("backend/data/" in gitignore_content, "Regra 'backend/data/' ausente no .gitignore")
    assert_true("*.csv" in gitignore_content, "Regra '*.csv' ausente no .gitignore")
    print("  ✓ Arquivos gerados (JSON, SQL e CSV) estão 100% blindados pelo .gitignore.")

    print("\n" + "=" * 70)
    print("TODOS OS 7 TESTES DA BATERIA FORAM CONCLUÍDOS COM SUCESSO!")
    print("=" * 70)
    print(f"Resumo da Análise e Preparação:")
    print(f"  - Total de Usuários: 50")
    print(f"  - Usuários Ativos para Acesso: 36")
    print(f"  - Usuários Desativados (Histórico): 14")
    print(f"  - Papel atribuído: USER para todos")
    print(f"  - Senha Inicial: cge@2026")
    print(f"  - Troca de Senha Obrigatória no 1º Acesso: SIM")
    print(f"  - Arquivo SQL para Execução no Banco: {SQL_OUTPUT}")
    print(f"  - Arquivo CSV para Envio aos Colegas: {CSV_OUTPUT}")
    print("=" * 70 + "\n")

if __name__ == "__main__":
    try:
        run_tests()
    except TestFailure as e:
        print(f"\n[FALHA NO TESTE] {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERRO INESPERADO] {e}", file=sys.stderr)
        sys.exit(1)
