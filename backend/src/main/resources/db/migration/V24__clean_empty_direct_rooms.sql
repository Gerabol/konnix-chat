-- V24: Remove empty direct rooms that have no active messages
DELETE FROM room_members
WHERE room_id IN (
    SELECT r.id
    FROM rooms r
    WHERE r.type = 'DIRECT'
      AND NOT EXISTS (
          SELECT 1 FROM messages m WHERE m.room_id = r.id AND m.deleted_at IS NULL
      )
);

DELETE FROM rooms
WHERE type = 'DIRECT'
  AND NOT EXISTS (
      SELECT 1 FROM messages m WHERE m.room_id = rooms.id AND m.deleted_at IS NULL
  );
