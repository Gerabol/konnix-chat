alter table users
    add column password_change_required boolean not null default false;
