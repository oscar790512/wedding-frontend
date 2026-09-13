<script setup>
import { computed, onMounted, ref } from 'vue'

import {
  deleteTableSetting,
  fetchGuests,
  fetchTableSettings,
  patchGuest,
  renameTableSetting,
  saveTableSetting,
} from '../api/client'
import AdminLayout from '../components/AdminLayout.vue'
import VenueFloorPlan from '../components/VenueFloorPlan.vue'
import {
  DEFAULT_FLOOR_COLUMN_COUNTS,
  buildIndependentFloorTableColumns,
  buildFloorTableRows,
  canAssignGuestToTable,
  guestAttendeeCount,
  normalizeFloorColumnCounts,
  normalizeFloorColumnLayout,
  reconcileFloorColumnLayout,
  tableAttendeeCount,
  tableCapacityErrorMessage,
} from '../utils/tablePlan'

const TABLE_LAYOUT_STORAGE_KEY = 'wedding.floorColumnCounts'
const TABLE_LAYOUT_ASSIGNMENTS_STORAGE_KEY = 'wedding.floorColumnAssignments'
const guests = ref([])
const tableSettings = ref([])
const isLoading = ref(false)
const errorMessage = ref('')
const newTableCount = ref(1)
const defaultCapacity = ref(12)
const floorColumnCounts = ref(loadFloorColumnCounts())
const floorColumnLayout = ref(loadFloorColumnLayout())
const selectedGuestByTable = ref({})
const guestSearchByTable = ref({})
const assigningGuestByTable = ref({})
const tableNameDrafts = ref({})
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

const floorTableColumns = computed(() =>
  buildIndependentFloorTableColumns(tables.value, mainTable.value?.name, floorColumnLayout.value),
)

const floorTableCount = computed(() =>
  mainTable.value ? Math.max(tables.value.length - 1, 0) : tables.value.length,
)

const floorColumnTotal = computed(() =>
  floorColumnCounts.value.reduce((sum, count) => sum + Number(count || 0), 0),
)

const floorLayoutMessage = computed(() => {
  if (floorColumnTotal.value === floorTableCount.value) return ''
  if (floorColumnTotal.value < floorTableCount.value) {
    return `四欄目前設定 ${floorColumnTotal.value} 桌，尚有 ${floorTableCount.value - floorColumnTotal.value} 桌會先接在第 4 欄。`
  }
  return `四欄目前設定 ${floorColumnTotal.value} 個位置，已超過一般桌數 ${floorTableCount.value} 桌，多出的欄位位置會留空。`
})

const selectedTable = computed(() =>
  tables.value.find((table) => table.name === selectedTableName.value) || null,
)

const assignedGuestCount = computed(() =>
  attendingGuests.value.length - unassignedGuests.value.length,
)

async function loadPlanningData() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    const [guestData, settingData] = await Promise.all([
      fetchGuests(''),
      fetchTableSettings(),
    ])
    guests.value = guestData
    tableSettings.value = settingData
    tableNameDrafts.value = Object.fromEntries(
      settingData.map((setting) => [setting.table_name, setting.table_name]),
    )
    syncFloorColumnLayout()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

async function renameTable(oldTableName, value) {
  if (isLockedTableName(oldTableName)) return

  const newTableName = value.trim()
  if (!newTableName || newTableName === oldTableName) {
    tableNameDrafts.value = {
      ...tableNameDrafts.value,
      [oldTableName]: oldTableName,
    }
    return
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
    errorMessage.value = ''
  } catch (error) {
    tableNameDrafts.value = {
      ...tableNameDrafts.value,
      [oldTableName]: oldTableName,
    }
    errorMessage.value = error.message
  }
}

function handleTableNameInput(tableName, value) {
  if (isLockedTableName(tableName)) return
  tableNameDrafts.value = {
    ...tableNameDrafts.value,
    [tableName]: value,
  }
}

function isLockedTableName(tableName) {
  return tableName === '主桌'
}

function loadFloorColumnCounts() {
  try {
    const saved = JSON.parse(localStorage.getItem(TABLE_LAYOUT_STORAGE_KEY) || 'null')
    return normalizeFloorColumnCounts(saved?.length ? saved : DEFAULT_FLOOR_COLUMN_COUNTS)
  } catch {
    return [...DEFAULT_FLOOR_COLUMN_COUNTS]
  }
}

function loadFloorColumnLayout() {
  try {
    return normalizeFloorColumnLayout(
      JSON.parse(localStorage.getItem(TABLE_LAYOUT_ASSIGNMENTS_STORAGE_KEY) || 'null'),
    )
  } catch {
    return normalizeFloorColumnLayout(null)
  }
}

function saveFloorColumnLayout(layout) {
  floorColumnLayout.value = layout
  localStorage.setItem(TABLE_LAYOUT_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(layout))
}

function syncFloorColumnLayout() {
  saveFloorColumnLayout(
    reconcileFloorColumnLayout(
      tables.value,
      mainTable.value?.name,
      floorColumnLayout.value,
      floorColumnCounts.value,
    ),
  )
}

function updateFloorColumnCount(index, value) {
  const nextCounts = normalizeFloorColumnCounts(floorColumnCounts.value)
  const nextLayout = normalizeFloorColumnLayout(floorColumnLayout.value)
  const nextCount = Math.max(Math.trunc(Number(value || 0) || 0), 0)

  nextLayout[index] = nextLayout[index].slice(0, nextCount)
  while (nextLayout[index].length < nextCount) {
    nextLayout[index].push(null)
  }

  nextCounts[index] = nextCount
  floorColumnCounts.value = nextCounts
  localStorage.setItem(TABLE_LAYOUT_STORAGE_KEY, JSON.stringify(nextCounts))
  saveFloorColumnLayout(
    reconcileFloorColumnLayout(
      tables.value,
      mainTable.value?.name,
      nextLayout,
      nextCounts,
    ),
  )
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
          @select-table="openTableDialog"
        />

        <p v-if="!mainTable" class="message">
          尚未建立桌次設定
        </p>
      </section>

      <aside class="panel unassigned-panel">
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
            <input
              class="field-control"
              :value="tableNameDrafts[selectedTable.name] ?? selectedTable.name"
              :disabled="isLockedTableName(selectedTable.name)"
              @input="handleTableNameInput(selectedTable.name, $event.target.value)"
              @blur="renameTable(selectedTable.name, $event.target.value)"
              @keydown.enter.prevent="renameTable(selectedTable.name, $event.target.value)"
            />
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
            :disabled="isLockedTableName(selectedTable.name)"
            @click="removeTable(selectedTable.name)"
          >
            刪除桌次
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
