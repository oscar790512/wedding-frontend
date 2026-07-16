import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildCancelArrivalPayload } from '../src/utils/checkin.js'

describe('check-in helpers', () => {
  it('clears actual attendance counts when arrival is cancelled', () => {
    assert.deepEqual(buildCancelArrivalPayload(), {
      is_arrived: false,
      actual_adults: null,
      actual_children: null,
    })
  })
})
