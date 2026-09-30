import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  WEEKDAYS,
  formatDay,
  formatFullTimestamp,
  formatWeekday,
} from '../api.ts'

test('WEEKDAYS contains 7 Portuguese day abbreviations', () => {
  assert.deepEqual(WEEKDAYS, ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'])
})

test('formatWeekday maps days correctly across the entire week', () => {
  // 2026-09-27 is Sunday (dom)
  assert.equal(formatWeekday('2026-09-27T12:00:00Z'), 'dom')
  // 2026-09-28 is Monday (seg)
  assert.equal(formatWeekday('2026-09-28T12:00:00Z'), 'seg')
  // 2026-09-29 is Tuesday (ter)
  assert.equal(formatWeekday('2026-09-29T12:00:00Z'), 'ter')
  // 2026-09-30 is Wednesday (qua)
  assert.equal(formatWeekday('2026-09-30T12:00:00Z'), 'qua')
  // 2026-10-01 is Thursday (qui)
  assert.equal(formatWeekday('2026-10-01T12:00:00Z'), 'qui')
  // 2026-10-02 is Friday (sex)
  assert.equal(formatWeekday('2026-10-02T12:00:00Z'), 'sex')
  // 2026-10-03 is Saturday (sáb)
  assert.equal(formatWeekday('2026-10-03T12:00:00Z'), 'sáb')
})

test('formatWeekday handles invalid date strings gracefully', () => {
  assert.equal(formatWeekday('invalid-date'), '')
  assert.equal(formatWeekday(''), '')
})

test('formatDay outputs "hoje, dd/mm/aaaa" for messages from today', () => {
  const now = new Date()
  const todayDateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  assert.equal(formatDay(now.toISOString()), `hoje, ${todayDateStr}`)
})

test('formatDay outputs "dia, dd/mm/aaaa" for previous days', () => {
  // A fixed date in the past
  const past = '2024-05-06T15:30:00Z' // 2024-05-06 was Monday (seg)
  const d = new Date(past)
  const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  assert.equal(formatDay(past), `seg, ${dateStr}`)
})

test('formatDay handles invalid dates gracefully', () => {
  assert.equal(formatDay('invalid'), '')
})

test('formatFullTimestamp outputs full weekday, date and time', () => {
  const past = '2024-05-06T15:30:00Z'
  const d = new Date(past)
  const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  assert.equal(formatFullTimestamp(past), `seg, ${dateStr} às ${timeStr}`)
})
