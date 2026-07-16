<script setup>
import { chairStyle } from '../utils/tablePlan'

defineProps({
  mainTable: {
    type: Object,
    default: null,
  },
  floorTableRows: {
    type: Array,
    default: () => [],
  },
  getChairClass: {
    type: Function,
    required: true,
  },
  getTableMetric: {
    type: Function,
    required: true,
  },
  getTableClass: {
    type: Function,
    default: () => '',
  },
})

const emit = defineEmits(['select-table'])

function selectTable(table) {
  emit('select-table', table)
}
</script>

<template>
  <div class="venue-floor-plan">
    <div class="venue-floor-plan__scale">
      <div class="venue-stage">
        <span>舞台</span>
      </div>

      <div v-if="mainTable" class="venue-main-table">
        <button
          class="round-table round-table--main"
          :class="getTableClass(mainTable)"
          type="button"
          @click="selectTable(mainTable)"
        >
          <span
            v-for="chair in mainTable.capacity"
            :key="`main-chair-${chair}`"
            class="round-table__chair"
            :class="getChairClass(mainTable, chair)"
            :style="chairStyle(chair - 1, mainTable.capacity)"
            aria-hidden="true"
          ></span>
          <span class="round-table__center">
            <strong>{{ mainTable.name }}</strong>
            <span>{{ getTableMetric(mainTable) }}</span>
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
              :class="getTableClass(table)"
              type="button"
              @click="selectTable(table)"
            >
              <span
                v-for="chair in table.capacity"
                :key="`${table.name}-chair-${chair}`"
                class="round-table__chair"
                :class="getChairClass(table, chair)"
                :style="chairStyle(chair - 1, table.capacity)"
                aria-hidden="true"
              ></span>
              <span class="round-table__center">
                <strong>{{ table.name }}</strong>
                <span>{{ getTableMetric(table) }}</span>
              </span>
            </button>
          </div>

          <div class="venue-table-side venue-table-side--right">
            <button
              v-for="table in row.rightTables"
              :key="table.name"
              class="round-table"
              :class="getTableClass(table)"
              type="button"
              @click="selectTable(table)"
            >
              <span
                v-for="chair in table.capacity"
                :key="`${table.name}-chair-${chair}`"
                class="round-table__chair"
                :class="getChairClass(table, chair)"
                :style="chairStyle(chair - 1, table.capacity)"
                aria-hidden="true"
              ></span>
              <span class="round-table__center">
                <strong>{{ table.name }}</strong>
                <span>{{ getTableMetric(table) }}</span>
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
</template>
