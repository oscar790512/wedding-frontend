<script setup>
import { reactive, ref, watch } from 'vue'

import { submitRsvp } from '../api/client'

const form = reactive({
  name: '',
  phone: '',
  status: 'attend',
  total_adults: 1,
  total_children: 0,
  child_seats: 0,
  diet_notes: '',
  need_invitation: false,
  invitation_address: '',
  decline_response: '',
  blessing_message: '',
})

const isSubmitting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

watch(
  () => form.need_invitation,
  (needInvitation) => {
    if (!needInvitation) {
      form.invitation_address = ''
    }
  },
)

watch(
  () => form.total_children,
  (totalChildren) => {
    if (totalChildren <= 0) {
      form.child_seats = 0
    }
  },
)

watch(
  () => form.status,
  (status) => {
    if (status === 'decline') {
      form.total_adults = 0
      form.total_children = 0
      form.child_seats = 0
      form.diet_notes = ''
      form.need_invitation = false
      form.invitation_address = ''
    } else {
      form.decline_response = ''
      if (form.total_adults < 1) {
        form.total_adults = 1
      }
    }
  },
)

async function handleSubmit() {
  errorMessage.value = ''
  successMessage.value = ''

  if (form.status === 'attend') {
    if (form.need_invitation && !form.invitation_address.trim()) {
      errorMessage.value = '需要喜帖時請填寫寄送地址'
      return
    }

    if (form.total_children > 0 && form.child_seats > form.total_children) {
      errorMessage.value = '兒童座椅數量不可超過小孩人數'
      return
    }
  } else if (!form.decline_response) {
    errorMessage.value = '無法出席時請選擇一個回覆選項'
    return
  }

  isSubmitting.value = true

  try {
    await submitRsvp({
      ...form,
      diet_notes: form.diet_notes.trim() || null,
      child_seats: form.total_children > 0 ? form.child_seats : 0,
      invitation_address: form.need_invitation
        ? form.invitation_address.trim()
        : null,
      decline_response:
        form.status === 'decline' ? form.decline_response : null,
      blessing_message: form.blessing_message.trim() || null,
    })
    successMessage.value =
      form.status === 'decline'
        ? '已收到您的回覆，謝謝您的祝福！'
        : '已收到您的回覆，期待與您見面！'
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

        <label v-if="form.total_children > 0" class="field">
          <span>兒童座椅數量 *</span>
          <input
            v-model.number="form.child_seats"
            type="number"
            min="0"
            :max="form.total_children"
            required
            placeholder="需要幾張兒童座椅"
          />
        </label>

        <label class="field">
          <span>飲食需求</span>
          <input
            v-model="form.diet_notes"
            maxlength="500"
            placeholder="例如：素食、過敏食材"
          />
        </label>

        <label class="checkbox-field">
          <input v-model="form.need_invitation" type="checkbox" />
          <span>需要喜帖</span>
        </label>

        <label v-if="form.need_invitation" class="field">
          <span>喜帖寄送地址 *</span>
          <textarea
            v-model="form.invitation_address"
            rows="3"
            maxlength="500"
            required
            placeholder="請填寫完整收件地址"
          />
        </label>
      </template>

      <template v-else-if="form.status === 'decline'">
        <fieldset class="field">
          <legend>無法出席回覆 *</legend>
          <div class="radio-group radio-group--stacked">
            <label class="radio-chip">
              <input
                v-model="form.decline_response"
                required
                type="radio"
                value="blessing_only"
              />
              <span>無法到場，在此致上誠摯的祝福</span>
            </label>
            <label class="radio-chip">
              <input
                v-model="form.decline_response"
                required
                type="radio"
                value="request_cake"
              />
              <span>無法到場，此外我希望收到喜餅祝福你們分享的喜悅！</span>
            </label>
          </div>
        </fieldset>
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
