import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildFloorTableColumns,
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

  it('builds floor table columns from explicit column counts', () => {
    const columns = buildFloorTableColumns(
      [
        { name: '主桌' },
        { name: '第 1 桌' },
        { name: '第 2 桌' },
        { name: '第 3 桌' },
        { name: '第 4 桌' },
        { name: '第 5 桌' },
        { name: '第 6 桌' },
        { name: '第 7 桌' },
        { name: '第 8 桌' },
      ],
      '主桌',
      [2, 2, 2, 2],
    )

    assert.deepEqual(columns, [
      {
        id: 'table-column-0',
        tables: [{ name: '第 1 桌' }, { name: '第 2 桌' }],
      },
      {
        id: 'table-column-1',
        tables: [{ name: '第 3 桌' }, { name: '第 4 桌' }],
      },
      {
        id: 'table-column-2',
        tables: [{ name: '第 5 桌' }, { name: '第 6 桌' }],
      },
      {
        id: 'table-column-3',
        tables: [{ name: '第 7 桌' }, { name: '第 8 桌' }],
      },
    ])
  })

  it('appends overflow tables to the fourth floor column', () => {
    const tables = [{ name: '主桌' }]

    for (let index = 1; index <= 23; index += 1) {
      tables.push({ name: `第 ${index} 桌` })
    }

    const columns = buildFloorTableColumns(tables, '主桌', [6, 6, 5, 4])

    assert.equal(columns.length, 4)
    assert.deepEqual(
      columns.map((column) => column.tables.length),
      [6, 6, 5, 6],
    )
    assert.deepEqual(columns[3].tables.at(-1), { name: '第 23 桌' })
    assert.equal(
      columns.reduce(
        (count, column) => count + column.tables.length,
        0,
      ),
      23,
    )
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
