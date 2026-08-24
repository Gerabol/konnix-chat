-- V2: rooms e room_members

create table rooms (
    id           uuid         primary key default gen_random_uuid(),
    name         varchar(160),
    display_name varchar(160),
    type         varchar(20)  not null,
    created_by   uuid         references users (id) on delete set null,
    read_only    boolean      not null default false,
    created_at   timestamptz  not null default now(),
    updated_at   timestamptz  not null default now(),
    legacy_source varchar(30),
    legacy_id    varchar(255)
);

create index ix_rooms_legacy_id on rooms (legacy_id);
create unique index uq_rooms_legacy on rooms (legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null;

create table room_members (
    id            uuid         primary key default gen_random_uuid(),
    room_id       uuid         not null references rooms (id) on delete cascade,
    user_id       uuid         not null references users (id) on delete cascade,
    role          varchar(20)  not null default 'MEMBER',
    joined_at     timestamptz  not null default now(),
    active        boolean      not null default true,
    legacy_source varchar(30),
    legacy_id     varchar(255)
);

create unique index uq_room_members_room_user on room_members (room_id, user_id);
create index ix_room_members_user_id on room_members (user_id);
create index ix_room_members_legacy_id on room_members (legacy_id);
