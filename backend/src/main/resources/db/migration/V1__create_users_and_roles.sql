-- V1: usuarios e roles

create extension if not exists pgcrypto;

create table users (
    id                            uuid        primary key default gen_random_uuid(),
    username                      varchar(60) not null,
    name                          varchar(160) not null,
    email                         varchar(254),
    password_hash                 varchar(255),
    active                        boolean     not null default true,
    user_type                     varchar(20) not null default 'USER',
    password_migration_required   boolean     not null default false,
    created_at                    timestamptz not null default now(),
    updated_at                    timestamptz not null default now(),
    legacy_source                 varchar(30),
    legacy_id                     varchar(255)
);

create unique index uq_users_username on users (username);
create unique index uq_users_email on users (email);
create index ix_users_legacy_id on users (legacy_id);
create unique index uq_users_legacy on users (legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null;

create table roles (
    id          uuid         primary key default gen_random_uuid(),
    name        varchar(60)  not null,
    description varchar(255),
    created_at  timestamptz  not null default now()
);

create unique index uq_roles_name on roles (name);

create table user_roles (
    user_id uuid not null references users (id) on delete cascade,
    role_id uuid not null references roles (id) on delete cascade,
    primary key (user_id, role_id)
);

create index ix_user_roles_role_id on user_roles (role_id);
