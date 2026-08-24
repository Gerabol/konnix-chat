-- V6: subscriptions Web Push por usuário

create table push_subscriptions (
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    endpoint text not null,
    p256dh text not null,
    auth text not null,
    user_agent varchar(255),
    created_at timestamp not null default now(),
    updated_at timestamp not null default now()
);

create unique index uq_push_subscriptions_endpoint on push_subscriptions (endpoint);
create index idx_push_subscriptions_user on push_subscriptions (user_id);
