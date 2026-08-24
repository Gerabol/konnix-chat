-- V14: administradores permanecem sempre ativos
update users u
set active = true,
    account_status = 'ACTIVE'
where exists (
    select 1
    from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = u.id
      and r.name = 'ADMIN'
);
