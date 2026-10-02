-- Add hidden column to rooms table
ALTER TABLE rooms ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;
