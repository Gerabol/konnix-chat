alter table sessions add column if not exists api_token boolean not null default false;
alter table sessions add column if not exists token_preview varchar(32);
alter table sessions add column if not exists created_by_user_id uuid references users(id);
