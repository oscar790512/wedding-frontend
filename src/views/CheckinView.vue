<script setup>
import { computed, onMounted, ref, watch } from 'vue'

import {
  fetchGuests,
  fetchTableSettings,
  patchGuest,
  saveTableSetting,
} from '../api/client'
import AdminLayout from '../components/AdminLayout.vue'

const guests = ref([])
const searchQuery = ref('')
const errorMessage = ref('')
const isLoading = ref(false)
const pendingGiftTimers = new Map()
const pendingCapacityTimers = new Map()
const attendingOnly = ref(true)
const tableSettings = ref({})
const tableCapacityDrafts = ref({})

const visibleGuests = computed(() =>
  guests.value.filter((guest) =>
    attendingOnly.value ? guest.status === 'attend' : true,
  ),
)

const tableSummary = computed(() => {
  const counters = new Map()

  for (const guest of guests.value) {
    if (guest.status !== 'attend') continue
    const tableName = guest.allocated_table || '未分桌'
    const groupSize = Number(guest.total_adults || 0) + Number(guest.total_children || 0)
    counters.set(tableName, (counters.get(tableName) || 0) + groupSize)
  }

  return Array.from(counters.entries())
    .map(([name, attendees]) => ({ name, attendees }))
    .sort((a, b) => b.attendees - a.attendees)
})

const tableCapacityRows = computed(() => {
  const rowsByName = new Map()

  for (const table of tableSummary.value) {
    rowsByName.set(table.name, table)
  }

  for (const tableName of Object.keys(tableSettings.value)) {
    if (!rowsByName.has(tableName)) {
      rowsByName.set(tableName, { name: tableName, attendees: 0 })
    }
  }

  if (rowsByName.size === 0) {
    rowsByName.set('未分桌', { name: '未分桌', attendees: 0 })
  }

  return Array.from(rowsByName.values()).map((table) => {
    const configuredCapacity = tableSettings.value[table.name]
    const fallbackCapacity =
      table.name === '未分桌' ? Math.max(table.attendees, 36) : 12
    const capacity = Number(configuredCapacity || fallbackCapacity)
    const draftCapacity = tableCapacityDrafts.value[table.name] ?? capacity

    return {
      ...table,
      capacity,
      draftCapacity,
      percent: Math.min(Math.round((table.attendees / capacity) * 100), 100),
    }
  })
})

const shippingSummary = computed(() => {
  const invitationPending = guests.value.filter(
    (guest) => guest.need_invitation && !guest.invitation_address,
  ).length
  const invitationReady = guests.value.filter(
    (guest) => guest.need_invitation && guest.invitation_address,
  ).length
  const cakePending = guests.value.filter(
    (guest) => guest.decline_response === 'request_cake' && !guest.shipping_address,
  ).length
  const cakeFollowUp = guests.value.filter(
    (guest) => guest.decline_response === 'request_cake',
  ).length

  return [
    { label: '喜帖待確認地址', value: invitationPending },
    { label: '喜帖可處理寄送', value: invitationReady },
    { label: '喜餅待補地址', value: cakePending },
    { label: '喜餅需求總數', value: cakeFollowUp },
  ]
})

async function loadGuests() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    const [guestData, settingData] = await Promise.all([
      fetchGuests(searchQuery.value.trim()),
      fetchTableSettings(),
    ])
    guests.value = guestData
    tableSettings.value = Object.fromEntries(
      settingData.map((setting) => [setting.table_name, setting.capacity]),
    )
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

async function updateTableCapacity(tableName, capacity) {
  try {
    const updated = await saveTableSetting({
      table_name: tableName,
      capacity: Number(capacity),
    })
    tableSettings.value = {
      ...tableSettings.value,
      [updated.table_name]: updated.capacity,
    }
    tableCapacityDrafts.value = {
      ...tableCapacityDrafts.value,
      [updated.table_name]: updated.capacity,
    }
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error.message
  }
}

function handleCapacityInput(tableName, value) {
  const capacity = Math.max(Number(value || 1), 1)
  tableCapacityDrafts.value = {
    ...tableCapacityDrafts.value,
    [tableName]: capacity,
  }

  if (pendingCapacityTimers.has(tableName)) {
    clearTimeout(pendingCapacityTimers.get(tableName))
  }

  const timer = setTimeout(() => {
    updateTableCapacity(tableName, capacity)
    pendingCapacityTimers.delete(tableName)
  }, 500)

  pendingCapacityTimers.set(tableName, timer)
}

async function updateGuestField(guestId, payload) {
  try {
    const updated = await patchGuest(guestId, payload)
    const index = guests.value.findIndex((guest) => guest.id === guestId)
    if (index >= 0) {
      guests.value[index] = updated
    }
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error.message
  }
}

function handleArrivedChange(guest, isArrived) {
  updateGuestField(guest.id, { is_arrived: isArrived })
}

function handleMarkArrived(guest) {
  if (!guest.is_arrived) {
    updateGuestField(guest.id, { is_arrived: true })
  }
}

function handleGiftInput(guest, value) {
  guest.gift_amount = value

  if (pendingGiftTimers.has(guest.id)) {
    clearTimeout(pendingGiftTimers.get(guest.id))
  }

  const timer = setTimeout(() => {
    updateGuestField(guest.id, {
      gift_amount: value === '' ? 0 : Number(value),
    })
    pendingGiftTimers.delete(guest.id)
  }, 500)

  pendingGiftTimers.set(guest.id, timer)
}

function statusLabel(status) {
  if (status === 'attend') return '出席'
  if (status === 'decline') return '不出席'
  return '未決定'
}

function declineResponseLabel(response) {
  if (response === 'blessing_only') {
    return '無法到場，在此致上誠摯的祝福'
  }
  if (response === 'request_cake') {
    return '無法到場，希望收到喜餅分享喜悅'
  }
  return ''
}

let searchTimer
watch(searchQuery, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadGuests, 300)
})

onMounted(loadGuests)
</script>

<template>
  <AdminLayout
    title="現場工作台"
    eyebrow="Operations"
    subtitle="桌次、寄送、簽到、禮金"
  >
    <header class="admin-top">
      <div>
        <p class="eyebrow">Operations</p>
        <h1>桌次、寄送與現場簽到</h1>
        <p class="lead">婚禮當天可交給工作人員操作的桌號、簽到與禮金工作台。</p>
      </div>
      <div class="toolbar">
        <button class="btn btn-primary" type="button">現場模式</button>
      </div>
    </header>

    <section class="ops-grid">
      <div class="ops-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Table Planning</p>
            <h2>桌次容量</h2>
          </div>
          <span class="badge badge-warn">{{ tableSummary.length }} 個桌次</span>
        </div>

        <div class="table-board">
          <article v-for="table in tableCapacityRows" :key="table.name" class="table-card">
            <strong>{{ table.name }}</strong>
            <p class="muted">已安排賓客</p>
            <div class="capacity">
              <span :style="{ width: `${table.percent}%` }"></span>
            </div>
            <div class="table-capacity-control">
              <span class="meta">{{ table.attendees }} / {{ table.capacity }} 位</span>
              <label>
                容量
                <input
                  class="field-control"
                  type="number"
                  min="1"
                  :value="table.draftCapacity"
                  @input="handleCapacityInput(table.name, $event.target.value)"
                />
              </label>
            </div>
          </article>
        </div>
      </div>

      <div class="ops-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Shipping</p>
            <h2>寄送待辦</h2>
          </div>
        </div>

        <div class="timeline">
          <div v-for="item in shippingSummary" :key="item.label" class="timeline-item">
            <span class="timeline-dot"></span>
            <p>{{ item.label }}</p>
            <span class="badge badge-warn">{{ item.value }}</span>
          </div>
        </div>
      </div>
    </section>

    <section class="ops-panel checkin-workbench">
      <div class="section-head">
        <div>
          <p class="eyebrow">Check-in</p>
          <h2>現場搜尋與收禮</h2>
        </div>
        <div class="toolbar">
          <input
            v-model="searchQuery"
          class="field-control checkin-search"
            type="search"
            placeholder="搜尋姓名或電話末三碼"
            autocomplete="off"
          />
          <span class="badge badge-neutral">gift_staff</span>
        </div>
      </div>

      <label class="toggle checkin-toggle">
        <input v-model="attendingOnly" type="checkbox" />
        <span aria-hidden="true"></span>
        只看出席賓客
      </label>

      <p v-if="errorMessage" class="message message--error">{{ errorMessage }}</p>
      <p v-if="isLoading" class="message">載入中...</p>

      <div v-else class="checkin-list">
        <article v-for="guest in visibleGuests" :key="guest.id" class="checkin-row">
          <div>
            <p class="guest-name">{{ guest.name }}</p>
            <p class="guest-sub">
              {{ guest.allocated_table || '未分桌' }} · 大人 {{ guest.total_adults }} 位
              <template v-if="guest.total_children > 0"> · 小孩 {{ guest.total_children }} 位</template>
              <template v-if="guest.diet_notes"> · {{ guest.diet_notes }}</template>
            </p>
            <p
              v-if="guest.status === 'decline' && guest.decline_response"
              class="guest-sub"
            >
              {{ declineResponseLabel(guest.decline_response) }}
            </p>
          </div>

          <span
            v-if="guest.is_arrived"
            class="badge badge-success"
          >
            已到場
          </span>
          <button
            v-else
            class="btn btn-primary"
            type="button"
            @click="handleMarkArrived(guest)"
          >
            標記到場
          </button>

          <input
            class="field-control gift-input"
            type="number"
            min="0"
            step="100"
            aria-label="禮金"
            :value="guest.gift_amount"
            @input="handleGiftInput(guest, $event.target.value)"
          />
        </article>
      </div>

      <p v-if="!isLoading && visibleGuests.length === 0" class="message">
        找不到符合條件的賓客
      </p>
    </section>
  </AdminLayout>
</template>
