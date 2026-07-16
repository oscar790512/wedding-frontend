<script setup>
import { computed, onMounted, ref } from 'vue'

import { fetchAdminRsvpSettings, updateAdminRsvpSettings } from '../api/client'
import AdminLayout from '../components/AdminLayout.vue'
import { formatWeddingDate } from '../utils/date'

const rsvpDeadline = ref('')
const isLoading = ref(true)
const isSaving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const formattedDeadline = computed(() => formatWeddingDate(rsvpDeadline.value))

async function loadSettings() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    const settings = await fetchAdminRsvpSettings()
    rsvpDeadline.value = settings.rsvp_deadline || ''
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

async function saveSettings() {
  isSaving.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const settings = await updateAdminRsvpSettings({
      rsvp_deadline: rsvpDeadline.value || null,
    })
    rsvpDeadline.value = settings.rsvp_deadline || ''
    successMessage.value = rsvpDeadline.value
      ? 'RSVP 回覆截止日期已更新。'
      : 'RSVP 回覆截止日期已清除。'
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isSaving.value = false
  }
}

onMounted(loadSettings)
</script>

<template>
  <AdminLayout
    title="系統設定"
    eyebrow="Settings"
    subtitle="公開 RSVP 顯示設定"
  >
    <header class="admin-top">
      <div>
        <p class="eyebrow">Settings</p>
        <h1>系統設定</h1>
        <p class="lead">管理公開 RSVP 頁面會顯示的共用資訊。</p>
      </div>
    </header>

    <p v-if="isLoading" class="message">載入中...</p>

    <section v-else class="panel settings-panel">
      <div class="section-head settings-panel__head">
        <div>
          <p class="eyebrow">RSVP</p>
          <h2>回覆截止日期</h2>
          <p class="muted">儲存後，公開 RSVP 的婚禮資訊與表單上方會立即顯示相同日期。</p>
        </div>
      </div>

      <form class="settings-form" @submit.prevent="saveSettings">
        <div class="field">
          <label for="rsvp-deadline">截止日期</label>
          <input
            id="rsvp-deadline"
            v-model="rsvpDeadline"
            class="field-control"
            type="date"
          />
          <p v-if="formattedDeadline" class="settings-preview">
            公開頁面將顯示：請於 {{ formattedDeadline }}前完成回覆。
          </p>
          <p v-else class="settings-preview">未設定時，公開 RSVP 不顯示截止日期。</p>
        </div>

        <p v-if="errorMessage" class="message message--error">{{ errorMessage }}</p>
        <p v-if="successMessage" class="success-note is-visible">{{ successMessage }}</p>

        <div class="actions">
          <button class="btn btn-primary" type="submit" :disabled="isSaving">
            {{ isSaving ? '儲存中...' : '儲存設定' }}
          </button>
        </div>
      </form>
    </section>
  </AdminLayout>
</template>
