<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { login } from '../api/client'
import { useAuth } from '../composables/useAuth'

const route = useRoute()
const router = useRouter()
const { setSession } = useAuth()

const form = reactive({
  username: '',
  password: '',
})

const isSubmitting = ref(false)
const errorMessage = ref('')

async function handleSubmit() {
  errorMessage.value = ''
  isSubmitting.value = true

  try {
    const data = await login(form.username, form.password)
    setSession(data)
    const redirect = route.query.redirect || '/admin/dashboard'
    router.push(String(redirect))
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <section class="auth-hero">
      <p class="eyebrow">Wedding System</p>
      <h1>保留既有登入驗證，重整後台工作區架構。</h1>
      <p class="auth-hero__lead">
        管理端登入功能維持原本 JWT 流程。登入後可進入統計大盤、賓客管理與現場工作台。
      </p>
    </section>

    <form class="card auth-card" @submit.prevent="handleSubmit">
      <p class="eyebrow">Admin Login</p>
      <h2>管理後台登入</h2>
      <p class="auth-card__subtitle">新人與工作人員專用</p>

      <label class="field">
        <span>帳號</span>
        <input v-model="form.username" required autocomplete="username" />
      </label>

      <label class="field">
        <span>密碼</span>
        <input
          v-model="form.password"
          type="password"
          required
          autocomplete="current-password"
        />
      </label>

      <p v-if="errorMessage" class="message message--error">{{ errorMessage }}</p>

      <button class="btn btn-primary" type="submit" :disabled="isSubmitting">
        {{ isSubmitting ? '登入中...' : '登入' }}
      </button>
    </form>
  </div>
</template>
