export type PwaPlatform = 'ios' | 'android' | 'desktop'

export function detectPlatform(): PwaPlatform {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios'
  }
  if (/android/.test(ua)) {
    return 'android'
  }
  return 'desktop'
}

export function isMobilePlatform(): boolean {
  const platform = detectPlatform()
  return platform === 'ios' || platform === 'android'
}

export function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const modes = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']
  return (
    modes.some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches) ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

type RelatedApp = { id?: string; platform: string; url?: string }

export async function detectInstalledWebApp(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<RelatedApp[]> }
  if (typeof nav.getInstalledRelatedApps !== 'function') return false
  try {
    const apps = await nav.getInstalledRelatedApps()
    return apps.some((app) => app.platform === 'webapp')
  } catch {
    return false
  }
}

const PWA_INSTALLED_KEY = 'konnix_app_installed'
const PWA_CARD_DISMISSED_KEY = 'konnix_pwa_card_dismissed'

export function readAppInstalledFlag(): boolean {
  try {
    return window.localStorage.getItem(PWA_INSTALLED_KEY) === '1'
  } catch {
    return false
  }
}

export function persistAppInstalledFlag(): void {
  try {
    window.localStorage.setItem(PWA_INSTALLED_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function clearAppInstalledFlag(): void {
  try {
    window.localStorage.removeItem(PWA_INSTALLED_KEY)
  } catch {
    /* ignore */
  }
}

export function readPwaCardDismissed(): boolean {
  try {
    return window.localStorage.getItem(PWA_CARD_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function persistPwaCardDismissed(): void {
  try {
    window.localStorage.setItem(PWA_CARD_DISMISSED_KEY, '1')
  } catch {
    /* ignore */
  }
}
