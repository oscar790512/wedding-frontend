import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildFloorTableRows,
  canAssignGuestToTable,
  chairStyle,
  guestAttendeeCount,
  remainingSeats,
  tableCapacityErrorMessage,
} from '../src/utils/tablePlan.js'

describe('table planning helpers', () => {
  it('uses planned RSVP counts for seat planning even when actual counts exist', () => {
    assert.equal(
      guestAttendeeCount({
        total_adults: 4,
        total_children: 2,
        actual_adults: 2,
        actual_children: 1,
      }),
      6,
    )
  })

  it('rejects assigning a guest when the table has insufficient remaining seats', () => {
    const guest = guestRecord({
      id: 'guest-2',
      name: 'Two Seat Guest',
      total_adults: 2,
    })
    const table = {
      name: '第 1 桌',
      capacity: 12,
      guests: [
        guestRecord({
          id: 'guest-1',
          name: 'Already Seated',
          total_adults: 11,
          allocated_table: '第 1 桌',
        }),
      ],
    }

    assert.equal(remainingSeats(table), 1)
    assert.equal(canAssignGuestToTable(guest, table), false)
    assert.equal(
      tableCapacityErrorMessage(guest, table),
      '第 1 桌 剩餘 1 位，無法加入 Two Seat Guest（2 位）。',
    )
  })

  it('allows keeping a guest on the same over-capacity table so they can be moved away later', () => {
    const guest = guestRecord({
      id: 'guest-2',
      name: 'Two Seat Guest',
      total_adults: 2,
      allocated_table: '第 1 桌',
    })
    const table = {
      name: '第 1 桌',
      capacity: 12,
      guests: [
        guestRecord({
          id: 'guest-1',
          total_adults: 11,
          allocated_table: '第 1 桌',
        }),
        guest,
      ],
    }

    assert.equal(canAssignGuestToTable(guest, table), true)
  })

  it('builds floor table rows with the main table excluded from automatic rows', () => {
    const rows = buildFloorTableRows(
      [
        { name: '主桌' },
        { name: '第 1 桌' },
        { name: '第 2 桌' },
        { name: '第 3 桌' },
        { name: '第 4 桌' },
        { name: '第 5 桌' },
        { name: '第 6 桌' },
      ],
      '主桌',
    )

    assert.deepEqual(rows, [
      {
        id: 'table-row-0',
        variant: 'two',
        leftTables: [{ name: '第 1 桌' }],
        rightTables: [{ name: '第 2 桌' }],
      },
      {
        id: 'table-row-1',
        variant: 'four',
        leftTables: [{ name: '第 3 桌' }, { name: '第 4 桌' }],
        rightTables: [{ name: '第 5 桌' }, { name: '第 6 桌' }],
      },
    ])
  })

  it('positions chairs evenly around a round table', () => {
    assert.deepEqual(chairStyle(1, 4), {
      transform: 'rotate(0deg) translate(var(--chair-radius)) rotate(0deg)',
    })
  })
})

function guestRecord(overrides = {}) {
  return {
    id: 'guest',
    name: 'Guest',
    status: 'attend',
    total_adults: 1,
    total_children: 0,
    actual_adults: null,
    actual_children: null,
    allocated_table: null,
    ...overrides,
  }
}
