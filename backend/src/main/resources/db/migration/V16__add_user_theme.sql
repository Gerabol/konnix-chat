alter table users
    add column theme varchar(20) not null default 'DEFAULT';

alter table users
    add constraint ck_users_theme
    check (theme in ('DEFAULT', 'DARK', 'BLACK_GRAY', 'PINK', 'GREEN', 'RED'));
