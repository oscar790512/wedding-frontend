<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import QRCode from 'qrcode'

import backgroundImage from '../assets/background-2.jpg'
import { fetchRsvpSettings, submitRsvp } from '../api/client'
import QrCode from '../components/QrCode.vue'
import { buildCheckinQrPayload } from '../utils/checkin'
import { formatWeddingDate } from '../utils/date'
import {
  buildRsvpPayload,
  cakePhoneDisplayValue,
  cakeRecipientDisplayValue,
  normalizePhone,
} from '../utils/rsvpForm'

const form = reactive({
  name: '',
  phone: '',
  email: '',
  relationship_side: '',
  relationship_type: '',
  status: 'attend',
  total_adults: 1,
  total_children: 0,
  need_vegetarian: false,
  vegetarian_count: 0,
  child_seats: 0,
  diet_notes: '',
  need_invitation: false,
  invitation_address: '',
  decline_response: '',
  shipping_recipient: '',
  shipping_phone: '',
  shipping_address: '',
  use_cake_recipient_same: true,
  use_cake_phone_same: true,
  blessing_message: '',
})

const relationshipSideOptions = ['男方', '女方']
const relationshipTypeOptions = ['同事/長官', '朋友/同學', '家人', '長輩朋友', '其他']

const selectedGuestCategory = computed(() => {
  if (!form.relationship_side || !form.relationship_type) {
    return ''
  }
  return `${form.relationship_side}${form.relationship_type}`
})

const isSubmitting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const showLineDialog = ref(false)
const submittedGuest = ref(null)
const checkinSnapshotUrl = ref('')
const activeSection = ref('rsvp-title')
const showContinueCue = ref(false)
const isRsvpFieldFocused = ref(false)
const rsvpDeadline = ref('')
let sectionTouchStartX = 0
let sectionTouchStartY = 0
let lastSectionNavigationAt = 0
let sectionObserver = null
let sectionNavigationLock = null
let cueFrame = null
let focusedFieldRepositionTimer = null
let focusedFieldFrame = null

const pageSections = [
  { id: 'rsvp-title', label: '邀請' },
  { id: 'wedding-info', label: '資訊' },
  { id: 'questionnaire', label: '填寫' },
]

const submittedCheckinUrl = computed(() => {
  if (!submittedGuest.value?.checkin_token || submittedGuest.value.status !== 'attend') {
    return ''
  }
  return buildCheckinQrPayload(submittedGuest.value.checkin_token)
})
const formattedRsvpDeadline = computed(() => formatWeddingDate(rsvpDeadline.value))
const cakeRecipientValue = computed(() => cakeRecipientDisplayValue(form))
const cakePhoneValue = computed(() => cakePhoneDisplayValue(form))

function validatePhone(value, label) {
  const trimmed = value.trim()
  const normalized = normalizePhone(value)

  if (!trimmed) {
    return `${label}為必填`
  }

  if (!/^[\d\s()-]+$/.test(trimmed)) {
    return `${label}格式不正確，請輸入手機或市話`
  }

  if (normalized.length < 8 || normalized.length > 10) {
    return `${label}長度需為 8 到 10 碼數字`
  }

  return ''
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

async function createCheckinSnapshot(guest, checkinUrl) {
  if (!checkinUrl) {
    checkinSnapshotUrl.value = ''
    return
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(checkinUrl, {
      width: 500,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#1f2933',
        light: '#ffffff',
      },
    })
    const qrImage = await loadImage(qrDataUrl)
    const canvas = document.createElement('canvas')
    const width = 760
    const height = 980
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')

    context.fillStyle = '#fffaf5'
    context.fillRect(0, 0, width, height)
    context.fillStyle = '#7b4f3f'
    context.fillRect(0, 0, width, 18)
    context.fillRect(0, height - 18, width, 18)
    context.fillStyle = '#1f2933'
    context.textAlign = 'center'
    context.font = '700 44px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillText('婚禮報到 QR Code', width / 2, 110)
    context.font = '600 36px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillText(guest.name || '賓客', width / 2, 170)
    context.font = '28px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillStyle = '#5f6b76'
    context.fillText('婚禮當天請出示此圖給工作人員掃描', width / 2, 220)
    context.fillStyle = '#ffffff'
    context.strokeStyle = 'rgba(60, 49, 42, 0.14)'
    context.lineWidth = 2
    context.roundRect(70, 235, 620, 620, 12)
    context.fill()
    context.stroke()
    context.drawImage(qrImage, 130, 295, 500, 500)
    context.fillStyle = '#5f6b76'
    context.font = '22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillText('掃描後仍需由工作人員確認到場', width / 2, 900)

    checkinSnapshotUrl.value = canvas.toDataURL('image/png')
  } catch {
    checkinSnapshotUrl.value = ''
  }
}

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
    const totalGuests = form.total_adults + totalChildren
    if (form.vegetarian_count > totalGuests) {
      form.vegetarian_count = totalGuests
    }
  },
)

watch(
  () => form.total_adults,
  (totalAdults) => {
    const totalGuests = totalAdults + form.total_children
    if (form.vegetarian_count > totalGuests) {
      form.vegetarian_count = totalGuests
    }
  },
)

watch(
  () => form.need_vegetarian,
  (needVegetarian) => {
    if (!needVegetarian) {
      form.vegetarian_count = 0
    }
  },
)

watch(
  () => form.status,
  (status) => {
    if (status === 'decline') {
      form.total_adults = 0
      form.total_children = 0
      form.need_vegetarian = false
      form.vegetarian_count = 0
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
      form.shipping_recipient = ''
      form.shipping_phone = ''
      form.shipping_address = ''
    }
  },
)

async function handleSubmit() {
  errorMessage.value = ''
  successMessage.value = ''
  submittedGuest.value = null
  checkinSnapshotUrl.value = ''

  const phoneError = validatePhone(form.phone, '聯絡電話')
  if (phoneError) {
    errorMessage.value = phoneError
    return
  }

  if (!selectedGuestCategory.value) {
    errorMessage.value = '請選擇與新人關係'
    return
  }

  if (form.status === 'attend') {
    if (form.need_invitation && !form.invitation_address.trim()) {
      errorMessage.value = '需要喜帖時請填寫寄送地址'
      return
    }

    if (form.total_children > 0 && form.child_seats > form.total_children) {
      errorMessage.value = '兒童座椅數量不可超過小孩人數'
      return
    }

    if (form.vegetarian_count > form.total_adults + form.total_children) {
      errorMessage.value = '素食人數不可超過總出席人數'
      return
    }
  } else if (!form.decline_response) {
    errorMessage.value = '無法出席時請選擇一個回覆選項'
    return
  } else if (
    form.decline_response === 'request_cake'
    && !form.use_cake_recipient_same
    && !form.shipping_recipient.trim()
  ) {
    errorMessage.value = '希望收到喜餅時請填寫收件人'
    return
  } else if (
    form.decline_response === 'request_cake'
    && !form.use_cake_phone_same
    && !form.shipping_phone.trim()
  ) {
    errorMessage.value = '希望收到喜餅時請填寫收件電話'
    return
  } else if (
    form.decline_response === 'request_cake'
    && !form.use_cake_phone_same
  ) {
    const shippingPhoneError = validatePhone(form.shipping_phone, '喜餅收件電話')
    if (shippingPhoneError) {
      errorMessage.value = shippingPhoneError
      return
    }
  } else if (form.decline_response === 'request_cake' && !form.shipping_address.trim()) {
    errorMessage.value = '希望收到喜餅時請填寫收件地址'
    return
  }

  isSubmitting.value = true

  try {
    const savedGuest = await submitRsvp(
      buildRsvpPayload(form, selectedGuestCategory.value),
    )
    submittedGuest.value = savedGuest
    if (savedGuest.status === 'attend' && savedGuest.checkin_token) {
      await createCheckinSnapshot(savedGuest, buildCheckinQrPayload(savedGuest.checkin_token))
    }
    successMessage.value =
      form.status === 'decline'
        ? '已收到您的回覆，謝謝您的祝福！'
        : '已收到您的回覆，期待與您見面！'
    showLineDialog.value = true
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isSubmitting.value = false
  }
}

function closeLineDialog() {
  showLineDialog.value = false
}

async function loadRsvpSettings() {
  try {
    const settings = await fetchRsvpSettings()
    rsvpDeadline.value = settings.rsvp_deadline || ''
  } catch {
    rsvpDeadline.value = ''
  }
}

function scrollToElement(elementId) {
  const element = document.getElementById(elementId)
  if (!element) return

  element.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function lockSectionNavigation(duration = 720) {
  if (sectionNavigationLock) {
    window.clearTimeout(sectionNavigationLock)
  }

  sectionNavigationLock = window.setTimeout(() => {
    sectionNavigationLock = null
  }, duration)
}

function navigateToSection(sectionId) {
  activeSection.value = sectionId
  scrollToElement(sectionId)
  lockSectionNavigation()
}

function scrollToWeddingInfo() {
  navigateToSection('wedding-info')
}

function visibleViewportRatio(element) {
  if (!element) return 0
  const rect = element.getBoundingClientRect()
  const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)
  return Math.max(visibleHeight, 0) / window.innerHeight
}

function updateContinueCue() {
  if (cueFrame) return

  cueFrame = window.requestAnimationFrame(() => {
    cueFrame = null
    const infoRatio = visibleViewportRatio(document.getElementById('wedding-info'))
    const formRatio = visibleViewportRatio(document.getElementById('questionnaire'))
    showContinueCue.value = infoRatio >= 0.5 && formRatio <= 0.5
  })
}

function handleSectionTouchStart(event) {
  const touch = event.touches[0]
  sectionTouchStartX = touch.clientX
  sectionTouchStartY = touch.clientY
}

function navigateSection(targetId) {
  const now = Date.now()
  if (sectionNavigationLock || now - lastSectionNavigationAt < 520) return
  lastSectionNavigationAt = now
  navigateToSection(targetId)
}

function handleSectionTouchEnd(event, nextSectionId, previousSectionId = '') {
  if (!window.matchMedia('(max-width: 980px)').matches) return

  const touch = event.changedTouches[0]
  const deltaX = Math.abs(touch.clientX - sectionTouchStartX)
  const deltaY = sectionTouchStartY - touch.clientY
  const currentTarget = event.currentTarget

  if (deltaY > 36 && deltaY > deltaX) {
    if (currentTarget?.id === 'wedding-info' && !isNearPanelBottom(currentTarget)) {
      return
    }
    navigateSection(nextSectionId)
  } else if (previousSectionId && deltaY < -36 && Math.abs(deltaY) > deltaX) {
    navigateSection(previousSectionId)
  }
}

function handleSectionWheel(event, nextSectionId, previousSectionId = '') {
  if (Math.abs(event.deltaY) < 12) return
  if (event.deltaY < 0 && !previousSectionId) return
  if (event.currentTarget?.id === 'wedding-info' && event.deltaY > 0 && !isNearPanelBottom(event.currentTarget)) {
    return
  }

  event.preventDefault()
  navigateSection(event.deltaY > 0 ? nextSectionId : previousSectionId)
}

function isNearPanelBottom(element) {
  const rect = element.getBoundingClientRect()
  return rect.bottom <= window.innerHeight + 24
}

function isRsvpField(element) {
  return element?.classList?.contains('field-control')
}

function findRsvpField(target) {
  return target?.closest?.('.field-control') || null
}

function visibleViewportBounds() {
  const viewport = window.visualViewport
  return {
    height: viewport?.height || window.innerHeight,
  }
}

function repositionFocusedField() {
  const activeElement = document.activeElement
  if (!isRsvpField(activeElement) || !window.matchMedia('(max-width: 640px)').matches) return

  if (focusedFieldFrame) {
    window.cancelAnimationFrame(focusedFieldFrame)
  }

  focusedFieldFrame = window.requestAnimationFrame(() => {
    focusedFieldFrame = null
    const fieldRect = activeElement.getBoundingClientRect()
    const viewport = visibleViewportBounds()
    const desiredBottom = viewport.height - 32

    const scrollDelta = fieldRect.bottom - desiredBottom

    if (scrollDelta > 12) {
      window.scrollBy({ top: scrollDelta })
    }
  })
}

function scheduleFocusedFieldReposition(delay = 680) {
  if (focusedFieldRepositionTimer) {
    window.clearTimeout(focusedFieldRepositionTimer)
  }

  focusedFieldRepositionTimer = window.setTimeout(() => {
    focusedFieldRepositionTimer = null
    repositionFocusedField()
  }, delay)
}

function handleRsvpFieldFocus(event) {
  if (!isRsvpField(event.target)) return
  isRsvpFieldFocused.value = true
  scheduleFocusedFieldReposition()
}

function handleRsvpFieldPointerStart(event) {
  if (!findRsvpField(event.target)) return
  isRsvpFieldFocused.value = true
}

function handleRsvpFieldBlur(event) {
  if (!isRsvpField(event.target)) return

  window.setTimeout(() => {
    isRsvpFieldFocused.value = isRsvpField(document.activeElement)
  }, 80)
}

onMounted(() => {
  loadRsvpSettings()
  sectionObserver = new IntersectionObserver(
    (entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0]

      if (visibleEntry) {
        if (sectionNavigationLock) return
        activeSection.value = visibleEntry.target.id
      }
    },
    {
      rootMargin: '-35% 0px -45% 0px',
      threshold: [0.1, 0.35, 0.6],
    },
  )

  pageSections.forEach((section) => {
    const element = document.getElementById(section.id)
    if (element) sectionObserver.observe(element)
  })
  updateContinueCue()
  window.addEventListener('scroll', updateContinueCue, { passive: true })
  window.addEventListener('resize', updateContinueCue)
})

onBeforeUnmount(() => {
  if (sectionObserver) {
    sectionObserver.disconnect()
  }
  if (sectionNavigationLock) {
    window.clearTimeout(sectionNavigationLock)
  }
  if (cueFrame) {
    window.cancelAnimationFrame(cueFrame)
  }
  if (focusedFieldRepositionTimer) {
    window.clearTimeout(focusedFieldRepositionTimer)
  }
  if (focusedFieldFrame) {
    window.cancelAnimationFrame(focusedFieldFrame)
  }
  window.removeEventListener('scroll', updateContinueCue)
  window.removeEventListener('resize', updateContinueCue)
})
</script>

<template>
  <div class="public-rsvp" :class="{ 'public-rsvp--field-focused': isRsvpFieldFocused }">
    <nav class="nav rsvp-public-nav">
      <div class="container nav-inner">
        <div class="brand">
          <span class="brand-mark">囍</span>
          <span>祺元(Oscar) 與姵妤婚禮邀請</span>
        </div>
      </div>
    </nav>

    <header
      id="rsvp-title"
      class="rsvp-hero"
      @touchstart.passive="handleSectionTouchStart"
      @touchend.passive="handleSectionTouchEnd($event, 'wedding-info')"
      @wheel="handleSectionWheel($event, 'wedding-info')"
    >
      <img class="rsvp-hero__image" :src="backgroundImage" alt="祺元與姵妤婚紗照" />
      <div class="rsvp-hero__shade" aria-hidden="true"></div>
      <div class="container rsvp-hero__content">
        <p class="eyebrow">Wedding Invitation</p>
        <h1>祺元與姵妤</h1>
        <p class="lead">
          誠摯邀請您一同見證我們的重要時刻，請協助回覆出席資訊，讓我們能為您準備座位、餐點與喜帖。
        </p>
        <a class="btn btn-primary rsvp-hero__cta" href="#wedding-info" @click.prevent="scrollToWeddingInfo">開始填寫</a>
      </div>
    </header>

    <nav class="rsvp-section-nav" aria-label="RSVP 區塊導覽">
      <button
        v-for="section in pageSections"
        :key="section.id"
        type="button"
        :class="{ 'is-active': activeSection === section.id }"
        @click="navigateToSection(section.id)"
      >
        <span class="rsvp-section-nav__dot" aria-hidden="true"></span>
        <span class="rsvp-section-nav__label">{{ section.label }}</span>
      </button>
    </nav>

    <button
      v-if="showContinueCue"
      class="rsvp-continue-cue"
      type="button"
      aria-label="繼續填寫 RSVP"
      @click="navigateToSection('questionnaire')"
    >
      <span>繼續填寫</span>
      <span aria-hidden="true">↓</span>
    </button>

    <main id="rsvp-form" class="section rsvp-main-section">
      <div class="container rsvp-content-grid">
        <aside
          id="wedding-info"
          class="rsvp-info-panel"
          aria-label="婚禮資訊"
        >
          <p class="eyebrow">Save the Date</p>
          <h2>期待在婚禮現場與您相見。</h2>
          <p class="lead">
            填寫時間約 1 分鐘。若無法出席，也可以留下祝福與喜餅寄送資訊。
          </p>
          <dl class="rsvp-info-list">
            <div>
              <dt>日期</dt>
              <dd>2026年11月8日 星期日 (Sun)</dd>
            </div>
            <div>
              <dt>時間</dt>
              <dd>中午 12:00 入場，12:30 開始</dd>
            </div>
            <div>
              <dt>地點</dt>
              <dd>老新台菜 十全店 (2樓A廳)</dd>
            </div>
            <div>
              <dt>地址</dt>
              <dd>高雄市三民區德西里十全三路265號</dd>
            </div>
            <div>
              <dt>回覆內容</dt>
              <dd>出席人數、飲食需求、喜帖或喜餅寄送資訊</dd>
            </div>
            <div v-if="formattedRsvpDeadline">
              <dt>回覆截止</dt>
              <dd>{{ formattedRsvpDeadline }}前</dd>
            </div>
          </dl>
          <p class="rsvp-line-note">
            送出回覆後可加入我們的 Line 官方帳號，後續婚禮提醒與座位資訊會在那邊同步。
          </p>
        </aside>

        <form
          id="questionnaire"
          class="form-panel rsvp-form-panel"
          @focusout="handleRsvpFieldBlur"
          @focusin="handleRsvpFieldFocus"
          @pointerdown.capture="handleRsvpFieldPointerStart"
          @touchstart.capture.passive="handleRsvpFieldPointerStart"
          @submit.prevent="handleSubmit"
        >
          <div class="section-head">
            <div>
              <h2>請告訴我們您的出席資訊。</h2>
            </div>
            <span class="badge badge-neutral">* 為必填欄位</span>
          </div>

          <p v-if="formattedRsvpDeadline" class="rsvp-deadline-note">
            請於 {{ formattedRsvpDeadline }}前完成回覆。
          </p>

          <div class="form-grid two">
            <div class="field">
              <label for="guest-name">姓名 <span class="required-mark">*</span></label>
              <input id="guest-name" v-model="form.name" class="field-control" required maxlength="100" placeholder="請輸入姓名" />
            </div>

            <div class="field">
              <label for="guest-phone">聯絡電話 <span class="required-mark">*</span></label>
              <input
                id="guest-phone"
                v-model="form.phone"
                class="field-control"
                required
                inputmode="tel"
                maxlength="16"
                pattern="[0-9\s\(\)\-]{8,16}"
                placeholder="手機或市話"
                title="請輸入手機或市話，可含空白、括號或連字號"
              />
            </div>
          </div>

          <div class="field">
            <label for="guest-email">Email</label>
            <input
              id="guest-email"
              v-model="form.email"
              class="field-control"
              type="email"
              maxlength="255"
              placeholder="用於寄送電子喜帖"
            />
          </div>

          <div class="form-grid two rsvp-relationship-grid">
            <div class="field">
              <label for="relationship-side">與新人關係 <span class="required-mark">*</span></label>
              <select
                id="relationship-side"
                v-model="form.relationship_side"
                class="field-control"
                required
              >
                <option value="" disabled>請選擇</option>
                <option
                  v-for="side in relationshipSideOptions"
                  :key="side"
                  :value="side"
                >
                  {{ side }}
                </option>
              </select>
            </div>

            <div class="field">
              <label for="relationship-type">關係類型 <span class="required-mark">*</span></label>
              <select
                id="relationship-type"
                v-model="form.relationship_type"
                class="field-control"
                required
              >
                <option value="" disabled>請選擇關係類型</option>
                <option
                  v-for="relationshipType in relationshipTypeOptions"
                  :key="relationshipType"
                  :value="relationshipType"
                >
                  {{ relationshipType }}
                </option>
              </select>
            </div>
          </div>

      <div class="field rsvp-mode-field">
        <span class="field-label">出席意願 <span class="required-mark">*</span></span>
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
            <label for="adult-count">大人人數 <span class="required-mark">*</span></label>
            <input
              id="adult-count"
              v-model.number="form.total_adults"
              class="field-control"
              type="text"
              inputmode="numeric"
              min="1"
              pattern="[0-9]*"
              required
            />
          </div>
          <div class="field">
            <label for="child-count">小孩人數</label>
            <input
              id="child-count"
              v-model.number="form.total_children"
              class="field-control"
              type="text"
              inputmode="numeric"
              min="0"
              pattern="[0-9]*"
            />
          </div>
        </div>

        <div v-if="form.total_children > 0" class="field">
          <label for="child-seats">兒童座椅</label>
        <input
            id="child-seats"
          v-model.number="form.child_seats"
            class="field-control"
          type="text"
          inputmode="numeric"
          min="0"
          pattern="[0-9]*"
          :max="form.total_children"
          placeholder="需要幾張兒童座椅"
        />
        </div>

        <label class="toggle">
          <input v-model="form.need_vegetarian" type="checkbox" />
          <span aria-hidden="true"></span>
          需要素食
        </label>

        <div v-if="form.need_vegetarian" class="field">
          <label for="vegetarian-count">素食人數</label>
          <input
            id="vegetarian-count"
            v-model.number="form.vegetarian_count"
            class="field-control"
            type="text"
            inputmode="numeric"
            min="0"
            pattern="[0-9]*"
            :max="form.total_adults + form.total_children"
            placeholder="需要幾份素食"
          />
        </div>

        <div class="field">
          <label for="diet-notes">過敏／特殊飲食</label>
          <input
            id="diet-notes"
            v-model="form.diet_notes"
            class="field-control"
            maxlength="500"
            placeholder="例如：花生過敏、不吃牛或其他飲食需求"
          />
        </div>

        <label class="toggle">
          <input v-model="form.need_invitation" type="checkbox" />
          <span aria-hidden="true"></span>
          需要寄送紙本喜帖
        </label>

        <div v-if="form.need_invitation" class="field">
          <label for="invitation-address">喜帖寄送地址 <span class="required-mark">*</span></label>
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
          <label for="decline-response">無法出席回覆 <span class="required-mark">*</span></label>
          <select id="decline-response" v-model="form.decline_response" class="field-control">
            <option value="" disabled>請選擇回覆選項</option>
            <option value="blessing_only">無法到場，在此致上誠摯的祝福</option>
            <option value="request_cake">無法到場，希望收到喜餅分享喜悅</option>
          </select>
        </div>

        <div v-if="form.decline_response === 'request_cake'" class="field">
          <div class="form-grid two">
            <div class="field">
              <div class="field-heading">
                <label for="cake-recipient">喜餅收件人 <span v-if="!form.use_cake_recipient_same" class="required-mark">*</span></label>
                <label class="inline-check">
                  <input v-model="form.use_cake_recipient_same" type="checkbox" />
                  同填寫人
                </label>
              </div>
              <input
                id="cake-recipient"
                :value="cakeRecipientValue"
                class="field-control"
                :disabled="form.use_cake_recipient_same"
                maxlength="100"
                :placeholder="form.use_cake_recipient_same ? form.name || '同填寫人姓名' : '請輸入收件人'"
                :required="!form.use_cake_recipient_same"
                @input="form.shipping_recipient = $event.target.value"
              />
            </div>

            <div class="field">
              <div class="field-heading">
                <label for="cake-phone">喜餅收件電話 <span v-if="!form.use_cake_phone_same" class="required-mark">*</span></label>
                <label class="inline-check">
                  <input v-model="form.use_cake_phone_same" type="checkbox" />
                  同填寫人
                </label>
              </div>
              <input
                id="cake-phone"
                :value="cakePhoneValue"
                class="field-control"
                :disabled="form.use_cake_phone_same"
                inputmode="tel"
                maxlength="16"
                pattern="[0-9\s\(\)\-]{8,16}"
                :placeholder="form.use_cake_phone_same ? form.phone || '同填寫人電話' : '請輸入收件電話'"
                :required="!form.use_cake_phone_same"
                title="請輸入手機或市話，可含空白、括號或連字號"
                @input="form.shipping_phone = $event.target.value"
              />
            </div>
          </div>

          <label for="cake-address">喜餅收件地址 <span class="required-mark">*</span></label>
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
      <p v-if="successMessage" class="success-note is-visible">
        {{ successMessage }}
      </p>

      <p class="rsvp-privacy-note">
        聯絡電話、Email 與地址僅用於婚禮通知及喜帖／喜餅寄送。
      </p>

      <div class="actions">
      <button class="btn btn-primary" type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? '送出中...' : '送出回覆' }}
      </button>
      </div>
    </form>
      </div>
    </main>

    <div
      v-if="showLineDialog"
      class="dialog-backdrop line-dialog-backdrop"
      role="presentation"
      @click.self="closeLineDialog"
    >
      <div class="line-dialog-shell">
        <button
          class="line-dialog__close"
          type="button"
          aria-label="關閉"
          @click="closeLineDialog"
        >
          ×
        </button>
        <section class="dialog-card line-dialog" role="dialog" aria-modal="true">
          <div class="line-dialog__main">
            <div class="line-dialog__head">
              <div>
                <p class="eyebrow">Check-in QR</p>
                <h2>{{ submittedCheckinUrl ? '婚禮報到 QR Code' : '回覆已送出' }}</h2>
                <p class="lead">
                  {{
                    submittedCheckinUrl
                      ? '婚禮當天請出示此 QR Code 給工作人員掃描。'
                      : '後續婚禮資訊與即時聯繫會透過 Line 更新。'
                  }}
                </p>
              </div>
            </div>

            <div v-if="submittedCheckinUrl" class="checkin-qr-card">
              <img
                v-if="checkinSnapshotUrl"
                class="checkin-snapshot"
                :src="checkinSnapshotUrl"
                alt="報到 QR Code 截圖"
              />
              <QrCode v-else :value="submittedCheckinUrl" label="婚禮簽到 QR Code" />
              <p class="checkin-qr-card__hint">
                ↑ 長按上方圖片保存報到 QR Code ↑
              </p>
            </div>
          </div>

          <div class="line-follow-card">
            <div class="line-follow-card__copy">
              <p class="eyebrow">Line Official</p>
              <h3>加入 Line 官方帳號</h3>
              <p>婚禮提醒與座位資訊會在這裡同步。</p>
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
        </section>
      </div>
    </div>
  </div>
</template>
