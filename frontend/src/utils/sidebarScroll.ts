export function shouldAnchorSidebar(previous: string, next: string, desktop: boolean): boolean {
  return desktop && ((previous === 'all' && next === 'recent') || (previous === 'recent' && next === 'all'))
}

export function sidebarScrollOffset(
  scrollHeight: number,
  clientHeight: number,
  viewportTop: number,
  viewportBottom: number,
  itemTop: number,
  itemBottom: number,
): number {
  if (scrollHeight <= clientHeight) return 0
  if (itemTop < viewportTop) return itemTop - viewportTop
  if (itemBottom > viewportBottom) return itemBottom - viewportBottom
  return 0
}
