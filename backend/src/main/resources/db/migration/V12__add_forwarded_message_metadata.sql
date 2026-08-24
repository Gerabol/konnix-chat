alter table messages add column forwarded_from_user_id uuid references users(id) on delete set null;
