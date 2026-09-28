import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  PREMIERE_DATES,
  PREMIERE_ENTRY_LOCK_SECONDS,
  formatCountdown,
  hasSeenPremiere,
  isPremiereDate,
  isTimelineJump,
  markPremiereSeen,
  premiereDateKey,
  shouldRememberPremiereExit,
  shouldShowPremiere,
} from './premiere.ts'

describe('premiere utils', () => {
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
    // premiere.ts usa o global localStorage direto, então o mock precisa
    // substituir o global — window.localStorage não é o suficiente no Node.
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => storage,
    })
    const windowObj = {
      localStorage: storage,
    }
    ;(globalThis as unknown as { window: unknown }).window = windowObj
  })

  describe('premiereDateKey', () => {
    it('returns São Paulo date for UTC time that is still the previous day in BRT', () => {
      // 2026-09-28T02:30:00Z = 2026-09-27T23:30:00 BRT (UTC-3)
      const date = new Date('2026-09-28T02:30:00Z')
      assert.strictEqual(premiereDateKey(date), '2026-09-27')
    })

    it('formats single-digit month and day with leading zeros', () => {
      const date = new Date('2026-09-05T12:00:00Z')
      assert.strictEqual(premiereDateKey(date), '2026-09-05')
    })

    it('handles the day boundary transition at midnight São Paulo time', () => {
      // 02:59:59Z = 23:59:59 BRT on the 26th
      const before = new Date('2026-09-27T02:59:59Z')
      assert.strictEqual(premiereDateKey(before), '2026-09-26')

      // 03:00:00Z = 00:00:00 BRT on the 27th
      const after = new Date('2026-09-27T03:00:00Z')
      assert.strictEqual(premiereDateKey(after), '2026-09-27')
    })
  })

  describe('isPremiereDate', () => {
    it('returns true on 2026-09-27', () => {
      assert.strictEqual(isPremiereDate(new Date('2026-09-27T12:00:00Z')), true)
    })

    it('returns true on 2026-09-28', () => {
      assert.strictEqual(isPremiereDate(new Date('2026-09-28T12:00:00Z')), true)
    })

    it('returns false on 2026-09-26', () => {
      assert.strictEqual(isPremiereDate(new Date('2026-09-26T12:00:00Z')), false)
    })

    it('returns false on 2026-09-29', () => {
      assert.strictEqual(isPremiereDate(new Date('2026-09-29T12:00:00Z')), false)
    })

    it('returns true just before midnight BRT on 2026-09-29', () => {
      // 02:59:00Z on Sep 29 = 23:59 BRT on Sep 28 — still premiere
      assert.strictEqual(isPremiereDate(new Date('2026-09-29T02:59:00Z')), true)
    })

    it('returns false at midnight BRT on 2026-09-29', () => {
      // 03:00:00Z on Sep 29 = 00:00 BRT on Sep 29 — no longer premiere
      assert.strictEqual(isPremiereDate(new Date('2026-09-29T03:00:00Z')), false)
    })

    it('PREMIERE_DATES is exactly [2026-09-27, 2026-09-28]', () => {
      assert.deepStrictEqual([...PREMIERE_DATES], ['2026-09-27', '2026-09-28'])
    })
  })

  describe('hasSeenPremiere / markPremiereSeen', () => {
    it('returns false before marking, true after marking on the same day', () => {
      const now = new Date('2026-09-27T12:00:00Z')
      assert.strictEqual(hasSeenPremiere(now), false)
      markPremiereSeen(now)
      assert.strictEqual(hasSeenPremiere(now), true)
    })

    it('marking on the 27th does not block the 28th', () => {
      const day27 = new Date('2026-09-27T12:00:00Z')
      const day28 = new Date('2026-09-28T12:00:00Z')
      markPremiereSeen(day27)
      assert.strictEqual(hasSeenPremiere(day27), true)
      assert.strictEqual(hasSeenPremiere(day28), false)
    })
  })

  describe('shouldShowPremiere', () => {
    it('returns true on premiere date without marking', () => {
      const now = new Date('2026-09-27T12:00:00Z')
      assert.strictEqual(shouldShowPremiere(now), true)
    })

    it('returns false on the same day after watching', () => {
      const now = new Date('2026-09-27T12:00:00Z')
      markPremiereSeen(now)
      assert.strictEqual(shouldShowPremiere(now), false)
    })

    it('returns true on the next day even with previous day marking', () => {
      const day27 = new Date('2026-09-27T12:00:00Z')
      const day28 = new Date('2026-09-28T12:00:00Z')
      markPremiereSeen(day27)
      assert.strictEqual(shouldShowPremiere(day28), true)
    })

    it('returns false outside the window without marking', () => {
      const now = new Date('2026-09-29T12:00:00Z')
      assert.strictEqual(shouldShowPremiere(now), false)
    })

    it('returns true when localStorage throws (prioritizes showing)', () => {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
          throw new Error('SecurityError')
        },
      })
      ;(globalThis as unknown as { window: unknown }).window = {
        get localStorage() {
          throw new Error('SecurityError')
        },
      }
      const now = new Date('2026-09-27T12:00:00Z')
      assert.strictEqual(shouldShowPremiere(now), true)
    })

    it('stores only the date, without id, name, or email', () => {
      const now = new Date('2026-09-27T12:00:00Z')
      markPremiereSeen(now)
      const stored = mockStorage['konnix-premiere-watched']
      assert.strictEqual(stored, '2026-09-27')
      assert.ok(!stored.includes('@'))
      assert.ok(!stored.includes('id'))
    })
  })

  describe('shouldRememberPremiereExit', () => {
    it('returns true for watched', () => {
      assert.strictEqual(shouldRememberPremiereExit('watched'), true)
    })

    it('returns true for skipped', () => {
      assert.strictEqual(shouldRememberPremiereExit('skipped'), true)
    })

    it('returns false for failed (does not mark as seen)', () => {
      assert.strictEqual(shouldRememberPremiereExit('failed'), false)
    })
  })

  describe('formatCountdown', () => {
    it('formats 300 as 05:00', () => {
      assert.strictEqual(formatCountdown(300), '05:00')
    })

    it('formats 299 as 04:59', () => {
      assert.strictEqual(formatCountdown(299), '04:59')
    })

    it('formats 61 as 01:01', () => {
      assert.strictEqual(formatCountdown(61), '01:01')
    })

    it('formats 1 as 00:01', () => {
      assert.strictEqual(formatCountdown(1), '00:01')
    })

    it('formats 0 as 00:00', () => {
      assert.strictEqual(formatCountdown(0), '00:00')
    })

    it('clamps negative values to 00:00', () => {
      assert.strictEqual(formatCountdown(-10), '00:00')
    })

    it('formats 5999 as 99:59', () => {
      assert.strictEqual(formatCountdown(5999), '99:59')
    })

    it('floors fractional seconds from timer', () => {
      assert.strictEqual(formatCountdown(299.7), '04:59')
    })
  })

  describe('PREMIERE_ENTRY_LOCK_SECONDS', () => {
    it('locks entry for only 10 seconds', () => {
      assert.strictEqual(PREMIERE_ENTRY_LOCK_SECONDS, 10)
    })

    it('renders as a 00:10 countdown on the skip button', () => {
      assert.strictEqual(formatCountdown(PREMIERE_ENTRY_LOCK_SECONDS), '00:10')
      assert.strictEqual(formatCountdown(PREMIERE_ENTRY_LOCK_SECONDS - 1), '00:09')
    })
  })

  describe('isTimelineJump', () => {
    it('returns false for the first measurement (primed=false)', () => {
      assert.strictEqual(isTimelineJump(5, 0, 100, false), false)
    })

    it('returns false for normal playback advance', () => {
      assert.strictEqual(isTimelineJump(31, 30, 1000, true), false)
    })

    it('returns false for buffering within 2 seconds tolerance', () => {
      assert.strictEqual(isTimelineJump(31.9, 30, 1000, true), false)
    })

    it('returns true for a large drag forward', () => {
      assert.strictEqual(isTimelineJump(95, 30, 1000, true), true)
    })

    it('returns true for keyboard forward key (5 second jump)', () => {
      assert.strictEqual(isTimelineJump(35, 30, 1000, true), true)
    })

    it('returns false for background tab with 61 second gap (throttle)', () => {
      assert.strictEqual(isTimelineJump(90, 30, 61_000, true), false)
    })
  })
})
