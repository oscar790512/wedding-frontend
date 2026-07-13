<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import jsQR from 'jsqr'

import {
  fetchGuestByCheckinToken,
  fetchGuests,
  fetchTableSettings,
  patchGuest,
  patchGuestCheckin,
} from '../api/client'
import AdminLayout from '../components/AdminLayout.vue'

const route = useRoute()
const router = useRouter()
const guests = ref([])
const searchQuery = ref('')
const errorMessage = ref('')
const isLoading = ref(false)
const scanErrorMessage = ref('')
const scanStatusMessage = ref('')
const isResolvingScan = ref(false)
const isCameraScanning = ref(false)
const scannerVideo = ref(null)
const pendingGiftTimers = new Map()
const attendingOnly = ref(true)
const selectedTable = ref(null)
const tableSettings = ref([])
const actualCountDrafts = ref({})
const activeTab = ref('checkin')
const scannedGuest = ref(null)
let scannerStream = null
let scannerFrame = null
let scannerCanvas = null
let scannerContext = null
let scannerFrameCount = 0
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

function applyUpdatedGuest(updatedGuest) {
  const updated = normalizeGuest(updatedGuest)
  const index = guests.value.findIndex((guest) => guest.id === updated.id)
  if (index >= 0) {
    guests.value[index] = updated
  } else {
    guests.value = [updated, ...guests.value]
  }
  if (scannedGuest.value?.id === updated.id) {
    scannedGuest.value = updated
  }
  syncActualCountDraft(updated)
  return updated
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
    applyUpdatedGuest(await patchGuest(guestId, payload))
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error.message
  }
}

async function updateGuestCheckinField(guestId, payload) {
  try {
    const updated = applyUpdatedGuest(await patchGuestCheckin(guestId, payload))
    scanStatusMessage.value = scanStatusMessage.value && updated.is_arrived
      ? `${scanStatusMessage.value}，已確認到場`
      : updated.is_arrived
        ? '已確認到場'
        : '已取消到場'
    errorMessage.value = ''
    scanErrorMessage.value = ''
  } catch (error) {
    errorMessage.value = error.message
    scanErrorMessage.value = error.message
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

function setActualCountDraftToExpected(guest) {
  actualCountDrafts.value[guest.id] = {
    actual_adults: guest.actual_adults ?? guest.total_adults ?? 0,
    actual_children: guest.actual_children ?? guest.total_children ?? 0,
  }
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

function checkinUrlToken(value) {
  try {
    const url = new URL(value)
    const match = url.pathname.match(/\/admin\/operations\/scan\/([^/]+)$/)
    return match ? decodeURIComponent(match[1]) : value.trim()
  } catch {
    return value.trim()
  }
}

async function resolveCheckinToken(tokenValue) {
  const token = checkinUrlToken(tokenValue || '')
  if (!token) return

  activeTab.value = 'checkin'
  isResolvingScan.value = true
  scanErrorMessage.value = ''
  scanStatusMessage.value = ''

  try {
    const guest = applyUpdatedGuest(await fetchGuestByCheckinToken(token))
    setActualCountDraftToExpected(guest)
    scannedGuest.value = guest
    attendingOnly.value = false
  } catch (error) {
    scannedGuest.value = null
    scanErrorMessage.value = `${error.message}，請改用手動搜尋。`
  } finally {
    isResolvingScan.value = false
  }
}

function closeScannedGuest() {
  scannedGuest.value = null
  scanErrorMessage.value = ''
  scanStatusMessage.value = ''
  if (route.name === 'checkin-scan') {
    router.replace({ name: 'checkin' })
  }
}

function formatDateTime(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function scannedGuestStatusText(guest) {
  if (guest.status !== 'attend') return '目前不是出席狀態，不能簽到'
  if (guest.is_arrived) {
    return guest.arrived_at
      ? `已於 ${formatDateTime(guest.arrived_at)} 到場`
      : '已到場'
  }
  return '尚未到場'
}

function tableRemainingSeats(table) {
  return Math.max(Number(table.capacity || 0) - Number(table.attendees || 0), 0)
}

function findAvailableTable(requiredSeats) {
  if (!requiredSeats || requiredSeats < 1) return null
  return tableSummary.value.find((table) => tableRemainingSeats(table) >= requiredSeats) || null
}

function buildScannedArrivalPayload() {
  const guest = scannedGuest.value
  if (!guest) return null

  const draft = actualCountDrafts.value[guest.id] || {}
  const actualAdults = normalizeActualCount(draft.actual_adults) ?? Number(guest.total_adults || 0)
  const actualChildren = normalizeActualCount(draft.actual_children) ?? Number(guest.total_children || 0)
  const payload = {
    is_arrived: true,
    actual_adults: actualAdults,
    actual_children: actualChildren,
  }

  if (!hasAssignedTable(guest)) {
    const assignedTable = findAvailableTable(actualAdults + actualChildren)
    if (!assignedTable) {
      scanErrorMessage.value = '目前沒有足夠空位可自動分桌，請先到桌次安排調整座位。'
      return null
    }
    payload.allocated_table = assignedTable.name
    scanStatusMessage.value = `已自動安排至 ${assignedTable.name}`
  }

  return payload
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
    updateGuestCheckinField(guest.id, {
      is_arrived: false,
      actual_adults: 0,
      actual_children: 0,
    })
    return
  }

  const draft = actualCountDrafts.value[guest.id] || {}
  updateGuestCheckinField(guest.id, {
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
  updateGuestCheckinField(guest.id, {
    cake_status: guest.cake_status === 'pickup' ? 'pending_pickup' : 'pickup',
  })
}

function confirmScannedArrival() {
  if (!scannedGuest.value || scannedGuest.value.status !== 'attend') return
  const payload = buildScannedArrivalPayload()
  if (!payload) return
  updateGuestCheckinField(scannedGuest.value.id, payload)
}

function cancelScannedArrival() {
  if (!scannedGuest.value) return
  updateGuestCheckinField(scannedGuest.value.id, {
    is_arrived: false,
    actual_adults: 0,
    actual_children: 0,
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

async function startCameraScan() {
  scanErrorMessage.value = ''
  scanStatusMessage.value = ''

  try {
    isCameraScanning.value = true
    await nextTick()
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    })
    scannerVideo.value.srcObject = scannerStream
    await scannerVideo.value.play()
    scannerCanvas = document.createElement('canvas')
    scannerContext = scannerCanvas.getContext('2d', { willReadFrequently: true })
    scannerFrameCount = 0
    scanCameraFrame()
  } catch {
    stopCameraScan()
    scanErrorMessage.value = '無法開啟相機，請確認權限或改用手動搜尋。'
  }
}

function stopCameraScan() {
  isCameraScanning.value = false
  if (scannerFrame) {
    window.cancelAnimationFrame(scannerFrame)
    scannerFrame = null
  }
  if (scannerStream) {
    scannerStream.getTracks().forEach((track) => track.stop())
    scannerStream = null
  }
  scannerCanvas = null
  scannerContext = null
  scannerFrameCount = 0
}

async function scanCameraFrame() {
  const video = scannerVideo.value
  if (!isCameraScanning.value || !video || !scannerCanvas || !scannerContext) return

  try {
    scannerFrameCount += 1
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && scannerFrameCount % 3 === 0) {
      scannerCanvas.width = video.videoWidth
      scannerCanvas.height = video.videoHeight
      scannerContext.drawImage(video, 0, 0, scannerCanvas.width, scannerCanvas.height)
      const imageData = scannerContext.getImageData(0, 0, scannerCanvas.width, scannerCanvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      })
      if (!code?.data) {
        scannerFrame = window.requestAnimationFrame(scanCameraFrame)
        return
      }
      stopCameraScan()
      await resolveCheckinToken(code.data)
      return
    }
  } catch {
    stopCameraScan()
    scanErrorMessage.value = '掃描失敗，請確認 QR Code 在畫面中央，或改用手動搜尋。'
    return
  }

  scannerFrame = window.requestAnimationFrame(scanCameraFrame)
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

onMounted(async () => {
  await loadGuests()
  if (route.params.token) {
    await resolveCheckinToken(route.params.token)
  }
})

watch(
  () => route.params.token,
  (token) => {
    if (token) resolveCheckinToken(token)
  },
)

onBeforeUnmount(() => {
  stopCameraScan()
})
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
        <button class="btn btn-primary" type="button" @click="startCameraScan">
          掃描 QR
        </button>
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
      <section class="scan-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">QR Check-in</p>
            <h2>掃碼快速定位</h2>
            <p class="lead">掃到 QR Code 後先確認資料，再手動標記到場。</p>
          </div>
          <div class="toolbar">
            <button
              class="btn btn-primary"
              type="button"
              :disabled="isCameraScanning"
              @click="startCameraScan"
            >
              {{ isCameraScanning ? '掃描中...' : '開啟相機掃描' }}
            </button>
            <button
              v-if="isCameraScanning"
              class="btn btn-ghost"
              type="button"
              @click="stopCameraScan"
            >
              停止
            </button>
          </div>
        </div>

        <div v-if="isCameraScanning" class="scanner-frame">
          <video ref="scannerVideo" playsinline muted></video>
        </div>

        <p v-if="isResolvingScan" class="message">讀取 QR Code 中...</p>
        <p v-if="scanErrorMessage" class="message message--error">{{ scanErrorMessage }}</p>
        <p v-if="scanStatusMessage" class="message shipping-success">{{ scanStatusMessage }}</p>

        <article v-if="scannedGuest" class="scan-result-card">
          <div class="shipping-item__head guest-card__head">
            <div>
              <p class="guest-name">{{ scannedGuest.name }}</p>
              <p class="guest-sub">
                {{ scannedGuest.guest_category || '未分類' }} ·
                <span :class="{ 'scan-unassigned': !hasAssignedTable(scannedGuest) }">
                  {{ scannedGuest.allocated_table || '未分桌' }}
                </span>
              </p>
            </div>
            <div class="shipping-item__badges">
              <span class="badge" :class="`badge--${scannedGuest.status}`">
                {{ statusLabel(scannedGuest.status) }}
              </span>
              <span
                class="badge"
                :class="scannedGuest.is_arrived ? 'badge-success' : 'badge-warn'"
              >
                {{ scannedGuestStatusText(scannedGuest) }}
              </span>
            </div>
          </div>

          <div class="scan-result-grid">
            <div>
              <p class="shipping-label">RSVP 人數</p>
              <p class="shipping-value">
                大人 {{ scannedGuest.total_adults }} / 小孩 {{ scannedGuest.total_children }}
              </p>
            </div>
            <div>
              <p class="shipping-label">實際到場</p>
              <div class="actual-count-fields">
                <label>
                  大人
                  <input
                    class="field-control"
                    type="number"
                    min="0"
                    :placeholder="String(scannedGuest.total_adults || 0)"
                    :value="actualCountInputValue(scannedGuest, 'actual_adults')"
                    @input="handleActualCountInput(scannedGuest, 'actual_adults', $event.target.value)"
                  />
                </label>
                <label>
                  小孩
                  <input
                    class="field-control"
                    type="number"
                    min="0"
                    :placeholder="String(scannedGuest.total_children || 0)"
                    :value="actualCountInputValue(scannedGuest, 'actual_children')"
                    @input="handleActualCountInput(scannedGuest, 'actual_children', $event.target.value)"
                  />
                </label>
              </div>
            </div>
            <div>
              <p class="shipping-label">喜餅</p>
              <label v-if="scannedGuest.status === 'attend'" class="inline-check cake-pickup-field">
                <input
                  type="checkbox"
                  :checked="scannedGuest.cake_status === 'pickup'"
                  @change="handleCakePickupToggle(scannedGuest)"
                />
                <span>{{ scannedGuest.cake_status === 'pickup' ? '已領取' : '未領取' }}</span>
              </label>
              <p v-else class="shipping-value">不適用</p>
            </div>
          </div>

          <div class="toolbar">
            <button
              class="btn btn-primary"
              type="button"
              :disabled="scannedGuest.status !== 'attend' || scannedGuest.is_arrived"
              @click="confirmScannedArrival"
            >
              {{ scannedGuest.is_arrived ? '已到場' : '確認到場' }}
            </button>
            <button
              v-if="scannedGuest.is_arrived"
              class="btn btn-ghost"
              type="button"
              @click="cancelScannedArrival"
            >
              取消到場
            </button>
            <button class="btn btn-ghost" type="button" @click="closeScannedGuest">
              回到手動搜尋
            </button>
          </div>
        </article>
      </section>

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
