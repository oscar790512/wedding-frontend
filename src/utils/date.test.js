import assert from 'node:assert/strict'
import test from 'node:test'

import { formatWeddingDate } from './date.js'

test('formats an RSVP deadline without a timezone date shift', () => {
  assert.equal(formatWeddingDate('2026-10-04'), '2026年10月4日 星期日')
})

test('returns an empty label when the deadline is not configured', () => {
  assert.equal(formatWeddingDate(''), '')
})
