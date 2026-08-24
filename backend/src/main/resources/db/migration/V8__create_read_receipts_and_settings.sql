create table message_reads (
    id         uuid primary key default gen_random_uuid(),
    message_id uuid not null references messages (id) on delete cascade,
    user_id    uuid not null references users (id) on delete cascade,
    read_at    timestamptz not null default now(),
    constraint uq_message_reads_message_user unique (message_id, user_id)
);

create index ix_message_reads_user_message on message_reads (user_id, message_id);

create table system_settings (
    setting_key   varchar(120) primary key,
    boolean_value boolean not null,
    updated_at    timestamptz not null default now()
);

insert into system_settings (setting_key, boolean_value)
values ('read_receipts.enabled', true)
on conflict (setting_key) do nothing;
