create table app_settings (
    setting_key varchar(120) primary key,
    setting_value varchar(500) not null,
    updated_at timestamptz not null default now()
);
