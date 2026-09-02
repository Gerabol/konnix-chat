export function RoleBadge({ type }: { type: 'owner' | 'admin' }) {
  return (
    <span className={`role-badge ${type}`}>{type === 'owner' ? 'Proprietário' : 'Admin'}</span>
  )
}
