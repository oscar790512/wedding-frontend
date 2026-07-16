export function guestAttendeeCount(guest) {
  return plannedAdults(guest) + plannedChildren(guest)
}

export function plannedAdults(guest) {
  return Number(guest.total_adults ?? 0)
}

export function plannedChildren(guest) {
  return Number(guest.total_children ?? 0)
}

export function tableAttendeeCount(guests) {
  return guests.reduce((sum, guest) => sum + guestAttendeeCount(guest), 0)
}

export function remainingSeats(table, excludingGuestId = null) {
  const guests = excludingGuestId
    ? table.guests.filter((guest) => guest.id !== excludingGuestId)
    : table.guests
  return Math.max(Number(table.capacity || 0) - tableAttendeeCount(guests), 0)
}

export function canAssignGuestToTable(guest, table) {
  if (!guest || !table) return false
  if (guest.allocated_table === table.name) return true
  return remainingSeats(table, guest.id) >= guestAttendeeCount(guest)
}

export function tableCapacityErrorMessage(guest, table) {
  const requiredSeats = guestAttendeeCount(guest)
  return `${table.name} 剩餘 ${remainingSeats(table, guest.id)} 位，無法加入 ${guest.name}（${requiredSeats} 位）。`
}

export function buildFloorTableRows(tables, mainTableName = '') {
  const floorTables = tables.filter((table) => table.name !== mainTableName)
  const rows = []
  let cursor = 0
  let rowIndex = 0

  while (cursor < floorTables.length) {
    const rowSize = rowIndex % 2 === 0 ? 2 : 4
    const rowTables = floorTables.slice(cursor, cursor + rowSize)
    const leftCount = rowSize === 2
      ? Math.ceil(rowTables.length / 2)
      : Math.min(rowTables.length, 2)

    rows.push({
      id: `table-row-${rowIndex}`,
      variant: rowSize === 2 ? 'two' : 'four',
      leftTables: rowTables.slice(0, leftCount),
      rightTables: rowTables.slice(leftCount),
    })
    cursor += rowSize
    rowIndex += 1
  }

  return rows
}

export function chairStyle(index, total) {
  const angle = -90 + (360 / total) * index
  return {
    transform: `rotate(${angle}deg) translate(var(--chair-radius)) rotate(${-angle}deg)`,
  }
}
