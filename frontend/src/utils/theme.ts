import type { Theme } from '../api'

export const THEME_OPTIONS: { id: Theme; label: string; colors: string[] }[] = [
  { id: 'DEFAULT', label: 'Padrão', colors: ['#f7f8fc', '#ffffff', '#5b4cf0', '#22c7d6'] },
  { id: 'PINK', label: 'Rosa', colors: ['#FFF8FB', '#FDEEF5', '#E84D8A', '#FFFFFF'] },
  { id: 'GREEN', label: 'Verde', colors: ['#F5FBF7', '#EAF6EE', '#1FA463', '#FFFFFF'] },
  { id: 'RED', label: 'Vermelho', colors: ['#FFF7F7', '#FDECEC', '#D94141', '#FFFFFF'] },
  { id: 'DEFAULT_STRONG', label: 'Padrão Forte', colors: ['#F7F8FC', '#5B4CF0', '#7C70F5', '#FFFFFF'] },
  { id: 'PINK_STRONG', label: 'Rosa Forte', colors: ['#FFF8FB', '#D93E7C', '#F0629B', '#FFFFFF'] },
  { id: 'GREEN_STRONG', label: 'Verde Forte', colors: ['#F5FBF7', '#188A53', '#27B56E', '#FFFFFF'] },
  { id: 'RED_STRONG', label: 'Vermelho Forte', colors: ['#FFF7F7', '#C83232', '#E15353', '#FFFFFF'] },
  { id: 'DARK', label: 'Dark clássico', colors: ['#121212', '#18181B', '#7C5CFF', '#23232A'] },
  { id: 'BLACK_GRAY', label: 'Cinza e preto', colors: ['#0F1115', '#161A20', '#4F7CFF', '#1E232B'] },
  { id: 'PINK_BLACK', label: 'Rosa Black', colors: ['#140F13', '#241923', '#F05A9D', '#DDB5C9'] },
  { id: 'GREEN_BLACK', label: 'Verde Black', colors: ['#0F1411', '#19221D', '#25BD70', '#A6C3B1'] },
  { id: 'RED_BLACK', label: 'Vermelho Black', colors: ['#150E0E', '#251818', '#F05B5B', '#E0B1B1'] },
]

export const THEME_CACHE_KEY = 'konnix-theme-cache'
export const THEME_COOKIE_KEY = 'konnix_theme'

export function normalizeTheme(theme: string | null | undefined): Theme {
  const normalized = theme?.trim().replace(/-/g, '_').toUpperCase()
  return THEME_OPTIONS.some((option) => option.id === normalized) ? (normalized as Theme) : 'DEFAULT'
}

export function isDarkTheme(theme: Theme): boolean {
  return theme === 'DARK' || theme === 'BLACK_GRAY' || theme.endsWith('_BLACK')
}

export function isWhiteSidebarLogoTheme(theme: Theme): boolean {
  return theme === 'DARK' || theme === 'BLACK_GRAY' || theme.endsWith('_BLACK') || theme.endsWith('_STRONG')
}

export function readThemeCookie(): Theme | null {
  const value = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${THEME_COOKIE_KEY}=`))
    ?.split('=')
    .slice(1)
    .join('=')
  if (!value) return null
  const normalized = normalizeTheme(decodeURIComponent(value))
  return normalized === 'DEFAULT' && decodeURIComponent(value).trim().toUpperCase() !== 'DEFAULT' ? null : normalized
}

export function writeThemeCookie(theme: string | null | undefined): void {
  const normalized = normalizeTheme(theme)
  const cookieValue = normalized.toLowerCase().replace(/_/g, '-')
  document.cookie = `${THEME_COOKIE_KEY}=${encodeURIComponent(cookieValue)}; Max-Age=31536000; Path=/; SameSite=Lax`
}

export function applyCookieThemeEarly(): void {
  const theme = readThemeCookie()
  if (theme) applyTheme(theme)
}

export function applyTheme(theme: string | null | undefined): void {
  const normalized = normalizeTheme(theme)
  const attribute = normalized === 'DEFAULT' ? '' : normalized.toLowerCase().replace('_', '-')
  if (attribute) document.documentElement.dataset.theme = attribute
  else delete document.documentElement.dataset.theme
}

export function cachedTheme(): Theme {
  try {
    return normalizeTheme(localStorage.getItem(THEME_CACHE_KEY))
  } catch {
    return 'DEFAULT'
  }
}

export function cacheTheme(theme: string | null | undefined): void {
  const normalized = normalizeTheme(theme)
  try {
    localStorage.setItem(THEME_CACHE_KEY, normalized)
  } catch {
    /* cache opcional */
  }
  writeThemeCookie(normalized)
  window.dispatchEvent(new CustomEvent('konnix:theme-changed', { detail: normalized }))
}

export function clearCachedTheme(): void {
  try {
    localStorage.removeItem(THEME_CACHE_KEY)
  } catch {
    /* cache opcional */
  }
}
