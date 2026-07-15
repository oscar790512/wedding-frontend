<script setup>
import { computed, onMounted, ref, watch } from 'vue'

import { createGuest, deleteGuest, fetchGuests, patchGuest } from '../api/client'
import AdminLayout from '../components/AdminLayout.vue'

const CATEGORY_OPTIONS = [
  '男方同事/長官',
  '女方同事/長官',
  '男方朋友/同學',
  '女方朋友/同學',
  '男方家人',
  '女方家人',
  '男方長輩朋友',
  '女方長輩朋友',
]

const guests = ref([])
const searchQuery = ref('')
const shippingFilter = ref('all')
const isLoading = ref(false)
const isSaving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const editingGuestId = ref(null)
const isShippingFormOpen = ref(false)
const isAdvancedSearchOpen = ref(false)

const createInitialForm = () => ({
  name: '',
  phone: '',
  email: '',
  status: 'attend',
  total_adults: 1,
  total_children: 0,
  need_invitation: true,
  invitation_address: '',
  invitation_status: 'pending_send',
  decline_response: null,
  cake_status: 'not_required',
  shipping_recipient: '',
  shipping_phone: '',
  shipping_address: '',
  shipping_date: '',
  tracking_no: '',
  guest_category: '',
  admin_notes: '',
})

const form = ref(createInitialForm())

const visibleGuests = computed(() => {
  if (shippingFilter.value === 'invitation') {
    return guests.value.filter((guest) => guest.need_invitation)
  }
  if (shippingFilter.value === 'cake') {
    return guests.value.filter((guest) => guest.decline_response === 'request_cake')
  }
  if (shippingFilter.value === 'pending') {
    return guests.value.filter((guest) =>
      ['pending_address', 'pending_send'].includes(guest.invitation_status)
      || ['pending_address', 'pending_send'].includes(guest.cake_status),
    )
  }
  return guests.value
})

const shippingStats = computed(() => [
  { label: '寄送待辦總數', value: guests.value.length },
  {
    label: '喜帖寄送',
    value: guests.value.filter((guest) => guest.need_invitation).length,
  },
  {
    label: '喜餅寄送',
    value: guests.value.filter((guest) => guest.decline_response === 'request_cake').length,
  },
  {
    label: '待補資料',
    value: guests.value.filter((guest) => isPendingGuest(guest)).length,
  },
])

function isPendingGuest(guest) {
  return ['pending_address', 'pending_send'].includes(guest.invitation_status)
    || ['pending_address', 'pending_send'].includes(guest.cake_status)
}

function resetForm() {
  editingGuestId.value = null
  form.value = createInitialForm()
  successMessage.value = ''
}

function openShippingForm() {
  isShippingFormOpen.value = true
}

function startCreateShipping() {
  resetForm()
  openShippingForm()
}

function closeShippingForm() {
  if (isSaving.value) return
  isShippingFormOpen.value = false
}

function cancelShippingForm() {
  resetForm()
  closeShippingForm()
}

function fillForm(guest) {
  editingGuestId.value = guest.id
  form.value = {
    name: guest.name || '',
    phone: guest.phone || '',
    email: guest.email || '',
    status: guest.status || 'undecided',
    total_adults: Number(guest.total_adults || 0),
    total_children: Number(guest.total_children || 0),
    need_invitation: Boolean(guest.need_invitation),
    invitation_address: guest.invitation_address || '',
    invitation_status: guest.invitation_status || 'not_required',
    decline_response: guest.decline_response || null,
    cake_status: guest.cake_status || 'not_required',
    shipping_recipient: guest.shipping_recipient || '',
    shipping_phone: guest.shipping_phone || '',
    shipping_address: guest.shipping_address || '',
    shipping_date: guest.shipping_date || '',
    tracking_no: guest.tracking_no || '',
    guest_category: guest.guest_category || '',
    admin_notes: guest.admin_notes || '',
  }
  successMessage.value = ''
  openShippingForm()
}

function buildPayload() {
  return {
    name: form.value.name,
    phone: form.value.phone,
    email: form.value.email || null,
    status: form.value.status,
    total_adults: Number(form.value.total_adults || 0),
    total_children: Number(form.value.total_children || 0),
    need_invitation: form.value.need_invitation,
    invitation_address: form.value.need_invitation ? form.value.invitation_address : null,
    invitation_status: form.value.need_invitation ? form.value.invitation_status : 'not_required',
    decline_response:
      form.value.status === 'decline' ? form.value.decline_response : null,
    cake_status:
      form.value.status === 'attend'
        ? ['pending_pickup', 'pickup'].includes(form.value.cake_status)
          ? form.value.cake_status
          : 'pending_pickup'
        : form.value.status === 'decline' && form.value.decline_response === 'request_cake'
          ? form.value.cake_status
          : 'not_required',
    shipping_recipient:
      form.value.status === 'decline' && form.value.decline_response === 'request_cake'
        ? form.value.shipping_recipient
        : null,
    shipping_phone:
      form.value.status === 'decline' && form.value.decline_response === 'request_cake'
        ? form.value.shipping_phone
        : null,
    shipping_address:
      form.value.status === 'decline' && form.value.decline_response === 'request_cake'
        ? form.value.shipping_address
        : null,
    shipping_date:
      form.value.status === 'decline' && form.value.decline_response === 'request_cake'
      && form.value.shipping_date
        ? form.value.shipping_date
        : null,
    tracking_no:
      form.value.status === 'decline' && form.value.decline_response === 'request_cake'
        ? form.value.tracking_no || null
        : null,
    guest_category: form.value.guest_category || null,
    admin_notes: form.value.admin_notes || null,
  }
}

async function loadGuests() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    guests.value = await fetchGuests({
      q: searchQuery.value.trim(),
      shipping: shippingFilter.value === 'all' ? undefined : shippingFilter.value,
    })
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

async function submitForm() {
  isSaving.value = true
  errorMessage.value = ''

  try {
    const payload = buildPayload()

    if (editingGuestId.value) {
      await patchGuest(editingGuestId.value, payload)
      successMessage.value = '寄送待辦已更新'
    } else {
      await createGuest(payload)
      successMessage.value = '寄送待辦已新增'
    }

    resetForm()
    await loadGuests()
    closeShippingForm()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isSaving.value = false
  }
}

async function removeGuest(guest) {
  if (!window.confirm(`確定刪除 ${guest.name} 的寄送待辦？`)) {
    return
  }

  errorMessage.value = ''
  successMessage.value = ''

  try {
    await deleteGuest(guest.id)
    if (editingGuestId.value === guest.id) {
      resetForm()
    }
    successMessage.value = '寄送待辦已刪除'
    await loadGuests()
  } catch (error) {
    errorMessage.value = error.message
  }
}

function shippingTypeLabel(guest) {
  if (guest.need_invitation && guest.decline_response === 'request_cake') {
    return '喜帖 + 喜餅'
  }
  if (guest.need_invitation) {
    return '喜帖'
  }
  if (guest.decline_response === 'request_cake') {
    return '喜餅'
  }
  return '一般賓客'
}

function shippingStatusLabel(guest) {
  if (guest.need_invitation) {
    if (guest.invitation_status === 'pending_address') return '喜帖待補地址'
    if (guest.invitation_status === 'pending_send') return '喜帖待寄送'
    if (guest.invitation_status === 'sent') return '喜帖已寄出'
    if (guest.invitation_status === 'received') return '喜帖已收件'
  }

  if (guest.decline_response === 'request_cake') {
    if (guest.cake_status === 'pending_address') return '喜餅待補地址'
    if (guest.cake_status === 'pending_send') return '喜餅待寄送'
    if (guest.cake_status === 'sent') return '喜餅已寄出'
    if (guest.cake_status === 'pickup') return '喜餅已領取'
  }

  return '無待辦'
}

function shippingAddressLabel(guest) {
  if (guest.need_invitation) {
    return guest.invitation_address || '未填寫喜帖地址'
  }
  if (guest.decline_response === 'request_cake') {
    return guest.shipping_address || '未填寫喜餅地址'
  }
  return '無寄送地址'
}

let searchTimer
watch(searchQuery, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadGuests, 300)
})

watch(shippingFilter, loadGuests)

watch(
  () => form.value.status,
  (status) => {
    if (status === 'attend') {
      form.value.decline_response = null
      if (!['pending_pickup', 'pickup'].includes(form.value.cake_status)) {
        form.value.cake_status = 'pending_pickup'
      }
      form.value.shipping_recipient = ''
      form.value.shipping_phone = ''
      form.value.shipping_address = ''
      form.value.shipping_date = ''
      form.value.tracking_no = ''
      if (Number(form.value.total_adults || 0) < 1) {
        form.value.total_adults = 1
      }
    } else if (status === 'decline') {
      form.value.need_invitation = false
      form.value.invitation_address = ''
      form.value.invitation_status = 'not_required'
      form.value.total_adults = 0
      form.value.total_children = 0
    }
  },
)

watch(
  () => form.value.decline_response,
  (response) => {
    if (response !== 'request_cake') {
      form.value.cake_status = 'not_required'
      form.value.shipping_recipient = ''
      form.value.shipping_phone = ''
      form.value.shipping_address = ''
      form.value.shipping_date = ''
      form.value.tracking_no = ''
    } else if (form.value.cake_status === 'not_required') {
      form.value.cake_status = 'pending_send'
    }
  },
)

watch(
  () => form.value.need_invitation,
  (needInvitation) => {
    if (!needInvitation) {
      form.value.invitation_address = ''
      form.value.invitation_status = 'not_required'
    } else if (form.value.invitation_status === 'not_required') {
      form.value.invitation_status = 'pending_send'
    }
  },
)

onMounted(loadGuests)
</script>

<template>
  <AdminLayout
    title="寄送待辦"
    eyebrow="Shipping"
    subtitle="列出寄送細節並直接新刪修查"
  >
    <header class="admin-top guest-admin-top">
      <div>
        <p class="eyebrow">Shipping</p>
        <h1>寄送待辦明細</h1>
        <p class="lead">集中管理喜帖與喜餅寄送對象、地址、狀態與追蹤資訊。</p>
      </div>
      <div class="toolbar">
        <button class="btn btn-primary" type="button" @click="startCreateShipping">
          新增待辦
        </button>
        <button class="btn btn-primary" type="button" @click="loadGuests">
          重新整理
        </button>
      </div>
    </header>

    <section class="grid-4 guest-stats">
      <article v-for="item in shippingStats" :key="item.label" class="metric">
        <p class="metric-label">{{ item.label }}</p>
        <p class="metric-value">{{ item.value }}</p>
      </article>
    </section>

    <section class="shipping-layout">
      <section
        class="form-panel shipping-form-panel guest-form-dialog"
        :class="{ 'is-open': isShippingFormOpen }"
        role="dialog"
        aria-modal="true"
        aria-label="寄送待辦表單"
      >
        <div class="summary-group__head">
          <div>
            <p class="eyebrow">{{ editingGuestId ? 'Edit' : 'Create' }}</p>
            <h2>{{ editingGuestId ? '編輯寄送待辦' : '新增寄送待辦' }}</h2>
          </div>
          <div class="toolbar guest-form-dialog__actions">
            <span class="badge badge-neutral">{{ editingGuestId ? '編輯中' : '新資料' }}</span>
            <button class="btn btn-ghost" type="button" @click="closeShippingForm">
              關閉
            </button>
          </div>
        </div>

        <form class="form-grid" @submit.prevent="submitForm">
          <div class="form-grid two">
            <div class="field">
              <label for="shipping-name">姓名</label>
              <input id="shipping-name" v-model="form.name" class="field-control" required />
            </div>
            <div class="field">
              <label for="shipping-phone">電話</label>
              <input id="shipping-phone" v-model="form.phone" class="field-control" required />
            </div>
          </div>

          <div class="form-grid two">
            <div class="field">
              <label for="shipping-email">Email</label>
              <input id="shipping-email" v-model="form.email" class="field-control" type="email" />
            </div>
            <div class="field">
              <label for="shipping-category">分類</label>
              <select id="shipping-category" v-model="form.guest_category" class="field-control">
                <option value="">未分類</option>
                <option v-for="option in CATEGORY_OPTIONS" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
            </div>
          </div>

          <div class="form-grid two">
            <div class="field">
              <label for="shipping-status">出席狀態</label>
              <select id="shipping-status" v-model="form.status" class="field-control">
                <option value="attend">出席</option>
                <option value="decline">不出席</option>
                <option value="undecided">未決定</option>
              </select>
            </div>
            <div class="form-grid two">
              <div class="field">
                <label for="shipping-adults">大人</label>
                <input
                  id="shipping-adults"
                  v-model.number="form.total_adults"
                  class="field-control"
                  min="0"
                  type="number"
                />
              </div>
              <div class="field">
                <label for="shipping-children">小孩</label>
                <input
                  id="shipping-children"
                  v-model.number="form.total_children"
                  class="field-control"
                  min="0"
                  type="number"
                />
              </div>
            </div>
          </div>

          <div class="shipping-switches">
            <label class="inline-check">
              <input v-model="form.need_invitation" type="checkbox" :disabled="form.status === 'decline'" />
              <span>需要喜帖寄送</span>
            </label>
            <label v-if="form.status === 'decline'" class="field">
              <span class="field-label">不出席回覆</span>
              <select v-model="form.decline_response" class="field-control">
                <option :value="null">請選擇</option>
                <option value="blessing_only">只送上祝福</option>
                <option value="request_cake">希望收到喜餅</option>
              </select>
            </label>
          </div>

          <div v-if="form.need_invitation" class="shipping-block">
            <div class="summary-group__head">
              <h3>喜帖資訊</h3>
            </div>
            <div class="form-grid two">
              <div class="field shipping-field-wide">
                <label for="invitation-address">喜帖地址</label>
                <textarea id="invitation-address" v-model="form.invitation_address" class="field-control" />
              </div>
              <div class="field">
                <label for="invitation-status">喜帖狀態</label>
                <select id="invitation-status" v-model="form.invitation_status" class="field-control">
                  <option value="pending_address">待補地址</option>
                  <option value="pending_send">待寄送</option>
                  <option value="sent">已寄出</option>
                  <option value="received">已收件</option>
                </select>
              </div>
            </div>
          </div>

          <div
            v-if="form.status === 'decline' && form.decline_response === 'request_cake'"
            class="shipping-block"
          >
            <div class="summary-group__head">
              <h3>喜餅資訊</h3>
            </div>
            <div class="form-grid two">
              <div class="field">
                <label for="cake-recipient">收件人</label>
                <input id="cake-recipient" v-model="form.shipping_recipient" class="field-control" />
              </div>
              <div class="field">
                <label for="cake-phone">收件電話</label>
                <input id="cake-phone" v-model="form.shipping_phone" class="field-control" />
              </div>
            </div>
            <div class="form-grid two">
              <div class="field shipping-field-wide">
                <label for="cake-address">寄送地址</label>
                <textarea id="cake-address" v-model="form.shipping_address" class="field-control" />
              </div>
              <div class="field">
                <label for="cake-status">喜餅狀態</label>
                <select id="cake-status" v-model="form.cake_status" class="field-control">
                  <option value="pending_address">待補地址</option>
                  <option value="pending_send">待寄送</option>
                  <option value="sent">已寄出</option>
                  <option value="pickup">已領取</option>
                </select>
              </div>
            </div>
            <div class="form-grid two">
              <div class="field">
                <label for="cake-date">寄送日期</label>
                <input id="cake-date" v-model="form.shipping_date" class="field-control" type="date" />
              </div>
              <div class="field">
                <label for="cake-tracking">物流單號</label>
                <input id="cake-tracking" v-model="form.tracking_no" class="field-control" />
              </div>
            </div>
          </div>

          <div class="field">
            <label for="shipping-notes">管理備註</label>
            <textarea id="shipping-notes" v-model="form.admin_notes" class="field-control" />
          </div>

          <div class="toolbar">
            <button class="btn btn-primary" type="submit" :disabled="isSaving">
              {{ isSaving ? '儲存中...' : editingGuestId ? '更新待辦' : '新增待辦' }}
            </button>
            <button class="btn btn-ghost" type="button" @click="cancelShippingForm">
              取消
            </button>
          </div>
        </form>
      </section>

      <section class="shipping-list-panel">
        <section class="panel guest-toolbar">
          <div class="form-grid guest-filters-grid">
            <div class="field">
              <label for="shipping-search">搜尋姓名、電話、地址、分類或備註</label>
              <input
                id="shipping-search"
                v-model="searchQuery"
                class="field-control"
                type="search"
                placeholder="例如：王小美、台北、男方家人"
              />
            </div>

            <button
              class="btn btn-ghost guest-advanced-toggle"
              type="button"
              :aria-expanded="isAdvancedSearchOpen"
              @click="isAdvancedSearchOpen = !isAdvancedSearchOpen"
            >
              {{ isAdvancedSearchOpen ? '收合進階搜尋' : '進階搜尋' }}
            </button>

            <div class="form-grid guest-filter-row" :class="{ 'is-open': isAdvancedSearchOpen }">
              <div class="field">
                <span class="field-label">待辦篩選</span>
                <div class="segmented segmented--shipping">
                  <button
                    v-for="filter in [
                      ['all', '全部'],
                      ['pending', '待補 / 待寄'],
                      ['invitation', '喜帖'],
                      ['cake', '喜餅'],
                    ]"
                    :key="filter[0]"
                    type="button"
                    :class="{ 'is-active': shippingFilter === filter[0] }"
                    @click="shippingFilter = filter[0]"
                  >
                    {{ filter[1] }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <p v-if="errorMessage" class="message message--error">{{ errorMessage }}</p>
        <p v-else-if="successMessage" class="message shipping-success">{{ successMessage }}</p>
        <p v-if="isLoading" class="message">載入中...</p>

        <section v-else class="shipping-list">
          <article
            v-for="guest in visibleGuests"
            :key="guest.id"
            class="shipping-item"
          >
            <div class="shipping-item__head">
              <div>
                <p class="guest-name">{{ guest.name }}</p>
                <p class="guest-sub">
                  {{ guest.phone }}
                  <template v-if="guest.email"> · {{ guest.email }}</template>
                  <template v-if="guest.guest_category"> · {{ guest.guest_category }}</template>
                </p>
              </div>
              <div class="shipping-item__badges">
                <span class="badge badge-neutral">{{ shippingTypeLabel(guest) }}</span>
                <span class="badge" :class="isPendingGuest(guest) ? 'badge-warn' : 'badge-success'">
                  {{ shippingStatusLabel(guest) }}
                </span>
              </div>
            </div>

            <div class="shipping-item__body">
              <div>
                <p class="shipping-label">寄送地址</p>
                <p class="shipping-value">{{ shippingAddressLabel(guest) }}</p>
              </div>
              <div v-if="guest.decline_response === 'request_cake'">
                <p class="shipping-label">收件資訊</p>
                <p class="shipping-value">
                  {{ guest.shipping_recipient || '未填寫' }} · {{ guest.shipping_phone || '未填寫' }}
                </p>
              </div>
              <div>
                <p class="shipping-label">追蹤資訊</p>
                <p class="shipping-value">
                  {{ guest.shipping_date || '未設定日期' }}
                  <template v-if="guest.tracking_no"> · {{ guest.tracking_no }}</template>
                </p>
              </div>
            </div>

            <p v-if="guest.admin_notes" class="guest-sub">備註：{{ guest.admin_notes }}</p>

            <div class="toolbar">
              <button class="btn btn-ghost" type="button" @click="fillForm(guest)">
                編輯
              </button>
              <button class="btn btn-ghost shipping-delete" type="button" @click="removeGuest(guest)">
                刪除
              </button>
            </div>
          </article>

          <p v-if="visibleGuests.length === 0" class="message">
            目前沒有符合條件的寄送待辦
          </p>
        </section>
      </section>
    </section>
  </AdminLayout>
</template>
