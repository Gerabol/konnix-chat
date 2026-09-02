-- V22: Ajustar tipos de salas existentes no banco
UPDATE rooms SET type = 'CHANNEL', read_only = true WHERE name = 'bug-reports';
UPDATE rooms SET type = 'PUBLIC_GROUP' WHERE type = 'CHANNEL' AND name != 'bug-reports';
