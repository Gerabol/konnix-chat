alter table users drop constraint if exists ck_users_theme;

alter table users
    add constraint ck_users_theme check (theme in (
        'DEFAULT', 'DARK', 'BLACK_GRAY', 'PINK', 'GREEN', 'RED',
        'GREEN_BLACK', 'PINK_BLACK', 'RED_BLACK',
        'DEFAULT_STRONG', 'GREEN_STRONG', 'PINK_STRONG', 'RED_STRONG'
    ));
