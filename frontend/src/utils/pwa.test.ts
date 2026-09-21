import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  clearAppInstalledFlag,
  detectInstalledWebApp,
  detectPlatform,
  detectStandalone,
  isMobilePlatform,
  persistAppInstalledFlag,
  persistPwaCardDismissed,
  readAppInstalledFlag,
  readPwaCardDismissed,
} from './pwa.ts'

describe('pwa utils', () => {
  let mockStorage: Record<string, string> = {}

  beforeEach(() => {
    mockStorage = {}
    const storage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value
      },
      removeItem: (key: string) => {
        delete mockStorage[key]
      },
      clear: () => {
        mockStorage = {}
      },
      key: () => null,
      length: 0,
    } as unknown as Storage
    const windowObj = {
      localStorage: storage,
      matchMedia: () => ({ matches: false }),
    }
    ;(globalThis as unknown as { window: unknown }).window = windowObj
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: '',
        platform: '',
        maxTouchPoints: 0,
        standalone: false,
      },
      configurable: true,
      writable: true,
    })
  })

  describe('detectPlatform & isMobilePlatform', () => {
    it('detects iOS for iPhone userAgent', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
          platform: 'iPhone',
          maxTouchPoints: 5,
        },
        configurable: true,
        writable: true,
      })
      assert.strictEqual(detectPlatform(), 'ios')
      assert.strictEqual(isMobilePlatform(), true)
    })

    it('detects iOS for iPad on modern Safari (MacIntel + touch)', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          platform: 'MacIntel',
          maxTouchPoints: 5,
        },
        configurable: true,
        writable: true,
      })
      assert.strictEqual(detectPlatform(), 'ios')
      assert.strictEqual(isMobilePlatform(), true)
    })

    it('detects Android for Android userAgent', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
          platform: 'Linux armv8l',
          maxTouchPoints: 5,
        },
        configurable: true,
        writable: true,
      })
      assert.strictEqual(detectPlatform(), 'android')
      assert.strictEqual(isMobilePlatform(), true)
    })

    it('detects desktop for macOS without touch', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          platform: 'MacIntel',
          maxTouchPoints: 0,
        },
        configurable: true,
        writable: true,
      })
      assert.strictEqual(detectPlatform(), 'desktop')
      assert.strictEqual(isMobilePlatform(), false)
    })

    it('detects desktop for Windows PC', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          platform: 'Win32',
          maxTouchPoints: 0,
        },
        configurable: true,
        writable: true,
      })
      assert.strictEqual(detectPlatform(), 'desktop')
      assert.strictEqual(isMobilePlatform(), false)
    })
  })

  describe('detectStandalone', () => {
    it('returns true when display-mode matches standalone', () => {
      ;(globalThis as unknown as { window: unknown }).window = {
        matchMedia: (query: string) => ({
          matches: query === '(display-mode: standalone)',
        }),
      }
      assert.strictEqual(detectStandalone(), true)
    })

    it('returns true when navigator.standalone is true (iOS legacy PWA)', () => {
      ;(globalThis as unknown as { window: unknown }).window = {
        matchMedia: () => ({ matches: false }),
      }
      Object.defineProperty(globalThis, 'navigator', {
        value: { standalone: true, maxTouchPoints: 1, userAgent: 'iPhone' },
        configurable: true,
        writable: true,
      })
      assert.strictEqual(detectStandalone(), true)
    })

    it('returns true when display-mode matches fullscreen, minimal-ui, or window-controls-overlay', () => {
      for (const mode of ['fullscreen', 'minimal-ui', 'window-controls-overlay']) {
        ;(globalThis as unknown as { window: unknown }).window = {
          matchMedia: (query: string) => ({
            matches: query === `(display-mode: ${mode})`,
          }),
        }
        assert.strictEqual(detectStandalone(), true, `Failed for mode ${mode}`)
      }
    })

    it('returns false when display-mode is picture-in-picture', () => {
      ;(globalThis as unknown as { window: unknown }).window = {
        matchMedia: (query: string) => ({
          matches: query === '(display-mode: picture-in-picture)',
        }),
      }
      assert.strictEqual(detectStandalone(), false)
    })

    it('returns false when browser is standard tab', () => {
      ;(globalThis as unknown as { window: unknown }).window = {
        matchMedia: () => ({ matches: false }),
      }
      Object.defineProperty(globalThis, 'navigator', {
        value: { standalone: false, maxTouchPoints: 0, userAgent: 'Chrome' },
        configurable: true,
        writable: true,
      })
      assert.strictEqual(detectStandalone(), false)
    })
  })

  describe('detectInstalledWebApp', () => {
    it('returns true when getInstalledRelatedApps includes webapp', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          getInstalledRelatedApps: async () => [{ platform: 'webapp', url: '/manifest.webmanifest' }],
        },
        configurable: true,
        writable: true,
      })
      const result = await detectInstalledWebApp()
      assert.strictEqual(result, true)
    })

    it('returns false when getInstalledRelatedApps returns empty array', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          getInstalledRelatedApps: async () => [],
        },
        configurable: true,
        writable: true,
      })
      const result = await detectInstalledWebApp()
      assert.strictEqual(result, false)
    })

    it('returns false when getInstalledRelatedApps throws an error', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          getInstalledRelatedApps: async () => {
            throw new Error('SecurityError')
          },
        },
        configurable: true,
        writable: true,
      })
      const result = await detectInstalledWebApp()
      assert.strictEqual(result, false)
    })

    it('returns false when getInstalledRelatedApps is not a function', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      })
      const result = await detectInstalledWebApp()
      assert.strictEqual(result, false)
    })
  })

  describe('localStorage persistence flags', () => {
    it('persists and reads app installed flag', () => {
      assert.strictEqual(readAppInstalledFlag(), false)
      persistAppInstalledFlag()
      assert.strictEqual(readAppInstalledFlag(), true)
      clearAppInstalledFlag()
      assert.strictEqual(readAppInstalledFlag(), false)
    })

    it('persists and reads pwa card dismissed flag', () => {
      assert.strictEqual(readPwaCardDismissed(), false)
      persistPwaCardDismissed()
      assert.strictEqual(readPwaCardDismissed(), true)
    })
  })
})
