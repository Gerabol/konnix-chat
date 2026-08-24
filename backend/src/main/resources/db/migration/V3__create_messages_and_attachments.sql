-- V3: messages e attachments

create table messages (
    id                uuid         primary key default gen_random_uuid(),
    room_id           uuid         not null references rooms (id) on delete cascade,
    user_id           uuid         references users (id) on delete set null,
    content           text,
    message_type      varchar(20)  not null default 'USER',
    parent_message_id uuid         references messages (id) on delete set null,
    created_at        timestamptz  not null default now(),
    updated_at        timestamptz  not null default now(),
    edited_at         timestamptz,
    deleted_at        timestamptz,
    legacy_source     varchar(30),
    legacy_id         varchar(255)
);

create index ix_messages_room_created on messages (room_id, created_at);
create index ix_messages_user_id on messages (user_id);
create index ix_messages_parent on messages (parent_message_id);
create index ix_messages_legacy_id on messages (legacy_id);
create unique index uq_messages_legacy on messages (legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null;

create table attachments (
    id            uuid         primary key default gen_random_uuid(),
    message_id    uuid         not null references messages (id) on delete cascade,
    user_id       uuid         not null references users (id) on delete cascade,
    original_name varchar(255) not null,
    stored_name   varchar(255) not null,
    mime_type     varchar(160),
    size          bigint,
    storage_path  varchar(500),
    sha256        varchar(64),
    created_at    timestamptz  not null default now(),
    legacy_source varchar(30),
    legacy_id     varchar(255)
);

create index ix_attachments_message_id on attachments (message_id);
create index ix_attachments_user_id on attachments (user_id);
create index ix_attachments_legacy_id on attachments (legacy_id);
create unique index uq_attachments_legacy on attachments (legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null;
