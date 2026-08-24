alter table room_members
    add column favorite boolean not null default false;

create index ix_room_members_user_favorite
    on room_members (user_id, favorite)
    where favorite = true;
