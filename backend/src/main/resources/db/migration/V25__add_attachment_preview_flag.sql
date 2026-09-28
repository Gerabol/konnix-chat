-- Keep generated previews stored without presenting them as separate message attachments.
ALTER TABLE attachments ADD COLUMN is_preview BOOLEAN NOT NULL DEFAULT FALSE;
