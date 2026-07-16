export function normalizePhone(value) {
  return value.replace(/[^\d]/g, '')
}

export function cakeRecipientDisplayValue(form) {
  return form.use_cake_recipient_same ? form.name : form.shipping_recipient
}

export function cakePhoneDisplayValue(form) {
  return form.use_cake_phone_same ? form.phone : form.shipping_phone
}

export function buildRsvpPayload(form, guestCategory) {
  const rsvpPayload = { ...form }
  delete rsvpPayload.relationship_side
  delete rsvpPayload.relationship_type
  delete rsvpPayload.allergy_notes

  return {
    ...rsvpPayload,
    phone: normalizePhone(form.phone),
    email: form.email.trim() || null,
    guest_category: guestCategory || null,
    diet_notes: form.diet_notes.trim() || null,
    vegetarian_count: form.need_vegetarian ? form.vegetarian_count : 0,
    child_seats: form.total_children > 0 ? form.child_seats : 0,
    invitation_address: form.need_invitation
      ? form.invitation_address.trim()
      : null,
    decline_response:
      form.status === 'decline' ? form.decline_response : null,
    shipping_recipient:
      form.status === 'decline' && form.decline_response === 'request_cake'
        ? (form.use_cake_recipient_same ? form.name.trim() : form.shipping_recipient.trim())
        : null,
    shipping_phone:
      form.status === 'decline' && form.decline_response === 'request_cake'
        ? (form.use_cake_phone_same ? normalizePhone(form.phone) : normalizePhone(form.shipping_phone))
        : null,
    shipping_address:
      form.status === 'decline' && form.decline_response === 'request_cake'
        ? form.shipping_address.trim()
        : null,
    blessing_message: form.blessing_message.trim() || null,
  }
}
