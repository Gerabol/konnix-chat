-- V21: Add pinned message to rooms
alter table rooms
    add column pinned_message_id uuid references messages (id) on delete set null;

create index ix_rooms_pinned_message_id on rooms (pinned_message_id);
