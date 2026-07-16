export function buildCancelArrivalPayload() {
  return {
    is_arrived: false,
    actual_adults: null,
    actual_children: null,
  }
}

export function phoneLastThreeDigits(phone) {
  const digits = String(phone || '').replace(/[^\d]/g, '')
  return digits.slice(-3)
}

export function checkMark(value) {
  return value ? '☑' : '☐'
}

export function actualOrPlannedCount(guest, actualField, plannedField) {
  return Number(guest[actualField] ?? guest[plannedField] ?? 0)
}

export function exportGiftAmount(guest) {
  const amount = Number(guest.gift_amount || 0)
  return amount > 0 ? amount : ''
}

export function buildCheckinExportRow(guest) {
  return {
    桌號: guest.allocated_table || '未分桌',
    姓名: guest.name || '',
    與新人關係: guest.guest_category || '未分類',
    'RSVP 大人': Number(guest.total_adults || 0),
    'RSVP 小孩': Number(guest.total_children || 0),
    實到大人: actualOrPlannedCount(guest, 'actual_adults', 'total_adults'),
    實到小孩: actualOrPlannedCount(guest, 'actual_children', 'total_children'),
    現場簽到: checkMark(guest.is_arrived),
    喜餅領取: checkMark(guest.cake_status === 'pickup'),
    禮金: exportGiftAmount(guest),
    備註: guest.admin_notes || '',
    電話後三碼: phoneLastThreeDigits(guest.phone),
  }
}
