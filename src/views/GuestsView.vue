<script setup>
import { computed, onMounted, ref, watch } from 'vue'

import { fetchGuests } from '../api/client'
import AdminLayout from '../components/AdminLayout.vue'

const guests = ref([])
const searchQuery = ref('')
const quickFilter = ref('all')
const isLoading = ref(false)
const errorMessage = ref('')

const filteredGuests = computed(() =>
  guests.value.filter((guest) => {
    if (quickFilter.value === 'attend') {
      return guest.status === 'attend'
    }
    if (quickFilter.value === 'shipping') {
      return guest.need_invitation || guest.decline_response === 'request_cake'
    }
    if (quickFilter.value === 'undecided') {
      return guest.status === 'undecided'
    }
    if (quickFilter.value === 'decline') {
      return guest.status === 'decline'
    }
    return true
  }),
)

const listStats = computed(() => {
  const total = guests.value.length
  const attend = guests.value.filter((guest) => guest.status === 'attend').length
  const shipping = guests.value.filter(
    (guest) => guest.need_invitation || guest.decline_response === 'request_cake',
  ).length
  const undecided = guests.value.filter((guest) => guest.status === 'undecided').length

  return [
    { label: '全部名單', value: total },
    { label: '確認出席', value: attend },
    { label: '寄送待辦', value: shipping },
    { label: '未回覆', value: undecided },
  ]
})

async function loadGuests() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    guests.value = await fetchGuests(searchQuery.value.trim())
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

function statusLabel(status) {
  if (status === 'attend') return '出席'
  if (status === 'decline') return '不出席'
  return '未決定'
}

function shippingLabel(guest) {
  if (guest.need_invitation && !guest.invitation_address) {
    return '喜帖待補地址'
  }
  if (guest.need_invitation) {
    return '喜帖可寄送'
  }
  if (guest.decline_response === 'request_cake' && !guest.shipping_address) {
    return '喜餅待補地址'
  }
  if (guest.decline_response === 'request_cake') {
    return '喜餅待追蹤'
  }
  return '無寄送待辦'
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
    title="賓客管理"
    eyebrow="Guest Management"
    subtitle="名單、篩選、寄送待辦"
  >
    <header class="admin-top">
      <div>
        <p class="eyebrow">Guest management</p>
        <h1>完整賓客名單</h1>
        <p class="lead">集中整理 RSVP、桌號、飲食需求、喜帖喜餅與內部備註。</p>
      </div>
      <div class="toolbar">
        <span class="badge badge-neutral">新增 / 匯出待後端支援</span>
      </div>
    </header>

    <section class="grid-4 guest-stats">
      <article v-for="item in listStats" :key="item.label" class="metric">
        <p class="metric-label">{{ item.label }}</p>
        <p class="metric-value">{{ item.value }}</p>
      </article>
    </section>

    <section class="panel guest-toolbar">
      <div class="form-grid two">
        <div class="field">
          <label for="guest-search">搜尋姓名、電話、分類或桌號</label>
          <input
            id="guest-search"
            v-model="searchQuery"
            class="field-control"
            type="search"
            placeholder="例如：林怡君、0912、女方親友、A 主桌旁"
            autocomplete="off"
          />
        </div>

        <div class="field">
          <span class="field-label">快速篩選</span>
          <div class="segmented segmented--guests">
            <button
              v-for="filter in [
                ['all', '全部'],
                ['attend', '出席'],
                ['shipping', '寄送待辦'],
                ['undecided', '未回覆'],
                ['decline', '不出席'],
              ]"
              :key="filter[0]"
              type="button"
              :class="{ 'is-active': quickFilter === filter[0] }"
              @click="quickFilter = filter[0]"
            >
              {{ filter[1] }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <p v-if="errorMessage" class="message message--error">{{ errorMessage }}</p>
    <p v-if="isLoading" class="message">載入中...</p>

    <section v-else class="guest-table">
      <article
        v-for="guest in filteredGuests"
        :key="guest.id"
        class="guest-row"
      >
        <div>
          <p class="guest-name">{{ guest.name }}</p>
          <p class="guest-sub">{{ guest.phone }}</p>
        </div>

        <div class="status-line">
          <span class="badge" :class="`badge--${guest.status}`">
            {{ statusLabel(guest.status) }}
          </span>
        </div>

        <div>
          <p class="guest-name">{{ guest.allocated_table || '未分桌' }}</p>
          <p class="guest-sub">{{ shippingLabel(guest) }}</p>
        </div>

        <div class="guest-sub guest-row__details">
          <span>大人 {{ guest.total_adults }}</span>
          <span>小孩 {{ guest.total_children }}</span>
          <span>兒童座椅 {{ guest.child_seats }}</span>
        </div>

        <div class="guest-sub">
          <span v-if="guest.diet_notes">飲食：{{ guest.diet_notes }}</span>
          <span v-else-if="guest.admin_notes">備註：{{ guest.admin_notes }}</span>
          <span v-else>無特殊備註</span>
        </div>
      </article>

      <p v-if="filteredGuests.length === 0" class="message">
        找不到符合條件的賓客
      </p>
    </section>
  </AdminLayout>
</template>
