-- V15: enquetes em grupos
create table polls (
    id              uuid primary key default gen_random_uuid(),
    message_id      uuid not null unique references messages (id) on delete cascade,
    question        varchar(500) not null,
    allow_multiple  boolean not null default false,
    created_at      timestamptz not null default now()
);

create table poll_options (
    id          uuid primary key default gen_random_uuid(),
    poll_id     uuid not null references polls (id) on delete cascade,
    label       varchar(255) not null,
    position    integer not null
);

create index ix_poll_options_poll_id on poll_options (poll_id);

create table poll_votes (
    id          uuid primary key default gen_random_uuid(),
    poll_id     uuid not null references polls (id) on delete cascade,
    option_id   uuid not null references poll_options (id) on delete cascade,
    user_id     uuid not null references users (id) on delete cascade,
    created_at  timestamptz not null default now(),
    unique (poll_id, option_id, user_id)
);

create index ix_poll_votes_poll_id on poll_votes (poll_id);
create index ix_poll_votes_user_id on poll_votes (user_id);
