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
