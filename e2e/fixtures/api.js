import { expect } from '@playwright/test'

const apiBaseUrl = 'http://localhost:8000'

export const defaultGuests = [
  {
    id: 'guest-1',
    name: '王小明',
    phone: '0912345678',
    email: 'ming@example.com',
    guest_category: '男方朋友/同學',
    status: 'attend',
    total_adults: 2,
    total_children: 1,
    child_seats: 1,
    vegetarian_count: 1,
    diet_notes: '不吃牛',
    allergy_notes: null,
    need_invitation: true,
    invitation_address: '高雄市三民區十全三路265號',
    invitation_status: 'pending_send',
    decline_response: null,
    blessing_message: null,
    cake_status: 'pending_pickup',
    shipping_recipient: null,
    shipping_phone: null,
    shipping_address: null,
    shipping_date: null,
    tracking_no: null,
    allocated_table: 'A1',
    actual_adults: null,
    actual_children: null,
    is_arrived: false,
    gift_amount: 0,
    admin_notes: '',
    checkin_token: 'guest-1-token',
  },
  {
    id: 'guest-2',
    name: '陳美美',
    phone: '0987654321',
    email: '',
    guest_category: '女方家人',
    status: 'decline',
    total_adults: 0,
    total_children: 0,
    child_seats: 0,
    vegetarian_count: 0,
    diet_notes: null,
    allergy_notes: null,
    need_invitation: false,
    invitation_address: null,
    invitation_status: 'not_required',
    decline_response: 'request_cake',
    blessing_message: '新婚快樂',
    cake_status: 'pending_send',
    shipping_recipient: '陳美美',
    shipping_phone: '0987654321',
    shipping_address: '台北市信義區測試路1號',
    shipping_date: null,
    tracking_no: null,
    allocated_table: null,
    actual_adults: null,
    actual_children: null,
    is_arrived: false,
    gift_amount: 0,
    admin_notes: '',
    checkin_token: 'guest-2-token',
  },
]

const summary = {
  total_guests: 2,
  attending_households: 1,
  total_attendees: 3,
  total_adults: 2,
  total_children: 1,
  vegetarian_count: 1,
  invitation_count: 1,
  child_seats_count: 1,
  arrived_count: 0,
  total_gift_amount: 0,
  decline_request_cake_count: 1,
  decline_blessing_only_count: 0,
}

function json(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  }
}

function getPath(url) {
  return new URL(url).pathname
}

function paginatedGuests(url, guests) {
  const searchParams = new URL(url).searchParams
  const page = Number(searchParams.get('page') || 1)
  const pageSize = Number(searchParams.get('page_size') || 100)
  const start = (page - 1) * pageSize
  const items = guests.slice(start, start + pageSize)

  return {
    items,
    total: guests.length,
    page,
    page_size: pageSize,
  }
}

export async function mockWeddingApi(page, options = {}) {
  const guests = options.guests || defaultGuests
  const requests = []

  await page.route(`${apiBaseUrl}/api/**`, async (route) => {
    const request = route.request()
    const path = getPath(request.url())
    requests.push(request)

    if (request.method() === 'GET' && path === '/api/rsvp/settings') {
      await route.fulfill(json({ rsvp_deadline: '2026-10-08' }))
      return
    }

    if (request.method() === 'POST' && path === '/api/rsvp') {
      const payload = request.postDataJSON()
      await route.fulfill(json({
        id: 'submitted-guest',
        ...payload,
        status: payload.status || 'attend',
        checkin_token: payload.status === 'decline' ? null : 'submitted-token',
      }))
      return
    }

    if (request.method() === 'POST' && path === '/api/auth/login') {
      const payload = request.postDataJSON()
      if (payload.username === 'admin' && payload.password === 'password123') {
        await route.fulfill(json({
          access_token: 'e2e-admin-token',
          token_type: 'bearer',
          username: 'admin',
          display_name: '測試管理員',
          role: 'admin',
        }))
        return
      }

      await route.fulfill(json({ detail: 'Invalid credentials' }, 401))
      return
    }

    if (request.method() === 'GET' && path === '/api/admin/summary') {
      await expect(request.headers().authorization).toBe('Bearer e2e-admin-token')
      await route.fulfill(json(summary))
      return
    }

    if (request.method() === 'GET' && path === '/api/admin/guests') {
      await expect(request.headers().authorization).toBe('Bearer e2e-admin-token')
      await route.fulfill(json(paginatedGuests(request.url(), guests)))
      return
    }

    if (request.method() === 'GET' && path === '/api/admin/table-settings') {
      await expect(request.headers().authorization).toBe('Bearer e2e-admin-token')
      await route.fulfill(json([
        {
          table_name: 'A1',
          max_capacity: 10,
          notes: '主桌旁',
        },
      ]))
      return
    }

    await route.fulfill(json({ detail: `Unhandled E2E mock: ${request.method()} ${path}` }, 500))
  })

  return {
    requests,
    requestsFor(path) {
      return requests.filter((request) => getPath(request.url()) === path)
    },
  }
}
