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
  shipping_address: '',
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
      form.shipping_address = ''
      if (form.total_adults < 1) {
        form.total_adults = 1
      }
    }
  },
)

watch(
  () => form.decline_response,
  (declineResponse) => {
    if (declineResponse !== 'request_cake') {
      form.shipping_address = ''
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
  } else if (form.decline_response === 'request_cake' && !form.shipping_address.trim()) {
    errorMessage.value = '希望收到喜餅時請填寫收件地址'
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
      shipping_address:
        form.status === 'decline' && form.decline_response === 'request_cake'
          ? form.shipping_address.trim()
          : null,
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
  <div class="public-rsvp">
    <nav class="nav rsvp-public-nav">
      <div class="container nav-inner">
        <div class="brand">
          <span class="brand-mark">囍</span>
          <span>婚禮邀請</span>
        </div>
      </div>
    </nav>

    <header class="rsvp-public-title">
      <div class="container">
        <p class="eyebrow">Wedding Invitation</p>
        <h1>誠摯邀請您一同見證我們的重要時刻。</h1>
        <p class="lead">
          請協助回覆出席資訊，讓我們能為您準備座位、餐點與喜帖。
        </p>
      </div>
    </header>

    <main class="section rsvp-main-section">
      <div class="container">
        <form class="form-panel" @submit.prevent="handleSubmit">
          <div class="section-head">
            <div>
              <p class="eyebrow">RSVP</p>
              <h2>請告訴我們您的出席資訊。</h2>
            </div>
            <span class="badge badge-neutral">必填欄位已標示</span>
          </div>

          <div class="form-grid two">
            <div class="field">
              <label for="guest-name">姓名</label>
              <input id="guest-name" v-model="form.name" class="field-control" required maxlength="100" placeholder="請輸入姓名" />
            </div>

        <div class="field">
          <label for="guest-phone">聯絡電話</label>
        <input
            id="guest-phone"
          v-model="form.phone"
            class="field-control"
          required
          inputmode="tel"
          maxlength="20"
          placeholder="09xxxxxxxx"
        />
        </div>
      </div>

      <div class="field rsvp-mode-field">
        <span class="field-label">出席意願</span>
        <div class="segmented">
          <button
            type="button"
            :class="{ 'is-active': form.status === 'attend' }"
            @click="form.status = 'attend'"
          >
            我會出席
          </button>
          <button
            type="button"
            :class="{ 'is-active': form.status === 'decline' }"
            @click="form.status = 'decline'"
          >
            無法出席
          </button>
        </div>
      </div>

      <section v-if="form.status === 'attend'" class="form-grid">
        <div class="form-grid two">
          <div class="field">
            <label for="adult-count">大人人數</label>
            <input
              id="adult-count"
              v-model.number="form.total_adults"
              class="field-control"
              type="number"
              min="1"
              required
            />
          </div>
          <div class="field">
            <label for="child-count">小孩人數</label>
            <input
              id="child-count"
              v-model.number="form.total_children"
              class="field-control"
              type="number"
              min="0"
            />
          </div>
        </div>

        <div class="form-grid two">
          <div class="field">
            <label for="child-seats">兒童座椅</label>
          <input
              id="child-seats"
            v-model.number="form.child_seats"
              class="field-control"
            type="number"
            min="0"
            :max="form.total_children"
            placeholder="需要幾張兒童座椅"
          />
          </div>
          <div class="field">
            <label for="diet-notes">飲食需求</label>
          <input
              id="diet-notes"
            v-model="form.diet_notes"
              class="field-control"
            maxlength="500"
            placeholder="例如：素食、過敏食材"
          />
          </div>
        </div>

        <label class="toggle">
          <input v-model="form.need_invitation" type="checkbox" />
          <span aria-hidden="true"></span>
          需要寄送喜帖
        </label>

        <div v-if="form.need_invitation" class="field">
          <label for="invitation-address">喜帖寄送地址</label>
          <textarea
            id="invitation-address"
            v-model="form.invitation_address"
            class="field-control"
            rows="3"
            maxlength="500"
            required
            placeholder="請填寫完整收件地址"
          />
        </div>
      </section>

      <section v-else-if="form.status === 'decline'" class="form-grid">
        <div class="field">
          <label for="decline-response">無法出席回覆</label>
          <select id="decline-response" v-model="form.decline_response" class="field-control">
            <option value="" disabled>請選擇回覆選項</option>
            <option value="blessing_only">無法到場，在此致上誠摯的祝福</option>
            <option value="request_cake">無法到場，希望收到喜餅分享喜悅</option>
          </select>
        </div>

        <div v-if="form.decline_response === 'request_cake'" class="field">
          <label for="cake-address">喜餅收件地址</label>
          <textarea
            id="cake-address"
            v-model="form.shipping_address"
            class="field-control"
            rows="3"
            maxlength="500"
            required
            placeholder="請填寫完整收件地址"
          />
        </div>
      </section>

      <div class="field rsvp-blessing-field">
        <label for="blessing">祝福留言</label>
        <textarea
          id="blessing"
          v-model="form.blessing_message"
          class="field-control"
          rows="4"
          maxlength="1000"
          placeholder="想對新人說的話..."
        />
      </div>

      <p v-if="errorMessage" class="message message--error">{{ errorMessage }}</p>
      <div v-if="successMessage" class="success-note is-visible">
        <p>{{ successMessage }}</p>
        <div class="line-follow-card">
          <div>
            <strong>加入 Line 官方帳號</strong>
            <span>後續婚禮資訊與即時聯繫會透過 Line 更新。</span>
          </div>
          <a
            class="line-follow-card__mobile"
            href="https://lin.ee/PvW0Voh"
            rel="noopener noreferrer"
            target="_blank"
          >
            <img
              src="https://scdn.line-apps.com/n/line_add_friends/btn/zh-Hant.png"
              alt="加入好友"
              height="36"
              border="0"
            />
          </a>
          <img
            class="line-follow-card__desktop"
            src="https://qr-official.line.me/gs/M_287rlhkg_GW.png?oat_content=qr"
            alt="Line 官方帳號 QR Code"
          />
        </div>
      </div>

      <div class="actions">
      <button class="btn btn-primary" type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? '送出中...' : '送出回覆' }}
      </button>
      </div>
    </form>
      </div>
    </main>
  </div>
</template>
