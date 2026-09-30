-- Create message_mentions table to track @user mentions in messages
CREATE TABLE message_mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    CONSTRAINT uq_message_mentions_msg_user UNIQUE (message_id, user_id)
);

CREATE INDEX ix_message_mentions_user_unread
    ON message_mentions(user_id, room_id)
    WHERE read_at IS NULL;

CREATE INDEX ix_message_mentions_room
    ON message_mentions(room_id);
