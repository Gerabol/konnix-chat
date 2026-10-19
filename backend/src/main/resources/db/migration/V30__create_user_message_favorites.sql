-- V30: Create user message favorites table
create table user_message_favorites (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users (id) on delete cascade,
    message_id uuid not null references messages (id) on delete cascade,
    created_at timestamp with time zone not null default now(),
    constraint uk_user_message_favorites unique (user_id, message_id)
);

create index ix_user_message_favorites_user_id on user_message_favorites (user_id, created_at desc);
create index ix_user_message_favorites_message_id on user_message_favorites (message_id);
