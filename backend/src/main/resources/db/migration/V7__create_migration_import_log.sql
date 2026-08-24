-- V7: log de importacao do migrador Rocket -> Konnix

create table migration_import_log (
    id            uuid         primary key default gen_random_uuid(),
    source        varchar(30)  not null,
    source_type   varchar(30)  not null,
    source_id     varchar(255) not null,
    target_type   varchar(30)  not null,
    target_id     uuid,
    status        varchar(20)  not null,
    error_message text,
    imported_at   timestamptz  not null default now()
);

create index ix_migration_import_log_source on migration_import_log (source, source_type, status, imported_at);
create index ix_migration_import_log_imported_at on migration_import_log (imported_at);

-- garante idempotencia: um (source, source_type, source_id) so pode ter 1 registro SUCCESS
create unique index uq_migration_import_log_success
    on migration_import_log (source, source_type, source_id)
    where status = 'SUCCESS';
