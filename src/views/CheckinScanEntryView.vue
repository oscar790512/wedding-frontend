<script setup>
import { computed } from 'vue'

import { useAuth } from '../composables/useAuth'
import CheckinView from './CheckinView.vue'

const { isAuthenticated } = useAuth()
const showAdminCheckin = computed(() => isAuthenticated.value)
</script>

<template>
  <CheckinView v-if="showAdminCheckin" />
  <main v-else class="public-checkin-scan">
    <section class="public-checkin-scan__panel">
      <p class="eyebrow">婚禮報到 QR Code</p>
      <h1>請出示此畫面給工作人員掃描</h1>
      <p class="message">
        這組 QR Code 只能由已登入的工作人員在後台掃描簽到，直接用手機相機開啟不會完成報到。
      </p>
    </section>
  </main>
</template>
