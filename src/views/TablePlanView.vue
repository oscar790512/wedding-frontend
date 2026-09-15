<script setup>
import { computed, onMounted, ref } from 'vue'

import {
  deleteTableSetting,
  fetchGuests,
  fetchTableLayout,
  fetchTableSettings,
  patchGuest,
  renameTableSetting,
  saveTableLayout,
  saveTableSetting,
} from '../api/client'
import AdminLayout from '../components/AdminLayout.vue'
import VenueFloorPlan from '../components/VenueFloorPlan.vue'
import {
  DEFAULT_FLOOR_COLUMN_COUNTS,
  buildFloorTableRows,
  canAssignGuestToTable,
  guestAttendeeCount,
  normalizeFloorColumnCounts,
  tableAttendeeCount,
  tableCapacityErrorMessage,
} from '../utils/tablePlan'

const guests = ref([])
const tableSettings = ref([])
const tableLayoutSlots = ref([])
const unplacedLayoutTables = ref([])
const isLoading = ref(false)
const errorMessage = ref('')
const newTableCount = ref(1)
const defaultCapacity = ref(12)
const floorColumnCounts = ref([...DEFAULT_FLOOR_COLUMN_COUNTS])
const selectedGuestByTable = ref({})
const selectedSlotByTable = ref({})
const guestSearchByTable = ref({})
const assigningGuestByTable = ref({})
const tableNameDrafts = ref({})
const renamingTableByName = ref({})
const selectedTableName = ref('')
const tableSettingsByName = computed(() =>
  new Map(tableSettings.value.map((setting) => [setting.table_name, setting])),
)

const tableNames = computed(() => tableSettings.value.map((setting) => setting.table_name))

const attendingGuests = computed(() =>
  guests.value.filter((guest) => guest.status === 'attend'),
)

const unassignedGuests = computed(() =>
  attendingGuests.value.filter((guest) => !guest.allocated_table),
)

const tables = computed(() =>
  tableNames.value.map((tableName) => {
    const setting = tableSettingsByName.value.get(tableName)
    const seatedGuests = attendingGuests.value.filter(
      (guest) => guest.allocated_table === tableName,
    )
    const attendeeCount = tableAttendeeCount(seatedGuests)
    const capacity = Number(setting?.capacity || defaultCapacity.value || 12)

    return {
      name: tableName,
      capacity,
      guests: seatedGuests,
      attendeeCount,
      percent: Math.min(Math.round((attendeeCount / capacity) * 100), 100),
      isOverCapacity: attendeeCount > capacity,
    }
  }),
)

const totalCapacity = computed(() =>
  tables.value.reduce((sum, table) => sum + Number(table.capacity || 0), 0),
)

const mainTable = computed(() =>
  tables.value.find((table) => table.name === '主桌') || tables.value[0] || null,
)

const floorTableRows = computed(() =>
  buildFloorTableRows(tables.value, mainTable.value?.name),
)

const floorTableColumns = computed(() => {
  const tablesByName = new Map(tables.value.map((table) => [table.name, table]))
  return Array.from({ length: 4 }, (_, columnIndex) => {
    const columnNumber = columnIndex + 1
    const slots = tableLayoutSlots.value
      .filter((slot) => Number(slot.column_index) === columnNumber)
      .toSorted((a, b) => Number(a.position_index) - Number(b.position_index))

    return {
      id: `table-column-${columnNumber}`,
      tables: slots.map((slot) => {
        const table = slot.table_name ? tablesByName.get(slot.table_name) : null
        if (table) return table
        return {
          isEmptySlot: true,
          id: slotKey(slot),
          columnIndex: Number(slot.column_index),
          positionIndex: Number(slot.position_index),
        }
      }),
    }
  })
})

const floorTableCount = computed(() =>
  mainTable.value ? Math.max(tables.value.length - 1, 0) : tables.value.length,
)

const floorColumnTotal = computed(() =>
  floorColumnCounts.value.reduce((sum, count) => sum + Number(count || 0), 0),
)

const floorLayoutMessage = computed(() => {
  if (floorColumnTotal.value === floorTableCount.value) return ''
  if (floorColumnTotal.value < floorTableCount.value) {
    return `座位圖目前有 ${floorColumnTotal.value} 個位置，尚有 ${floorTableCount.value - floorColumnTotal.value} 桌需要新增位置或留在待安排區。`
  }
  return `四欄目前設定 ${floorColumnTotal.value} 個位置，已超過一般桌數 ${floorTableCount.value} 桌，多出的欄位位置會留空。`
})

const emptyLayoutSlots = computed(() =>
  tableLayoutSlots.value
    .filter((slot) => !slot.table_name)
    .toSorted(compareLayoutSlots),
)

const selectedTableSlotOptions = computed(() => {
  const currentSlot = selectedTableLayoutSlot.value ? [selectedTableLayoutSlot.value] : []
  return [...currentSlot, ...emptyLayoutSlots.value].toSorted(compareLayoutSlots)
})

const selectedTable = computed(() =>
  tables.value.find((table) => table.name === selectedTableName.value) || null,
)

const selectedTableLayoutSlot = computed(() =>
  selectedTable.value
    ? tableLayoutSlots.value.find((slot) => slot.table_name === selectedTable.value.name)
    : null,
)

const isRenamingSelectedTable = computed(() =>
  selectedTable.value ? Boolean(renamingTableByName.value[selectedTable.value.name]) : false,
)

const canRenameSelectedTable = computed(() => {
  if (!selectedTable.value || isLockedTableName(selectedTable.value.name)) return false
  if (isRenamingSelectedTable.value) return false

  const draft = tableNameDraft(selectedTable.value.name).trim()
  return Boolean(draft) && draft !== selectedTable.value.name
})

const assignedGuestCount = computed(() =>
  attendingGuests.value.length - unassignedGuests.value.length,
)

async function loadPlanningData() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    const [guestData, settingData, layoutData] = await Promise.all([
      fetchGuests(''),
      fetchTableSettings(),
      fetchTableLayout(),
    ])
    guests.value = guestData
    tableSettings.value = settingData
    tableNameDrafts.value = Object.fromEntries(
      settingData.map((setting) => [setting.table_name, setting.table_name]),
    )
    if ((layoutData.slots || []).length > 0) {
      applyTableLayout(layoutData)
    } else {
      const initializedLayout = await saveTableLayout({
        slots: createInitialLayoutSlots(settingData),
      })
      applyTableLayout(initializedLayout)
    }
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

async function renameTable(oldTableName) {
  if (isLockedTableName(oldTableName)) return

  const newTableName = tableNameDraft(oldTableName).trim()
  if (!newTableName || newTableName === oldTableName) {
    tableNameDrafts.value = {
      ...tableNameDrafts.value,
      [oldTableName]: oldTableName,
    }
    return
  }

  renamingTableByName.value = {
    ...renamingTableByName.value,
    [oldTableName]: true,
  }

  try {
    const updated = await renameTableSetting({
      old_table_name: oldTableName,
      new_table_name: newTableName,
    })

    tableSettings.value = tableSettings.value.map((setting) =>
      setting.table_name === oldTableName ? updated : setting,
    )
    guests.value = guests.value.map((guest) =>
      guest.allocated_table === oldTableName
        ? { ...guest, allocated_table: newTableName }
        : guest,
    )
    const { [oldTableName]: _removed, ...drafts } = tableNameDrafts.value
    tableNameDrafts.value = {
      ...drafts,
      [newTableName]: newTableName,
    }
    if (selectedTableName.value === oldTableName) {
      selectedTableName.value = newTableName
    }
    await loadPlanningData()
    errorMessage.value = ''
  } catch (error) {
    tableNameDrafts.value = {
      ...tableNameDrafts.value,
      [oldTableName]: oldTableName,
    }
    errorMessage.value = error.message
  } finally {
    const { [oldTableName]: _renamed, ...nextRenamingTables } = renamingTableByName.value
    renamingTableByName.value = nextRenamingTables
  }
}

function tableNameDraft(tableName) {
  return tableNameDrafts.value[tableName] ?? tableName
}

function handleTableNameInput(tableName, value) {
  if (isLockedTableName(tableName) || renamingTableByName.value[tableName]) return
  tableNameDrafts.value = {
    ...tableNameDrafts.value,
    [tableName]: value,
  }
}

function isLockedTableName(tableName) {
  return tableName === '主桌'
}

function compareLayoutSlots(a, b) {
  const columnCompare = Number(a.column_index) - Number(b.column_index)
  if (columnCompare !== 0) return columnCompare
  return Number(a.position_index) - Number(b.position_index)
}

function slotKey(slot) {
  return `${slot.column_index}-${slot.position_index}`
}

function slotLabel(slot) {
  return `第 ${slot.column_index} 欄第 ${slot.position_index} 位`
}

function applyTableLayout(layoutData) {
  tableLayoutSlots.value = (layoutData.slots || []).toSorted(compareLayoutSlots)
  unplacedLayoutTables.value = layoutData.unplaced_tables || []
  floorColumnCounts.value = normalizeFloorColumnCounts(
    Array.from({ length: 4 }, (_, index) =>
      tableLayoutSlots.value.filter((slot) => Number(slot.column_index) === index + 1).length,
    ),
  )
}

function createInitialLayoutSlots(settings) {
  const floorTableNames = settings
    .map((setting) => setting.table_name)
    .filter((tableName) => tableName !== '主桌')
  const counts = normalizeFloorColumnCounts(DEFAULT_FLOOR_COLUMN_COUNTS)
  const slots = []
  let cursor = 0

  for (let columnIndex = 0; columnIndex < counts.length; columnIndex += 1) {
    const columnNumber = columnIndex + 1
    const slotCount = counts[columnIndex]

    for (let positionIndex = 1; positionIndex <= slotCount; positionIndex += 1) {
      slots.push({
        column_index: columnNumber,
        position_index: positionIndex,
        table_name: floorTableNames[cursor] || null,
      })
      cursor += 1
    }
  }

  while (cursor < floorTableNames.length) {
    const positionIndex = slots.filter((slot) => slot.column_index === 4).length + 1
    slots.push({
      column_index: 4,
      position_index: positionIndex,
      table_name: floorTableNames[cursor],
    })
    cursor += 1
  }

  return slots
}

function serializeLayoutSlots(slots = tableLayoutSlots.value) {
  return slots.toSorted(compareLayoutSlots).map((slot, index, sortedSlots) => {
    const sameColumnBefore = sortedSlots
      .slice(0, index)
      .filter((item) => Number(item.column_index) === Number(slot.column_index)).length

    return {
      column_index: Number(slot.column_index),
      position_index: sameColumnBefore + 1,
      table_name: slot.table_name || null,
    }
  })
}

async function saveLayoutSlots(slots = tableLayoutSlots.value) {
  const layoutData = await saveTableLayout({ slots: serializeLayoutSlots(slots) })
  applyTableLayout(layoutData)
  errorMessage.value = ''
}

async function updateFloorColumnCount(index, value) {
  const nextCounts = normalizeFloorColumnCounts(floorColumnCounts.value)
  const nextCount = Math.max(Math.trunc(Number(value || 0) || 0), 0)
  const columnNumber = index + 1
  const currentColumnSlots = tableLayoutSlots.value
    .filter((slot) => Number(slot.column_index) === columnNumber)
    .toSorted(compareLayoutSlots)
  let nextSlots = tableLayoutSlots.value.filter((slot) => Number(slot.column_index) !== columnNumber)
  const resizedColumnSlots = currentColumnSlots.slice(0, nextCount)

  while (resizedColumnSlots.length < nextCount) {
    resizedColumnSlots.push({
      column_index: columnNumber,
      position_index: resizedColumnSlots.length + 1,
      table_name: null,
    })
  }

  nextCounts[index] = nextCount
  floorColumnCounts.value = nextCounts
  nextSlots = [...nextSlots, ...resizedColumnSlots]

  try {
    await saveLayoutSlots(nextSlots)
  } catch (error) {
    errorMessage.value = error.message
  }
}

async function placeTableInSlot(tableName, slotValue) {
  if (!tableName || !slotValue) return
  const [columnIndex, positionIndex] = slotValue.split('-').map(Number)
  const nextSlots = tableLayoutSlots.value.map((slot) => {
    if (slot.table_name === tableName) {
      return { ...slot, table_name: null }
    }
    if (
      Number(slot.column_index) === columnIndex
      && Number(slot.position_index) === positionIndex
    ) {
      return { ...slot, table_name: tableName }
    }
    return slot
  })

  try {
    await saveLayoutSlots(nextSlots)
    selectedSlotByTable.value = {
      ...selectedSlotByTable.value,
      [tableName]: '',
    }
  } catch (error) {
    errorMessage.value = error.message
  }
}

async function updateTableLayoutSlot(tableName, slotValue) {
  if (!tableName) return
  if (!slotValue) {
    await removeTableFromLayout(tableName)
    return
  }

  await placeTableInSlot(tableName, slotValue)
}

async function removeTableFromLayout(tableName) {
  const nextSlots = tableLayoutSlots.value.map((slot) =>
    slot.table_name === tableName ? { ...slot, table_name: null } : slot,
  )

  try {
    await saveLayoutSlots(nextSlots)
  } catch (error) {
    errorMessage.value = error.message
  }
}

function nextTableNumber() {
  const usedNumbers = tableNames.value
    .map((name) => Number(name.match(/\d+/)?.[0]))
    .filter((number) => Number.isFinite(number))

  let number = 1
  while (usedNumbers.includes(number)) {
    number += 1
  }
  return number
}

async function createTables() {
  const count = Math.max(Number(newTableCount.value || 1), 1)
  const capacity = Math.max(Number(defaultCapacity.value || 12), 1)
  let nextNumber = nextTableNumber()

  try {
    const created = []
    for (let index = 0; index < count; index += 1) {
      let tableName = ''

      if (tableNames.value.length === 0 && created.length === 0) {
        tableName = '主桌'
      } else {
        tableName = `第 ${nextNumber} 桌`
        while (tableNames.value.includes(tableName) || created.includes(tableName)) {
          nextNumber += 1
          tableName = `第 ${nextNumber} 桌`
        }
        nextNumber += 1
      }

      created.push(tableName)
      await saveTableSetting({ table_name: tableName, capacity })
    }
    await loadPlanningData()
  } catch (error) {
    errorMessage.value = error.message
  }
}

async function updateTableCapacity(tableName, value) {
  const capacity = Math.max(Number(value || 1), 1)

  try {
    const updated = await saveTableSetting({
      table_name: tableName,
      capacity,
    })
    const index = tableSettings.value.findIndex(
      (setting) => setting.table_name === updated.table_name,
    )
    if (index >= 0) {
      tableSettings.value[index] = updated
    } else {
      tableSettings.value.push(updated)
    }
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error.message
  }
}

async function assignGuest(guestId, tableName) {
  if (!guestId) return
  const guest = guests.value.find((item) => item.id === guestId)
  const targetTable = tables.value.find((table) => table.name === tableName)

  if (tableName && guest && targetTable && !canAssignGuestToTable(guest, targetTable)) {
    errorMessage.value = tableCapacityErrorMessage(guest, targetTable)
    return
  }

  try {
    const updated = await patchGuest(guestId, {
      allocated_table: tableName || null,
    })
    const index = guests.value.findIndex((guest) => guest.id === guestId)
    if (index >= 0) {
      guests.value[index] = updated
    }
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error.message
  }
}

async function addSelectedGuest(tableName) {
  if (assigningGuestByTable.value[tableName]) return

  const guestId =
    selectedGuestByTable.value[tableName] ||
    guestFromSearch(tableName)?.id ||
    ''

  if (!guestId) return

  assigningGuestByTable.value = {
    ...assigningGuestByTable.value,
    [tableName]: true,
  }

  try {
    await assignGuest(guestId, tableName)
    selectedGuestByTable.value = {
      ...selectedGuestByTable.value,
      [tableName]: '',
    }
    guestSearchByTable.value = {
      ...guestSearchByTable.value,
      [tableName]: '',
    }
  } finally {
    assigningGuestByTable.value = {
      ...assigningGuestByTable.value,
      [tableName]: false,
    }
  }
}

async function removeTable(tableName) {
  if (isLockedTableName(tableName)) {
    errorMessage.value = '主桌不可刪除'
    return
  }

  try {
    const guestsInTable = guests.value.filter(
      (guest) => guest.allocated_table === tableName,
    )

    for (const guest of guestsInTable) {
      await assignGuest(guest.id, null)
    }

    await deleteTableSetting(tableName)
    tableSettings.value = tableSettings.value.filter(
      (setting) => setting.table_name !== tableName,
    )
    await loadPlanningData()
    if (selectedTableName.value === tableName) {
      closeTableDialog()
    }
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error.message
  }
}

function guestSizeLabel(guest) {
  return `${guestAttendeeCount(guest)} 位`
}

function guestSearchLabel(guest) {
  const details = [guestSizeLabel(guest), guest.phone, guest.guest_category]
    .filter(Boolean)
    .join(' · ')
  return details ? `${guest.name}（${details}）` : guest.name
}

function normalizedSearch(value) {
  return String(value || '').trim().toLowerCase()
}

function guestMatchesSearch(guest, keyword) {
  if (!keyword) return true
  return [
    guest.name,
    guest.phone,
    guest.guest_category,
    guestSearchLabel(guest),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(keyword))
}

function searchableUnassignedGuests(table) {
  if (!table) return []

  const keyword = normalizedSearch(guestSearchByTable.value[table.name])
  return unassignedGuests.value
    .filter((guest) => canAssignGuestToTable(guest, table))
    .filter((guest) => guestMatchesSearch(guest, keyword))
    .slice(0, 30)
}

function guestFromSearch(tableName) {
  const keyword = normalizedSearch(guestSearchByTable.value[tableName])
  if (!keyword) return null

  return unassignedGuests.value.find((guest) => {
    const label = normalizedSearch(guestSearchLabel(guest))
    return label === keyword || normalizedSearch(guest.name) === keyword
  }) || null
}

function handleGuestSearchInput(tableName, value) {
  guestSearchByTable.value = {
    ...guestSearchByTable.value,
    [tableName]: value,
  }

  const matchedGuest = guestFromSearch(tableName)
  selectedGuestByTable.value = {
    ...selectedGuestByTable.value,
    [tableName]: matchedGuest?.id || '',
  }
}

function openTableDialog(table) {
  selectedTableName.value = table.name
}

function closeTableDialog() {
  selectedTableName.value = ''
}

function planningChairClass(table, chair) {
  return { 'is-occupied': chair <= Math.min(table.attendeeCount, table.capacity) }
}

function planningTableMetric(table) {
  return `${table.attendeeCount} / ${table.capacity}`
}

function planningTableClass(table) {
  return { 'is-over-capacity': table.isOverCapacity }
}

onMounted(loadPlanningData)
</script>

<template>
  <AdminLayout
    title="桌次安排"
    eyebrow="Table Planning"
    subtitle="調整桌數、容量與賓客座位"
  >
    <header class="admin-top">
      <div>
        <p class="eyebrow">Table Planning</p>
        <h1>桌次與座位配置</h1>
        <p class="lead">新增桌次、調整每桌容量，並把已確認出席的賓客安排到指定桌。</p>
      </div>
      <div class="toolbar">
        <button class="btn btn-dark" type="button" @click="loadPlanningData">
          重新整理
        </button>
      </div>
    </header>

    <section class="grid-4 guest-stats table-plan-stats">
      <article class="metric">
        <p class="metric-label">桌數</p>
        <p class="metric-value">{{ tables.length }}</p>
      </article>
      <article class="metric">
        <p class="metric-label">總容量</p>
        <p class="metric-value">{{ totalCapacity }}</p>
      </article>
      <article class="metric">
        <p class="metric-label">已安排組數</p>
        <p class="metric-value">{{ assignedGuestCount }}</p>
      </article>
      <article class="metric">
        <p class="metric-label">未分桌組數</p>
        <p class="metric-value">{{ unassignedGuests.length }}</p>
      </article>
    </section>

    <section class="panel table-create-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Create Tables</p>
          <h2>批次新增桌次</h2>
        </div>
      </div>

      <div class="form-grid two">
        <div class="field">
          <label for="new-table-count">新增桌數</label>
          <input
            id="new-table-count"
            v-model.number="newTableCount"
            class="field-control"
            type="number"
            min="1"
          />
        </div>
        <div class="field">
          <label for="default-capacity">每桌人數</label>
          <input
            id="default-capacity"
            v-model.number="defaultCapacity"
            class="field-control"
            type="number"
            min="1"
          />
        </div>
      </div>

      <div class="actions">
        <button class="btn btn-primary" type="button" @click="createTables">
          新增桌次
        </button>
      </div>
    </section>

    <p v-if="errorMessage" class="message message--error">{{ errorMessage }}</p>
    <p v-if="isLoading" class="message">載入中...</p>

    <section v-else class="table-planner">
      <section class="panel table-plan-venue-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Floor Plan</p>
            <h2>座位圖</h2>
          </div>
          <span class="badge badge-warn">{{ tables.length }} 個桌次</span>
        </div>

        <div class="floor-layout-controls" aria-label="桌位欄位設定">
          <label
            v-for="(_, index) in floorColumnCounts"
            :key="`floor-column-count-${index}`"
          >
            第 {{ index + 1 }} 欄桌數
            <input
              class="field-control"
              type="number"
              min="0"
              :value="floorColumnCounts[index]"
              @change="updateFloorColumnCount(index, $event.target.value)"
            />
          </label>
        </div>
        <p v-if="floorLayoutMessage" class="layout-note">{{ floorLayoutMessage }}</p>

        <VenueFloorPlan
          :main-table="mainTable"
          :floor-table-columns="floorTableColumns"
          :floor-table-rows="floorTableRows"
          :get-chair-class="planningChairClass"
          :get-table-metric="planningTableMetric"
          :get-table-class="planningTableClass"
          show-empty-slots
          @select-table="openTableDialog"
        />

        <p v-if="!mainTable" class="message">
          尚未建立桌次設定
        </p>
      </section>

      <aside class="panel unassigned-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Layout Queue</p>
            <h2>待安排桌次</h2>
          </div>
          <span class="badge badge-warn">{{ unplacedLayoutTables.length }} 桌</span>
        </div>

        <div class="unassigned-list">
          <article
            v-for="table in unplacedLayoutTables"
            :key="`layout-${table.table_name}`"
            class="seat-guest"
          >
            <div>
              <strong>{{ table.table_name }}</strong>
              <p class="guest-sub">每桌 {{ table.capacity }} 位</p>
            </div>
            <select
              class="field-control"
              :value="selectedSlotByTable[table.table_name] || ''"
              @change="placeTableInSlot(table.table_name, $event.target.value)"
            >
              <option value="">選擇空位</option>
              <option
                v-for="slot in emptyLayoutSlots"
                :key="slotKey(slot)"
                :value="slotKey(slot)"
              >
                {{ slotLabel(slot) }}
              </option>
            </select>
          </article>
        </div>

        <p v-if="unplacedLayoutTables.length === 0" class="message">
          所有桌次都已放進座位圖
        </p>

        <hr class="panel-divider" />

        <div class="section-head">
          <div>
            <p class="eyebrow">Unassigned</p>
            <h2>未分桌賓客</h2>
          </div>
          <span class="badge badge-warn">{{ unassignedGuests.length }} 組</span>
        </div>

        <div class="unassigned-list">
          <article
            v-for="guest in unassignedGuests"
            :key="guest.id"
            class="seat-guest"
          >
            <div>
              <strong>{{ guest.name }}</strong>
              <p class="guest-sub">{{ guestSizeLabel(guest) }} · {{ guest.phone }}</p>
            </div>
            <select
              class="field-control"
              :value="guest.allocated_table || ''"
              @change="assignGuest(guest.id, $event.target.value)"
            >
              <option value="">未分桌</option>
              <option
                v-for="table in tables"
                :key="table.name"
                :value="table.name"
                :disabled="!canAssignGuestToTable(guest, table)"
              >
                {{ table.name }}
              </option>
            </select>
          </article>
        </div>

        <p v-if="unassignedGuests.length === 0" class="message">
          所有出席賓客都已安排桌次
        </p>
      </aside>
    </section>

    <div
      v-if="selectedTable"
      class="dialog-backdrop"
      role="presentation"
      @click.self="closeTableDialog"
    >
      <section class="dialog-card" role="dialog" aria-modal="true">
        <div class="section-head">
          <div>
            <p class="eyebrow">Table Assignment</p>
            <h2>{{ selectedTable.name }}</h2>
            <p class="lead">
              已安排 {{ selectedTable.attendeeCount }} / {{ selectedTable.capacity }} 位。
            </p>
          </div>
          <button class="btn btn-ghost" type="button" @click="closeTableDialog">
            關閉
          </button>
        </div>

        <div class="capacity" :class="{ 'capacity--over': selectedTable.isOverCapacity }">
          <span :style="{ width: `${selectedTable.percent}%` }"></span>
        </div>

        <div class="table-dialog-controls">
          <label class="table-name-editor">
            桌次名稱
            <div class="table-name-editor__row">
              <input
                class="field-control"
                :value="tableNameDraft(selectedTable.name)"
                :disabled="isLockedTableName(selectedTable.name) || isRenamingSelectedTable"
                @input="handleTableNameInput(selectedTable.name, $event.target.value)"
              />
              <button
                class="btn btn-primary"
                type="button"
                :disabled="!canRenameSelectedTable"
                @click="renameTable(selectedTable.name)"
              >
                {{ isRenamingSelectedTable ? '修改中...' : '確認修改' }}
              </button>
            </div>
          </label>

          <label>
            座位圖位置
            <select
              class="field-control"
              :value="selectedTableLayoutSlot ? slotKey(selectedTableLayoutSlot) : ''"
              :disabled="isLockedTableName(selectedTable.name) || isRenamingSelectedTable"
              @change="updateTableLayoutSlot(selectedTable.name, $event.target.value)"
            >
              <option value="">待安排區</option>
              <option
                v-for="slot in selectedTableSlotOptions"
                :key="slotKey(slot)"
                :value="slotKey(slot)"
              >
                {{ slotLabel(slot) }}
              </option>
            </select>
          </label>

          <label>
            每桌人數
            <input
              class="field-control"
              type="number"
              min="1"
              :value="selectedTable.capacity"
              @change="updateTableCapacity(selectedTable.name, $event.target.value)"
            />
          </label>

          <button
            class="btn btn-ghost"
            type="button"
            :disabled="isLockedTableName(selectedTable.name) || isRenamingSelectedTable"
            @click="removeTable(selectedTable.name)"
          >
            刪除桌次
          </button>
          <button
            class="btn btn-ghost"
            type="button"
            :disabled="isLockedTableName(selectedTable.name) || !selectedTableLayoutSlot || isRenamingSelectedTable"
            @click="removeTableFromLayout(selectedTable.name)"
          >
            移到待安排區
          </button>
        </div>

        <div class="table-card-controls">
          <label>
            加入未分桌賓客
            <div class="guest-search-select">
              <input
                class="field-control"
                list="unassigned-guest-options"
                placeholder="搜尋姓名、電話或分類"
                :value="guestSearchByTable[selectedTable.name] || ''"
                :disabled="assigningGuestByTable[selectedTable.name]"
                @input="handleGuestSearchInput(selectedTable.name, $event.target.value)"
                @keydown.enter.prevent="addSelectedGuest(selectedTable.name)"
              />
              <datalist id="unassigned-guest-options">
                <option
                  v-for="guest in searchableUnassignedGuests(selectedTable)"
                  :key="guest.id"
                  :value="guestSearchLabel(guest)"
                />
              </datalist>
              <button
                class="btn btn-primary"
                type="button"
                :disabled="!selectedGuestByTable[selectedTable.name] || assigningGuestByTable[selectedTable.name]"
                @click="addSelectedGuest(selectedTable.name)"
              >
                {{ assigningGuestByTable[selectedTable.name] ? '加入中...' : '加入' }}
              </button>
            </div>
          </label>
          <p
            v-if="unassignedGuests.length > 0 && searchableUnassignedGuests(selectedTable).length === 0"
            class="guest-search-empty"
          >
            找不到可加入這桌的未分桌賓客
          </p>
        </div>

        <div class="seat-list">
          <article
            v-for="guest in selectedTable.guests"
            :key="guest.id"
            class="seat-guest"
          >
            <div>
              <strong>{{ guest.name }}</strong>
              <p class="guest-sub">
                {{ guestSizeLabel(guest) }} · 大人 {{ guest.total_adults }}
                <template v-if="guest.total_children > 0">
                  · 小孩 {{ guest.total_children }}
                </template>
              </p>
            </div>
            <select
              class="field-control"
              :value="guest.allocated_table || ''"
              @change="assignGuest(guest.id, $event.target.value)"
            >
              <option value="">移回未分桌</option>
              <option
                v-for="optionTable in tables"
                :key="optionTable.name"
                :value="optionTable.name"
                :disabled="!canAssignGuestToTable(guest, optionTable)"
              >
                {{ optionTable.name }}
              </option>
            </select>
          </article>

          <p v-if="selectedTable.guests.length === 0" class="message">
            這桌尚未安排賓客
          </p>
        </div>
      </section>
    </div>
  </AdminLayout>
</template>
