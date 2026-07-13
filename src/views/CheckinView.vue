<script setup>
import { computed, onMounted, ref, watch } from 'vue'

import { fetchGuests, fetchTableSettings, patchGuest } from '../api/client'
import AdminLayout from '../components/AdminLayout.vue'

const guests = ref([])
const searchQuery = ref('')
const errorMessage = ref('')
const isLoading = ref(false)
const pendingGiftTimers = new Map()
const attendingOnly = ref(true)
const selectedTable = ref(null)
const tableSettings = ref([])
const actualCountDrafts = ref({})
const activeTab = ref('checkin')
const tableOrder = computed(() =>
  new Map(tableSettings.value.map((setting, index) => [setting.table_name, index])),
)

const visibleGuests = computed(() =>
  guests.value.filter((guest) =>
    attendingOnly.value ? guest.status === 'attend' : true,
  ),
)

const seatedAttendGuests = computed(() =>
  guests.value.filter((guest) => guest.status === 'attend' && hasAssignedTable(guest)),
)

const tableSummary = computed(() => {
  const tables = new Map()

  for (const setting of tableSettings.value) {
    tables.set(setting.table_name, {
      name: setting.table_name,
      capacity: Number(setting.capacity || 0),
      guests: [],
      arrivedGuests: [],
      pendingGuests: [],
      attendees: 0,
      arrivedAttendees: 0,
      pendingAttendees: 0,
    })
  }

  for (const guest of seatedAttendGuests.value) {
    const tableName = guest.allocated_table
    const groupSize = guestAttendeeCount(guest)

    const table = tables.get(tableName)
    if (!table) continue
    table.guests.push(guest)
    table.attendees += groupSize

    if (guest.is_arrived) {
      table.arrivedGuests.push(guest)
      table.arrivedAttendees += groupSize
    } else {
      table.pendingGuests.push(guest)
      table.pendingAttendees += groupSize
    }
  }

  return Array.from(tables.values())
    .map((table) => ({
      ...table,
      capacity: Number(table.capacity || 0) > 0
        ? Number(table.capacity)
        : Math.max(Number(table.attendees || 0), 1),
      percent: table.attendees
        ? Math.round((table.arrivedAttendees / table.attendees) * 100)
        : 0,
    }))
    .sort((a, b) => (tableOrder.value.get(a.name) ?? Number.MAX_SAFE_INTEGER) - (tableOrder.value.get(b.name) ?? Number.MAX_SAFE_INTEGER))
})

const mainTable = computed(() =>
  tableSummary.value.find((table) => table.name === '主桌') || tableSummary.value[0] || null,
)

const floorTableRows = computed(() => {
  const tables = tableSummary.value.filter((table) => table.name !== mainTable.value?.name)
  const rows = []
  let cursor = 0
  let rowIndex = 0

  while (cursor < tables.length) {
    const rowSize = rowIndex % 2 === 0 ? 2 : 4
    const rowTables = tables.slice(cursor, cursor + rowSize)
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
})

function chairStyle(index, total) {
  const angle = -90 + (360 / total) * index
  return {
    transform: `rotate(${angle}deg) translate(var(--chair-radius)) rotate(${-angle}deg)`,
  }
}

function normalizeGiftAmount(value) {
  if (value === '' || value === null || value === undefined) return 0
  return Math.max(Math.trunc(Number(value) || 0), 0)
}

function normalizeGuest(guest) {
  return {
    ...guest,
    gift_amount: normalizeGiftAmount(guest.gift_amount),
  }
}

async function loadGuests() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    const [guestData, settingData] = await Promise.all([
      fetchGuests(searchQuery.value.trim()),
      fetchTableSettings(),
    ])
    guests.value = guestData.map(normalizeGuest)
    tableSettings.value = settingData
    syncActualCountDrafts(guests.value)
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

async function updateGuestField(guestId, payload) {
  try {
    const updated = normalizeGuest(await patchGuest(guestId, payload))
    const index = guests.value.findIndex((guest) => guest.id === guestId)
    if (index >= 0) {
      guests.value[index] = updated
    }
    syncActualCountDraft(updated)
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error.message
  }
}

function guestAttendeeCount(guest) {
  return actualAdults(guest) + actualChildren(guest)
}

function actualAdults(guest) {
  return Number(guest.actual_adults ?? guest.total_adults ?? 0)
}

function actualChildren(guest) {
  return Number(guest.actual_children ?? guest.total_children ?? 0)
}

function hasAssignedTable(guest) {
  return Boolean(String(guest.allocated_table || '').trim())
}

function normalizeActualCount(value) {
  return value === '' || value === null || value === undefined
    ? null
    : Math.max(Number(value), 0)
}

function syncActualCountDraft(guest) {
  actualCountDrafts.value[guest.id] = {
    actual_adults: guest.actual_adults ?? null,
    actual_children: guest.actual_children ?? null,
  }
}

function syncActualCountDrafts(guestList) {
  actualCountDrafts.value = Object.fromEntries(
    guestList.map((guest) => [
      guest.id,
      {
        actual_adults: guest.actual_adults ?? null,
        actual_children: guest.actual_children ?? null,
      },
    ]),
  )
}

function actualCountInputValue(guest, field) {
  return actualCountDrafts.value[guest.id]?.[field] ?? ''
}

function openTableDialog(table) {
  selectedTable.value = table
}

function closeTableDialog() {
  selectedTable.value = null
}

function setActiveTab(tab) {
  activeTab.value = tab
  if (tab !== 'tables') {
    closeTableDialog()
  }
}

function dietSummary(guest) {
  const items = []
  const vegetarianCount =
    Number(guest.vegetarian_count || 0)
    || Number(guest.vegetarian_adults || 0)
    + Number(guest.vegetarian_children || 0)

  if (vegetarianCount > 0) {
    items.push(`素食 ${vegetarianCount}`)
  }
  if (guest.allergy_notes) {
    items.push(`特殊：${guest.allergy_notes}`)
  }
  if (guest.diet_notes) {
    items.push(guest.diet_notes)
  }

  return items.join(' / ')
}

function handleArrivedToggle(guest) {
  if (!hasAssignedTable(guest)) return

  if (guest.is_arrived) {
    updateGuestField(guest.id, {
      is_arrived: false,
      actual_adults: 0,
      actual_children: 0,
    })
    return
  }

  const draft = actualCountDrafts.value[guest.id] || {}
  updateGuestField(guest.id, {
    is_arrived: true,
    actual_adults: normalizeActualCount(draft.actual_adults),
    actual_children: normalizeActualCount(draft.actual_children),
  })
}

function handleGiftInput(guest, value) {
  const normalizedValue = value === '' ? '' : normalizeGiftAmount(value)
  guest.gift_amount = normalizedValue

  if (pendingGiftTimers.has(guest.id)) {
    clearTimeout(pendingGiftTimers.get(guest.id))
  }

  const timer = setTimeout(() => {
    updateGuestField(guest.id, {
      gift_amount: normalizedValue === '' ? 0 : normalizedValue,
    })
    pendingGiftTimers.delete(guest.id)
  }, 500)

  pendingGiftTimers.set(guest.id, timer)
}

function handleCakePickupToggle(guest) {
  if (guest.status !== 'attend') return
  updateGuestField(guest.id, {
    cake_status: guest.cake_status === 'pickup' ? 'pending_pickup' : 'pickup',
  })
}

function handleActualCountInput(guest, field, value) {
  if (!actualCountDrafts.value[guest.id]) {
    syncActualCountDraft(guest)
  }

  actualCountDrafts.value[guest.id][field] = normalizeActualCount(value)
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

    <div class="segmented checkin-tabs" role="tablist" aria-label="現場工作台功能切換">
      <button
        :class="{ 'is-active': activeTab === 'checkin' }"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'checkin'"
        @click="setActiveTab('checkin')"
      >
        現場搜尋與收禮
      </button>
      <button
        :class="{ 'is-active': activeTab === 'tables' }"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'tables'"
        @click="setActiveTab('tables')"
      >
        桌次簽到
      </button>
    </div>

    <section v-if="activeTab === 'tables'" class="ops-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Table Planning</p>
          <h2>桌次簽到</h2>
        </div>
        <span class="badge badge-warn">{{ tableSummary.length }} 個桌次</span>
      </div>

      <div class="venue-floor-plan">
        <div class="venue-floor-plan__scale">
          <div class="venue-stage">
            <span>舞台</span>
          </div>

          <div v-if="mainTable" class="venue-main-table">
            <button
              class="round-table round-table--main"
              type="button"
              @click="openTableDialog(mainTable)"
            >
              <span
                v-for="chair in mainTable.capacity"
                :key="`main-chair-${chair}`"
                class="round-table__chair"
                :class="{ 'is-arrived': chair <= mainTable.arrivedAttendees }"
                :style="chairStyle(chair - 1, mainTable.capacity)"
                aria-hidden="true"
              ></span>
              <span class="round-table__center">
                <strong>{{ mainTable.name }}</strong>
                <span>{{ mainTable.arrivedAttendees }} / {{ mainTable.capacity }}</span>
              </span>
            </button>
          </div>

          <div class="venue-table-rows">
            <div
              v-for="row in floorTableRows"
              :key="row.id"
              class="venue-table-row"
              :class="`venue-table-row--${row.variant}`"
            >
              <div class="venue-table-side venue-table-side--left">
                <button
                  v-for="table in row.leftTables"
                  :key="table.name"
                  class="round-table"
                  type="button"
                  @click="openTableDialog(table)"
                >
                  <span
                    v-for="chair in table.capacity"
                    :key="`${table.name}-chair-${chair}`"
                    class="round-table__chair"
                    :class="{ 'is-arrived': chair <= table.arrivedAttendees }"
                    :style="chairStyle(chair - 1, table.capacity)"
                    aria-hidden="true"
                  ></span>
                  <span class="round-table__center">
                    <strong>{{ table.name }}</strong>
                    <span>{{ table.arrivedAttendees }} / {{ table.capacity }}</span>
                  </span>
                </button>
              </div>

              <div class="venue-table-side venue-table-side--right">
                <button
                  v-for="table in row.rightTables"
                  :key="table.name"
                  class="round-table"
                  type="button"
                  @click="openTableDialog(table)"
                >
                  <span
                    v-for="chair in table.capacity"
                    :key="`${table.name}-chair-${chair}`"
                    class="round-table__chair"
                    :class="{ 'is-arrived': chair <= table.arrivedAttendees }"
                    :style="chairStyle(chair - 1, table.capacity)"
                    aria-hidden="true"
                  ></span>
                  <span class="round-table__center">
                    <strong>{{ table.name }}</strong>
                    <span>{{ table.arrivedAttendees }} / {{ table.capacity }}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div class="venue-aisle" aria-hidden="true">
            <span></span>
            <strong>走 道</strong>
            <span></span>
          </div>

          <div class="venue-entry">
            入口 / 接待
          </div>
        </div>
      </div>

      <p v-if="!mainTable" class="message">
        尚未建立桌次設定
      </p>

    </section>

    <div
      v-if="activeTab === 'tables' && selectedTable"
      class="dialog-backdrop"
      role="presentation"
      @click.self="closeTableDialog"
    >
      <section class="dialog-card" role="dialog" aria-modal="true">
        <div class="section-head">
          <div>
            <p class="eyebrow">Table Check-in</p>
            <h2>{{ selectedTable.name }}</h2>
            <p class="lead">
              已簽到 {{ selectedTable.arrivedAttendees }} 位，未簽到
              {{ selectedTable.pendingAttendees }} 位。
            </p>
          </div>
          <button class="btn btn-ghost" type="button" @click="closeTableDialog">
            關閉
          </button>
        </div>

        <div class="table-checkin-dialog">
          <div>
            <div class="dialog-list-head">
              <h3>已簽到</h3>
              <span class="badge badge-success">
                {{ selectedTable.arrivedAttendees }} 位
              </span>
            </div>
            <article
              v-for="guest in selectedTable.arrivedGuests"
              :key="guest.id"
              class="dialog-guest"
            >
              <strong>{{ guest.name }}</strong>
              <span>{{ guestAttendeeCount(guest) }} 位</span>
            </article>
            <p v-if="selectedTable.arrivedGuests.length === 0" class="message">
              尚無賓客簽到
            </p>
          </div>

          <div>
            <div class="dialog-list-head">
              <h3>未簽到</h3>
              <span class="badge badge-warn">
                {{ selectedTable.pendingAttendees }} 位
              </span>
            </div>
            <article
              v-for="guest in selectedTable.pendingGuests"
              :key="guest.id"
              class="dialog-guest"
            >
              <strong>{{ guest.name }}</strong>
              <span>{{ guestAttendeeCount(guest) }} 位</span>
            </article>
            <p v-if="selectedTable.pendingGuests.length === 0" class="message">
              這桌賓客皆已簽到
            </p>
          </div>
        </div>
      </section>
    </div>

    <section v-if="activeTab === 'checkin'" class="ops-panel checkin-workbench">
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
              <template v-if="guest.actual_adults !== null || guest.actual_children !== null">
                · 實到 {{ guestAttendeeCount(guest) }} 位
              </template>
              <template v-if="guest.status === 'attend'">
                · 喜餅 {{ guest.cake_status === 'pickup' ? '已領取' : '未領取' }}
              </template>
              <template v-if="dietSummary(guest)"> · {{ dietSummary(guest) }}</template>
            </p>
            <p
              v-if="guest.status === 'decline' && guest.decline_response"
              class="guest-sub"
            >
              {{ declineResponseLabel(guest.decline_response) }}
            </p>
          </div>

          <button
            class="btn"
            :class="guest.is_arrived ? 'btn-dark' : 'btn-primary'"
            type="button"
            :disabled="!hasAssignedTable(guest)"
            @click="handleArrivedToggle(guest)"
          >
            {{
              !hasAssignedTable(guest)
                ? '未分桌不可簽到'
                : guest.is_arrived
                  ? '取消到場'
                  : '標記到場'
            }}
          </button>

          <div class="actual-count-fields">
            <label>
              實到大人
              <input
                class="field-control"
                type="number"
                min="0"
                :placeholder="String(guest.total_adults || 0)"
                :value="actualCountInputValue(guest, 'actual_adults')"
                @input="handleActualCountInput(guest, 'actual_adults', $event.target.value)"
              />
            </label>
            <label>
              實到小孩
              <input
                class="field-control"
                type="number"
                min="0"
                :placeholder="String(guest.total_children || 0)"
                :value="actualCountInputValue(guest, 'actual_children')"
                @input="handleActualCountInput(guest, 'actual_children', $event.target.value)"
              />
            </label>
          </div>

          <label class="gift-field">
            <span>禮金金額</span>
            <input
              class="field-control gift-input"
              type="number"
              min="0"
              step="1"
              aria-label="禮金金額"
              :value="guest.gift_amount"
              @input="handleGiftInput(guest, $event.target.value)"
            />
          </label>

          <label v-if="guest.status === 'attend'" class="inline-check cake-pickup-field">
            <input
              type="checkbox"
              :checked="guest.cake_status === 'pickup'"
              @change="handleCakePickupToggle(guest)"
            />
            <span>已領喜餅</span>
          </label>
        </article>
      </div>

      <p v-if="!isLoading && visibleGuests.length === 0" class="message">
        找不到符合條件的賓客
      </p>
    </section>
  </AdminLayout>
</template>
