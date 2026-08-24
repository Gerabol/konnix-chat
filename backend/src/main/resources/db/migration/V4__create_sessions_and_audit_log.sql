-- V4: sessions e audit_log

create table sessions (
    id          uuid         primary key default gen_random_uuid(),
    user_id     uuid         not null references users (id) on delete cascade,
    token_hash  varchar(128) not null,
    expires_at  timestamptz  not null,
    created_at  timestamptz  not null default now(),
    revoked_at  timestamptz
);

create unique index uq_sessions_token_hash on sessions (token_hash);
create index ix_sessions_user_id on sessions (user_id);
create index ix_sessions_expires_at on sessions (expires_at);

create table audit_log (
    id          uuid         primary key default gen_random_uuid(),
    user_id     uuid         references users (id) on delete set null,
    action      varchar(80)  not null,
    resource    varchar(80),
    resource_id varchar(255),
    ip_address  varchar(45),
    created_at  timestamptz  not null default now()
);

create index ix_audit_log_created_at on audit_log (created_at);
create index ix_audit_log_user_id on audit_log (user_id);
