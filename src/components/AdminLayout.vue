<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  eyebrow: {
    type: String,
    default: 'Wedding Admin',
  },
  subtitle: {
    type: String,
    default: '',
  },
})

const router = useRouter()
const { username, clearSession } = useAuth()
const sidebarStorageKey = 'adminSidebarCollapsed'
const isSidebarCollapsed = ref(localStorage.getItem(sidebarStorageKey) === 'true')

const navItems = [
  { to: '/admin/dashboard', label: '統計大盤' },
  { to: '/admin/guests', label: '賓客管理' },
  { to: '/admin/shipping', label: '寄送待辦' },
  { to: '/admin/tables', label: '桌次安排' },
  { to: '/admin/operations', label: '現場工作台' },
]

function logout() {
  clearSession()
  router.push('/login')
}

function toggleSidebar() {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
  localStorage.setItem(sidebarStorageKey, String(isSidebarCollapsed.value))
}
</script>

<template>
  <div class="admin-shell">
    <nav class="nav">
      <div class="container nav-inner">
        <RouterLink class="brand" to="/admin/dashboard">
          <span class="brand-mark">囍</span>
          <span>Wedding Admin</span>
        </RouterLink>

        <div class="nav-links">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
          >
            {{ item.label }}
          </RouterLink>
          <button type="button" @click="logout">
            登出
          </button>
        </div>
      </div>
    </nav>

    <div class="admin-layout" :class="{ 'is-sidebar-collapsed': isSidebarCollapsed }">
      <aside class="sidebar">
        <div class="sidebar-head">
          <div class="sidebar-title">
            <p class="eyebrow">{{ props.eyebrow }}</p>
            <h3>{{ props.title }}</h3>
          </div>
          <button
            class="sidebar-toggle"
            type="button"
            :aria-label="isSidebarCollapsed ? '展開左側欄' : '收合左側欄'"
            :title="isSidebarCollapsed ? '展開' : '收合'"
            @click="toggleSidebar"
          >
            {{ isSidebarCollapsed ? '›' : '‹' }}
          </button>
        </div>

        <div class="side-group">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="side-link"
            :title="item.label"
          >
            <span class="side-link-label">{{ item.label }}</span>
            <span class="side-link-short" aria-hidden="true">{{ item.label.slice(0, 1) }}</span>
            <span v-if="item.label === props.title">•</span>
          </RouterLink>
        </div>

        <p v-if="props.subtitle" class="sidebar-note">
          {{ props.subtitle }}
        </p>
        <p class="sidebar-user">登入：{{ username }}</p>
      </aside>

      <main class="admin-main">
        <slot />
      </main>
    </div>
  </div>
</template>
