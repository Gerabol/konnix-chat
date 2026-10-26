# Simplificação dos Tipos de Sala: Apenas Grupos e Canais

## Objetivo

Reduzir os tipos de sala de três para dois:
- **`CHANNEL`** — canal somente leitura, criado por admin, ícone `#`. Lógica permanece idêntica.
- **`PRIVATE_GROUP`** — grupo padrão (renomeado visualmente para simplesmente "Grupo"), privado por definição. Todos os `PUBLIC_GROUP` existentes migram para `PRIVATE_GROUP`.

O tipo `PUBLIC_GROUP` é eliminado completamente do sistema.

---

## Proposed Changes

### Backend

#### [MODIFY] [CreateRoomRequest.java](file:///c:/Users/cge/Documents/GitHub/konnix-chat/backend/src/main/java/br/gov/pb/cge/konnix/api/room/dto/CreateRoomRequest.java)
- Regex `@Pattern` volta a `CHANNEL|PRIVATE_GROUP` (remove `PUBLIC_GROUP`).
- Mensagem de erro atualizada.

#### [MODIFY] [RoomService.java](file:///c:/Users/cge/Documents/GitHub/konnix-chat/backend/src/main/java/br/gov/pb/cge/konnix/service/RoomService.java)
- Remover constante `TYPE_PUBLIC_GROUP`.
- Todos os usos de `TYPE_PUBLIC_GROUP` substituídos por `TYPE_PRIVATE_GROUP`.
- `adminList()`: lista apenas `CHANNEL` e `PRIVATE_GROUP`.
- `requireAdminRoom()`, `requireCanManage()`: lógica simplificada sem `PUBLIC_GROUP`.

---

### Banco de Dados

#### [NEW] `V23__remove_public_group_type.sql`
```sql
-- V23: Migrar PUBLIC_GROUP para PRIVATE_GROUP
UPDATE rooms SET type = 'PRIVATE_GROUP' WHERE type = 'PUBLIC_GROUP';
```

> [!NOTE]
> A V22 já existe e rodou corretamente. A V23 garante que qualquer sala `PUBLIC_GROUP` criada entre as duas sessões também será migrada.

---

### Frontend

#### [MODIFY] [api.ts](file:///c:/Users/cge/Documents/GitHub/konnix-chat/frontend/src/api.ts)
- Tipo `Room.type`: remover `'PUBLIC_GROUP'`, manter `'CHANNEL' | 'PRIVATE_GROUP' | 'DIRECT'`.

#### [MODIFY] [App.tsx](file:///c:/Users/cge/Documents/GitHub/konnix-chat/frontend/src/App.tsx)
- `ROOM_ICON`: remover entrada `PUBLIC_GROUP`.
- `roomSubtitle()`: `PRIVATE_GROUP` → `"Grupo"` (sem "privado").
- `NewRoomModal`: o select some completamente — usuário sempre cria `PRIVATE_GROUP`. Canais permanecem exclusivos do admin.
- `canWriteInRoom`: sem referência a `PUBLIC_GROUP` (já está correto, checa `room.readOnly`).
- Remoção de qualquer outro `PUBLIC_GROUP` residual.

#### [MODIFY] [AdminView.tsx](file:///c:/Users/cge/Documents/GitHub/konnix-chat/frontend/src/AdminView.tsx)
- `CreateChannelModal` e `RoomsPanel`: remover referências a `PUBLIC_GROUP`.
- Ícone/rótulo de grupos: `👥` → pode manter ou usar `🔒`, padronizar como "Grupo".

---

## Verification Plan

### Automated Tests
```
node node_modules/typescript/bin/tsc --noEmit   # no frontend/
```

### Manual Verification
- Criar um grupo como usuário comum → deve criar `PRIVATE_GROUP` sem perguntar o tipo.
- Verificar que grupos antigos (ex-`PUBLIC_GROUP`) aparecem como "Grupo" na sidebar.
- Verificar que canais (`CHANNEL`) continuam com `#`, badge "Somente leitura" e sem caixa de texto.
- No painel admin, confirmar que nenhuma sala aparece como `PUBLIC_GROUP`.
