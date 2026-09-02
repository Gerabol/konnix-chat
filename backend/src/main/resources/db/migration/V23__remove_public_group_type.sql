-- V23: Eliminar tipo PUBLIC_GROUP -- todos os grupos publicos passam a ser PRIVATE_GROUP
UPDATE rooms SET type = 'PRIVATE_GROUP' WHERE type = 'PUBLIC_GROUP';
