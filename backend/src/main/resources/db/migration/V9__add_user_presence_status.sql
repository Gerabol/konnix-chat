alter table users
    add column presence_status varchar(20) not null default 'online';
