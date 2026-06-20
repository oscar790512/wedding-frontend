<script setup>
import { onMounted, ref } from 'vue'

import { fetchSummary } from '../api/client'
import AdminLayout from '../components/AdminLayout.vue'
import StatCard from '../components/StatCard.vue'

const summary = ref(null)
const errorMessage = ref('')
const isLoading = ref(true)

async function loadSummary() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    summary.value = await fetchSummary()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

onMounted(loadSummary)
</script>

<template>
  <AdminLayout title="統計大盤">
    <p v-if="isLoading" class="message">載入中...</p>
    <p v-else-if="errorMessage" class="message message--error">
      {{ errorMessage }}
    </p>

    <section v-else-if="summary" class="stat-grid">
      <StatCard label="總 RSVP 組數" :value="summary.total_guests" />
      <StatCard label="確認出席組數" :value="summary.attending_households" />
      <StatCard label="預計出席人數" :value="summary.total_attendees" />
      <StatCard
        label="大人 / 小孩"
        :value="`${summary.total_adults} / ${summary.total_children}`"
      />
      <StatCard label="素食需求" :value="summary.vegetarian_count" />
      <StatCard label="喜帖需求" :value="summary.invitation_count" />
      <StatCard
        label="禮金總額"
        :value="`$${Number(summary.total_gift_amount).toLocaleString()}`"
      />
      <StatCard label="已到場" :value="summary.arrived_count" />
    </section>

    <button class="btn btn-ghost refresh-btn" type="button" @click="loadSummary">
      重新整理
    </button>
  </AdminLayout>
</template>
