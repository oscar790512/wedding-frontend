<script setup>
import { onMounted, ref, watch } from 'vue'

import { fetchGuests, patchGuest } from '../api/client'
import AdminLayout from '../components/AdminLayout.vue'

const guests = ref([])
const searchQuery = ref('')
const errorMessage = ref('')
const isLoading = ref(false)
const pendingGiftTimers = new Map()

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

let searchTimer
watch(searchQuery, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadGuests, 300)
})

onMounted(loadGuests)
</script>

<template>
  <AdminLayout title="現場簽到 / 收禮">
    <div class="checkin-search card">
      <label class="field">
        <span>搜尋賓客（姓名或電話）</span>
        <input
          v-model="searchQuery"
          type="search"
          placeholder="輸入關鍵字..."
          autocomplete="off"
        />
      </label>
    </div>

    <p v-if="errorMessage" class="message message--error">{{ errorMessage }}</p>
    <p v-if="isLoading" class="message">載入中...</p>

    <ul v-else class="guest-list">
      <li v-for="guest in guests" :key="guest.id" class="guest-item card">
        <div class="guest-item__info">
          <div class="guest-item__header">
            <h2>{{ guest.name }}</h2>
            <span class="badge" :class="`badge--${guest.status}`">
              {{ statusLabel(guest.status) }}
            </span>
          </div>
          <p class="guest-item__phone">{{ guest.phone }}</p>
          <p v-if="guest.status === 'decline' && guest.will_send_gift" class="guest-item__meta">
            無法出席 · 仍會包禮金
          </p>
          <p v-if="guest.total_children > 0" class="guest-item__meta">
            小孩 {{ guest.total_children }} 位
            <template v-if="guest.child_seats > 0">
              · 兒童座椅 {{ guest.child_seats }} 張
            </template>
          </p>
          <p v-if="guest.allocated_table" class="guest-item__meta">
            桌號：{{ guest.allocated_table }}
          </p>
          <p v-if="guest.need_invitation && guest.invitation_address" class="guest-item__meta">
            喜帖地址：{{ guest.invitation_address }}
          </p>
        </div>

        <div class="guest-item__actions">
          <label class="toggle-field">
            <input
              type="checkbox"
              :checked="guest.is_arrived"
              @change="handleArrivedChange(guest, $event.target.checked)"
            />
            <span>已到場</span>
          </label>

          <label class="field gift-field">
            <span>禮金</span>
            <input
              type="number"
              min="0"
              step="100"
              :value="guest.gift_amount"
              @input="handleGiftInput(guest, $event.target.value)"
            />
          </label>
        </div>
      </li>
    </ul>

    <p v-if="!isLoading && guests.length === 0" class="message">
      找不到符合條件的賓客
    </p>
  </AdminLayout>
</template>
