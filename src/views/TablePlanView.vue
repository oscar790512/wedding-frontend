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
import {
  canAssignGuestToTable,
  guestAttendeeCount,
  tableAttendeeCount,
  tableCapacityErrorMessage,
} from '../utils/tablePlan'

const guests = ref([])
const tableSettings = ref([])
const isLoading = ref(false)
const errorMessage = ref('')
const newTableCount = ref(1)
const defaultCapacity = ref(12)
const selectedGuestByTable = ref({})
const tableNameDrafts = ref({})
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
  const guestId = selectedGuestByTable.value[tableName]
  await assignGuest(guestId, tableName)
  selectedGuestByTable.value = {
    ...selectedGuestByTable.value,
    [tableName]: '',
  }
}

async function removeTable(tableName) {
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
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error.message
  }
}

function guestSizeLabel(guest) {
  return `${guestAttendeeCount(guest)} 位`
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
      <aside class="panel unassigned-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Unassigned</p>
            <h2>未分桌賓客</h2>
          </div>
          <span class="badge badge-warn">{{ unassignedGuests.length }} 組</span>
        </div>

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

        <p v-if="unassignedGuests.length === 0" class="message">
          所有出席賓客都已安排桌次
        </p>
      </aside>

      <div class="table-plan-board">
        <article v-for="table in tables" :key="table.name" class="table-plan-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">{{ table.attendeeCount }} / {{ table.capacity }} 位</p>
              <label class="table-name-editor">
                桌次名稱
                <input
                  class="field-control"
                  :value="tableNameDrafts[table.name] ?? table.name"
                  :disabled="isLockedTableName(table.name)"
                  @input="handleTableNameInput(table.name, $event.target.value)"
                  @blur="renameTable(table.name, $event.target.value)"
                  @keydown.enter.prevent="renameTable(table.name, $event.target.value)"
                />
              </label>
            </div>
            <button
              class="btn btn-ghost"
              type="button"
              @click="removeTable(table.name)"
            >
              刪除桌次
            </button>
          </div>

          <div class="capacity" :class="{ 'capacity--over': table.isOverCapacity }">
            <span :style="{ width: `${table.percent}%` }"></span>
          </div>

          <div class="table-card-controls">
            <label>
              每桌人數
              <input
                class="field-control"
                type="number"
                min="1"
                :value="table.capacity"
                @change="updateTableCapacity(table.name, $event.target.value)"
              />
            </label>
            <label>
              加入賓客
              <select
                v-model="selectedGuestByTable[table.name]"
                class="field-control"
                @change="addSelectedGuest(table.name)"
              >
                <option value="">選擇未分桌賓客</option>
                <option
                  v-for="guest in unassignedGuests"
                  :key="guest.id"
                  :value="guest.id"
                  :disabled="!canAssignGuestToTable(guest, table)"
                >
                  {{ guest.name }}（{{ guestSizeLabel(guest) }}）
                </option>
              </select>
            </label>
          </div>

          <div class="seat-list">
            <article
              v-for="guest in table.guests"
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

            <p v-if="table.guests.length === 0" class="message">
              這桌尚未安排賓客
            </p>
          </div>
        </article>
      </div>
    </section>
  </AdminLayout>
</template>
