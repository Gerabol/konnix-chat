-- V5: roles iniciais do Konnix

insert into roles (id, name, description, created_at) values
    ('11111111-1111-1111-1111-111111111111', 'ADMIN', 'Administrador do sistema', now()),
    ('22222222-2222-2222-2222-222222222222', 'USER', 'Usuário comum', now()),
    ('33333333-3333-3333-3333-333333333333', 'BOT', 'Bot', now())
on conflict (name) do nothing;
