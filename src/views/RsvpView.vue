<script setup>
import { reactive, ref } from 'vue'

import { submitRsvp } from '../api/client'

const form = reactive({
  name: '',
  phone: '',
  status: 'attend',
  total_adults: 1,
  total_children: 0,
  diet_notes: '',
  need_cake: false,
  blessing_message: '',
})

const isSubmitting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

async function handleSubmit() {
  errorMessage.value = ''
  successMessage.value = ''
  isSubmitting.value = true

  try {
    await submitRsvp({
      ...form,
      diet_notes: form.diet_notes.trim() || null,
      blessing_message: form.blessing_message.trim() || null,
    })
    successMessage.value = '已收到您的回覆，期待與您見面！'
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="rsvp-page">
    <div class="rsvp-hero">
      <p class="eyebrow">Wedding Invitation</p>
      <h1>誠摯邀請您<br />一同見證我們的幸福</h1>
      <p class="rsvp-hero__subtitle">
        請填寫以下資料，讓我們為您準備座位與餐點。
      </p>
    </div>

    <form class="card rsvp-form" @submit.prevent="handleSubmit">
      <label class="field">
        <span>姓名 *</span>
        <input v-model="form.name" required maxlength="100" placeholder="請輸入姓名" />
      </label>

      <label class="field">
        <span>聯絡電話 *</span>
        <input
          v-model="form.phone"
          required
          inputmode="tel"
          maxlength="20"
          placeholder="09xxxxxxxx"
        />
      </label>

      <fieldset class="field">
        <legend>出席意願 *</legend>
        <div class="radio-group">
          <label class="radio-chip">
            <input v-model="form.status" type="radio" value="attend" />
            <span>我會出席</span>
          </label>
          <label class="radio-chip">
            <input v-model="form.status" type="radio" value="decline" />
            <span>無法出席</span>
          </label>
        </div>
      </fieldset>

      <template v-if="form.status === 'attend'">
        <div class="field-row">
          <label class="field">
            <span>大人數 *</span>
            <input
              v-model.number="form.total_adults"
              type="number"
              min="1"
              required
            />
          </label>
          <label class="field">
            <span>小孩數</span>
            <input
              v-model.number="form.total_children"
              type="number"
              min="0"
            />
          </label>
        </div>

        <label class="field">
          <span>飲食需求</span>
          <input
            v-model="form.diet_notes"
            maxlength="500"
            placeholder="例如：素食、過敏食材"
          />
        </label>

        <label class="checkbox-field">
          <input v-model="form.need_cake" type="checkbox" />
          <span>需要喜餅</span>
        </label>
      </template>

      <label class="field">
        <span>祝福留言</span>
        <textarea
          v-model="form.blessing_message"
          rows="4"
          maxlength="1000"
          placeholder="想對新人說的話..."
        />
      </label>

      <p v-if="errorMessage" class="message message--error">{{ errorMessage }}</p>
      <p v-if="successMessage" class="message message--success">
        {{ successMessage }}
      </p>

      <button class="btn btn-primary" type="submit" :disabled="isSubmitting">
        {{ isSubmitting ? '送出中...' : '送出 RSVP' }}
      </button>
    </form>
  </div>
</template>
