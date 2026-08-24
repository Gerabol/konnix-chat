-- V13: estado administrativo da conta, separado da presença
alter table users
    add column account_status varchar(20) not null default 'ACTIVE';

update users
set account_status = case when active then 'ACTIVE' else 'DISABLED' end;

alter table users
    add constraint ck_users_account_status
    check (account_status in ('ACTIVE', 'READ_ONLY', 'DISABLED'));
