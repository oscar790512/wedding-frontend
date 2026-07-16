import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildCheckinExportRow,
  buildCancelArrivalPayload,
  phoneLastThreeDigits,
} from '../src/utils/checkin.js'

describe('check-in helpers', () => {
  it('clears actual attendance counts when arrival is cancelled', () => {
    assert.deepEqual(buildCancelArrivalPayload(), {
      is_arrived: false,
      actual_adults: null,
      actual_children: null,
    })
  })

  it('formats phone last three digits from punctuated phone numbers', () => {
    assert.equal(phoneLastThreeDigits('0912-345-678'), '678')
    assert.equal(phoneLastThreeDigits('(02) 2345-6789'), '789')
  })

  it('exports the current check-in, cake, gift, actual count, and notes state', () => {
    assert.deepEqual(
      buildCheckinExportRow({
        allocated_table: '第 3 桌',
        name: '王小明',
        guest_category: '男方朋友/同學',
        total_adults: 2,
        total_children: 1,
        actual_adults: 1,
        actual_children: 0,
        is_arrived: true,
        cake_status: 'pickup',
        gift_amount: 3600,
        admin_notes: '已收禮',
        phone: '0912-345-678',
      }),
      {
        桌號: '第 3 桌',
        姓名: '王小明',
        與新人關係: '男方朋友/同學',
        'RSVP 大人': 2,
        'RSVP 小孩': 1,
        實到大人: 1,
        實到小孩: 0,
        現場簽到: '☑',
        喜餅領取: '☑',
        禮金: 3600,
        備註: '已收禮',
        電話後三碼: '678',
      },
    )
  })

  it('exports unchecked boxes and planned counts when on-site fields are not filled yet', () => {
    const row = buildCheckinExportRow({
      name: '陳小美',
      total_adults: 2,
      total_children: 0,
      actual_adults: null,
      actual_children: null,
      is_arrived: false,
      cake_status: 'pending_pickup',
      gift_amount: 0,
      phone: '',
    })

    assert.equal(row.實到大人, 2)
    assert.equal(row.實到小孩, 0)
    assert.equal(row.現場簽到, '☐')
    assert.equal(row.喜餅領取, '☐')
    assert.equal(row.禮金, '')
    assert.equal(row.備註, '')
    assert.equal(row.電話後三碼, '')
  })
})
