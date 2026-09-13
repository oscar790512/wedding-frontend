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

export const DEFAULT_FLOOR_COLUMN_COUNTS = [6, 6, 5, 6]

export function buildFloorTableColumns(
  tables,
  mainTableName = '',
  columnCounts = DEFAULT_FLOOR_COLUMN_COUNTS,
) {
  const floorTables = tables.filter((table) => table.name !== mainTableName)
  const normalizedCounts = normalizeFloorColumnCounts(columnCounts)
  const columns = normalizedCounts.map((count, index) => ({
    id: `table-column-${index}`,
    tables: [],
  }))
  let cursor = 0

  for (let index = 0; index < columns.length; index += 1) {
    const count = normalizedCounts[index]
    columns[index].tables = floorTables.slice(cursor, cursor + count)
    cursor += count
  }

  if (cursor < floorTables.length) {
    columns[columns.length - 1].tables = [
      ...columns[columns.length - 1].tables,
      ...floorTables.slice(cursor),
    ]
  }

  return columns
}

export function buildFloorTableRows(tables, mainTableName = '') {
  const columns = buildFloorTableColumns(tables, mainTableName)
  const maxRows = Math.max(...columns.map((column) => column.tables.length), 0)
  const rows = []

  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    rows.push({
      id: `table-row-${rowIndex}`,
      variant: rowIndex === maxRows - 1 ? 'entry' : 'standard',
      leftTables: [columns[0].tables[rowIndex], columns[1].tables[rowIndex]].filter(Boolean),
      centerTables: [],
      rightTables: [columns[2].tables[rowIndex], columns[3].tables[rowIndex]].filter(Boolean),
    })
  }

  return rows
}

export function normalizeFloorColumnCounts(columnCounts) {
  return Array.from({ length: 4 }, (_, index) =>
    Math.max(Math.trunc(Number(columnCounts?.[index] ?? 0) || 0), 0),
  )
}

export function chairStyle(index, total) {
  const angle = -90 + (360 / total) * index
  return {
    transform: `rotate(${angle}deg) translate(var(--chair-radius)) rotate(${-angle}deg)`,
  }
}
