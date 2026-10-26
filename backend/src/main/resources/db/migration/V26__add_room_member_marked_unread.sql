-- Add marked_unread flag to room_members for personal reminder without affecting read receipts
ALTER TABLE room_members
    ADD COLUMN marked_unread BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX ix_room_members_user_marked_unread
    ON room_members (user_id, marked_unread)
    WHERE marked_unread = TRUE;
