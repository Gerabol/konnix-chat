create table message_reactions (
    id uuid primary key default gen_random_uuid(),
    message_id uuid not null references messages(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    emoji varchar(16) not null,
    created_at timestamptz not null default now(),
    constraint uq_message_reactions unique (message_id, user_id, emoji)
);
create index ix_message_reactions_message on message_reactions(message_id);
