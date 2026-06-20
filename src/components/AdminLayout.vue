<script setup>
import { useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'

defineProps({
  title: {
    type: String,
    required: true,
  },
})

const router = useRouter()
const { username, clearSession } = useAuth()

function logout() {
  clearSession()
  router.push('/login')
}
</script>

<template>
  <div class="admin-page">
    <header class="admin-header">
      <div>
        <p class="eyebrow">Wedding Admin</p>
        <h1>{{ title }}</h1>
      </div>
      <div class="admin-header__actions">
        <span class="admin-user">{{ username }}</span>
        <button type="button" class="btn btn-ghost" @click="logout">
          登出
        </button>
      </div>
    </header>

    <nav class="admin-nav">
      <RouterLink to="/admin/dashboard">統計大盤</RouterLink>
      <RouterLink to="/admin/checkin">現場簽到</RouterLink>
    </nav>

    <main class="admin-content">
      <slot />
    </main>
  </div>
</template>
