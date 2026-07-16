import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildRsvpPayload,
  cakePhoneDisplayValue,
  cakeRecipientDisplayValue,
  normalizePhone,
} from '../src/utils/rsvpForm.js'

describe('RSVP form helpers', () => {
  it('shows the filler name and phone in cake shipping fields when same-as-filler is checked', () => {
    const form = baseForm({
      name: '王小明',
      phone: '0912-345-678',
      shipping_recipient: '',
      shipping_phone: '',
      use_cake_recipient_same: true,
      use_cake_phone_same: true,
    })

    assert.equal(cakeRecipientDisplayValue(form), '王小明')
    assert.equal(cakePhoneDisplayValue(form), '0912-345-678')
  })

  it('shows manual cake shipping fields when same-as-filler is unchecked', () => {
    const form = baseForm({
      name: '王小明',
      phone: '0912-345-678',
      shipping_recipient: '陳小美',
      shipping_phone: '02-2345-6789',
      use_cake_recipient_same: false,
      use_cake_phone_same: false,
    })

    assert.equal(cakeRecipientDisplayValue(form), '陳小美')
    assert.equal(cakePhoneDisplayValue(form), '02-2345-6789')
  })

  it('builds an explicit request-cake payload from same-as-filler selections', () => {
    const payload = buildRsvpPayload(
      baseForm({
        name: ' 王小明 ',
        phone: '0912-345-678',
        email: ' guest@example.com ',
        status: 'decline',
        decline_response: 'request_cake',
        shipping_address: ' 新北市板橋區 ',
        blessing_message: ' 恭喜 ',
        use_cake_recipient_same: true,
        use_cake_phone_same: true,
      }),
      '女方朋友/同學',
    )

    assert.equal(payload.phone, '0912345678')
    assert.equal(payload.guest_category, '女方朋友/同學')
    assert.equal(payload.shipping_recipient, '王小明')
    assert.equal(payload.shipping_phone, '0912345678')
    assert.equal(payload.shipping_address, '新北市板橋區')
    assert.equal(payload.blessing_message, '恭喜')
  })

  it('builds an explicit request-cake payload from manual shipping contact fields', () => {
    const payload = buildRsvpPayload(
      baseForm({
        name: '王小明',
        phone: '0912-345-678',
        status: 'decline',
        decline_response: 'request_cake',
        shipping_recipient: '陳小美',
        shipping_phone: '(02) 2345-6789',
        shipping_address: '台北市中山區',
        use_cake_recipient_same: false,
        use_cake_phone_same: false,
      }),
      '男方朋友/同學',
    )

    assert.equal(payload.shipping_recipient, '陳小美')
    assert.equal(payload.shipping_phone, '0223456789')
    assert.equal(payload.shipping_address, '台北市中山區')
  })

  it('clears cake shipping fields for non-cake RSVP payloads', () => {
    const payload = buildRsvpPayload(
      baseForm({
        status: 'attend',
        total_adults: 2,
        shipping_recipient: '陳小美',
        shipping_phone: '0912345678',
        shipping_address: '台北市中山區',
      }),
      '男方朋友/同學',
    )

    assert.equal(payload.decline_response, null)
    assert.equal(payload.shipping_recipient, null)
    assert.equal(payload.shipping_phone, null)
    assert.equal(payload.shipping_address, null)
  })

  it('normalizes phone punctuation out of submitted phone values', () => {
    assert.equal(normalizePhone('(02) 2345-6789'), '0223456789')
  })
})

function baseForm(overrides = {}) {
  return {
    name: '王小明',
    phone: '0912345678',
    email: '',
    relationship_side: '男方',
    relationship_type: '朋友/同學',
    status: 'attend',
    total_adults: 1,
    total_children: 0,
    need_vegetarian: false,
    vegetarian_count: 0,
    allergy_notes: '',
    child_seats: 0,
    diet_notes: '',
    need_invitation: false,
    invitation_address: '',
    decline_response: '',
    shipping_recipient: '',
    shipping_phone: '',
    shipping_address: '',
    use_cake_recipient_same: true,
    use_cake_phone_same: true,
    blessing_message: '',
    ...overrides,
  }
}
