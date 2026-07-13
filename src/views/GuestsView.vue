<script setup>
import { computed, onMounted, ref, watch } from 'vue'

import {
  createGuest,
  deleteGuest,
  fetchGuests,
  fetchTableSettings,
  patchGuest,
} from '../api/client'
import AdminLayout from '../components/AdminLayout.vue'

const CATEGORY_OPTIONS = [
  '男方同事',
  '女方同事',
  '男方朋友',
  '女方朋友',
  '男方家人',
  '女方家人',
]

const guests = ref([])
const tableSettings = ref([])
const searchQuery = ref('')
const statusFilter = ref('all')
const shippingFilter = ref('all')
const categoryFilter = ref('all')
const tableFilter = ref('all')
const dietFilter = ref('all')
const isLoading = ref(false)
const isSaving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const editingGuestId = ref(null)
const isGuestFormOpen = ref(false)
const isAdvancedSearchOpen = ref(false)

function createInitialForm() {
  return {
    name: '',
    phone: '',
    email: '',
    guest_category: '',
    status: 'attend',
    total_adults: 1,
    total_children: 0,
    child_seats: 0,
    vegetarian_count: 0,
    diet_notes: '',
    allergy_notes: '',
    need_invitation: false,
    invitation_address: '',
    invitation_status: 'not_required',
    decline_response: null,
    blessing_message: '',
    cake_status: 'not_required',
    shipping_recipient: '',
    shipping_phone: '',
    shipping_address: '',
    shipping_date: '',
    tracking_no: '',
    allocated_table: '',
    actual_adults: '',
    actual_children: '',
    is_arrived: false,
    gift_amount: 0,
    admin_notes: '',
  }
}

const form = ref(createInitialForm())

const categoryOptions = computed(() => {
  const values = new Set(CATEGORY_OPTIONS)
  for (const guest of guests.value) {
    if (guest.guest_category) {
      values.add(guest.guest_category)
    }
  }
  return Array.from(values)
})

const tableOptions = computed(() => {
  const values = new Set(tableSettings.value.map((item) => item.table_name))
  for (const guest of guests.value) {
    if (guest.allocated_table) {
      values.add(guest.allocated_table)
    }
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b, 'zh-Hant'))
})

const listStats = computed(() => {
  const total = guests.value.length
  const attend = guests.value.filter((guest) => guest.status === 'attend').length
  const shipping = guests.value.filter(
    (guest) => guest.need_invitation || guest.decline_response === 'request_cake',
  ).length
  const undecided = guests.value.filter((guest) => guest.status === 'undecided').length

  return [
    { label: '全部名單', value: total },
    { label: '確認出席', value: attend },
    { label: '寄送待辦', value: shipping },
    { label: '未回覆', value: undecided },
  ]
})

function normalizeQueryValue(value) {
  return value === 'all' ? undefined : value
}

async function loadGuests() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    const [guestData, settingData] = await Promise.all([
      fetchGuests({
        q: searchQuery.value.trim(),
        status: normalizeQueryValue(statusFilter.value),
        shipping: normalizeQueryValue(shippingFilter.value),
        category: normalizeQueryValue(categoryFilter.value),
        table: normalizeQueryValue(tableFilter.value),
        has_diet_notes:
          dietFilter.value === 'with'
            ? true
            : dietFilter.value === 'without'
              ? false
              : undefined,
      }),
      fetchTableSettings(),
    ])

    guests.value = guestData
    tableSettings.value = settingData
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

function resetForm() {
  editingGuestId.value = null
  form.value = createInitialForm()
  successMessage.value = ''
}

function openGuestForm() {
  isGuestFormOpen.value = true
}

function startCreateGuest() {
  resetForm()
  openGuestForm()
}

function closeGuestForm() {
  if (isSaving.value) return
  isGuestFormOpen.value = false
}

function cancelGuestForm() {
  resetForm()
  closeGuestForm()
}

function fillForm(guest) {
  editingGuestId.value = guest.id
  form.value = {
    name: guest.name || '',
    phone: guest.phone || '',
    email: guest.email || '',
    guest_category: guest.guest_category || '',
    status: guest.status || 'undecided',
    total_adults: Number(guest.total_adults || 0),
    total_children: Number(guest.total_children || 0),
    child_seats: Number(guest.child_seats || 0),
    vegetarian_count: Number(guest.vegetarian_count || 0),
    diet_notes: guest.diet_notes || '',
    allergy_notes: guest.allergy_notes || '',
    need_invitation: Boolean(guest.need_invitation),
    invitation_address: guest.invitation_address || '',
    invitation_status: guest.invitation_status || 'not_required',
    decline_response: guest.decline_response || null,
    blessing_message: guest.blessing_message || '',
    cake_status: guest.cake_status || 'not_required',
    shipping_recipient: guest.shipping_recipient || '',
    shipping_phone: guest.shipping_phone || '',
    shipping_address: guest.shipping_address || '',
    shipping_date: guest.shipping_date || '',
    tracking_no: guest.tracking_no || '',
    allocated_table: guest.allocated_table || '',
    actual_adults: guest.actual_adults ?? '',
    actual_children: guest.actual_children ?? '',
    is_arrived: Boolean(guest.is_arrived),
    gift_amount: Number(guest.gift_amount || 0),
    admin_notes: guest.admin_notes || '',
  }
  successMessage.value = ''
  openGuestForm()
}

function buildPayload() {
  return {
    name: form.value.name,
    phone: form.value.phone,
    email: form.value.email || null,
    guest_category: form.value.guest_category || null,
    status: form.value.status,
    total_adults: Number(form.value.total_adults || 0),
    total_children: Number(form.value.total_children || 0),
    child_seats: Number(form.value.child_seats || 0),
    vegetarian_count: Number(form.value.vegetarian_count || 0),
    diet_notes: form.value.diet_notes || null,
    allergy_notes: form.value.allergy_notes || null,
    need_invitation: form.value.need_invitation,
    invitation_address: form.value.need_invitation ? form.value.invitation_address : null,
    invitation_status: form.value.need_invitation ? form.value.invitation_status : 'not_required',
    decline_response: form.value.status === 'decline' ? form.value.decline_response : null,
    blessing_message:
      form.value.status === 'decline' ? form.value.blessing_message || null : null,
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
      form.value.status === 'decline'
      && form.value.decline_response === 'request_cake'
      && form.value.shipping_date
        ? form.value.shipping_date
        : null,
    tracking_no:
      form.value.status === 'decline' && form.value.decline_response === 'request_cake'
        ? form.value.tracking_no || null
        : null,
    allocated_table: form.value.allocated_table || null,
    actual_adults: form.value.actual_adults === '' ? null : Number(form.value.actual_adults),
    actual_children:
      form.value.actual_children === '' ? null : Number(form.value.actual_children),
    is_arrived: form.value.is_arrived,
    gift_amount: Number(form.value.gift_amount || 0),
    admin_notes: form.value.admin_notes || null,
  }
}

async function submitForm() {
  isSaving.value = true
  errorMessage.value = ''

  try {
    const payload = buildPayload()

    if (editingGuestId.value) {
      await patchGuest(editingGuestId.value, payload)
      successMessage.value = '賓客資料已更新'
    } else {
      await createGuest(payload)
      successMessage.value = '賓客資料已新增'
    }

    resetForm()
    await loadGuests()
    closeGuestForm()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isSaving.value = false
  }
}

async function removeGuest(guest) {
  if (!window.confirm(`確定刪除 ${guest.name}？`)) {
    return
  }

  errorMessage.value = ''
  successMessage.value = ''

  try {
    await deleteGuest(guest.id)
    if (editingGuestId.value === guest.id) {
      resetForm()
    }
    successMessage.value = '賓客資料已刪除'
    await loadGuests()
  } catch (error) {
    errorMessage.value = error.message
  }
}

function statusLabel(status) {
  if (status === 'attend') return '出席'
  if (status === 'decline') return '不出席'
  return '未決定'
}

function declineResponseLabel(response) {
  if (response === 'blessing_only') return '只送上祝福'
  if (response === 'request_cake') return '希望收到喜餅'
  return '未選擇'
}

function invitationStatusLabel(status) {
  if (status === 'pending_address') return '待補地址'
  if (status === 'pending_send') return '待寄送'
  if (status === 'sent') return '已寄出'
  if (status === 'received') return '已收件'
  return '不需要'
}

function cakeStatusLabel(status) {
  if (status === 'pending_pickup') return '待現場領餅'
  if (status === 'pending_address') return '待補地址'
  if (status === 'pending_send') return '待寄送'
  if (status === 'sent') return '已寄出'
  if (status === 'pickup') return '已領取'
  return '不需要'
}

function shippingLabel(guest) {
  if (guest.need_invitation && guest.decline_response === 'request_cake') {
    return '喜帖 + 喜餅'
  }
  if (guest.need_invitation) {
    return '喜帖'
  }
  if (guest.decline_response === 'request_cake') {
    return '喜餅'
  }
  return '無寄送待辦'
}

function dietSummary(guest) {
  const items = []
  const vegetarianCount =
    Number(guest.vegetarian_count || 0)
    || Number(guest.vegetarian_adults || 0)
    + Number(guest.vegetarian_children || 0)

  if (vegetarianCount > 0) {
    items.push(`素食 ${vegetarianCount}`)
  }
  if (guest.allergy_notes) {
    items.push(`過敏：${guest.allergy_notes}`)
  }
  if (guest.diet_notes) {
    items.push(guest.diet_notes)
  }

  return items.join(' / ') || '無特殊飲食需求'
}

function attendanceSummary(guest) {
  const actualAdults = guest.actual_adults ?? '-'
  const actualChildren = guest.actual_children ?? '-'
  return `實到 大人 ${actualAdults} / 小孩 ${actualChildren}`
}

let searchTimer
watch(searchQuery, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadGuests, 300)
})

watch([statusFilter, shippingFilter, categoryFilter, tableFilter, dietFilter], loadGuests)

watch(
  () => form.value.status,
  (status) => {
    if (status === 'attend') {
      form.value.decline_response = null
      form.value.blessing_message = ''
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
      form.value.child_seats = 0
      form.value.vegetarian_count = 0
      form.value.diet_notes = ''
      form.value.allergy_notes = ''
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
    title="賓客管理"
    eyebrow="Guest Management"
    subtitle="完整名單、進階篩選與新刪修查"
  >
    <header class="admin-top guest-admin-top">
      <div>
        <p class="eyebrow">Guest management</p>
        <h1>完整賓客名單</h1>
        <p class="lead">集中整理 RSVP、桌號、飲食需求、寄送資料、現場狀態與內部備註。</p>
      </div>
      <div class="toolbar">
        <button class="btn btn-primary" type="button" @click="startCreateGuest">
          新增賓客
        </button>
        <button class="btn btn-primary" type="button" @click="loadGuests">
          重新整理
        </button>
      </div>
    </header>

    <section class="grid-4 guest-stats">
      <article v-for="item in listStats" :key="item.label" class="metric">
        <p class="metric-label">{{ item.label }}</p>
        <p class="metric-value">{{ item.value }}</p>
      </article>
    </section>

    <section class="shipping-layout">
      <section
        class="form-panel shipping-form-panel guest-form-dialog"
        :class="{ 'is-open': isGuestFormOpen }"
        role="dialog"
        aria-modal="true"
        aria-label="賓客表單"
      >
        <div class="summary-group__head">
          <div>
            <p class="eyebrow">{{ editingGuestId ? 'Edit' : 'Create' }}</p>
            <h2>{{ editingGuestId ? '編輯賓客' : '新增賓客' }}</h2>
          </div>
          <div class="toolbar guest-form-dialog__actions">
            <span class="badge badge-neutral">{{ editingGuestId ? '編輯中' : '新資料' }}</span>
            <button class="btn btn-ghost" type="button" @click="closeGuestForm">
              關閉
            </button>
          </div>
        </div>

        <form class="form-grid" @submit.prevent="submitForm">
          <div class="form-grid two">
            <div class="field">
              <label for="guest-name">姓名</label>
              <input id="guest-name" v-model="form.name" class="field-control" required />
            </div>
            <div class="field">
              <label for="guest-phone">電話</label>
              <input id="guest-phone" v-model="form.phone" class="field-control" required />
            </div>
          </div>

          <div class="form-grid two">
            <div class="field">
              <label for="guest-email">Email</label>
              <input id="guest-email" v-model="form.email" class="field-control" type="email" />
            </div>
            <div class="field">
              <label for="guest-category">分類</label>
              <select id="guest-category" v-model="form.guest_category" class="field-control">
                <option value="">未分類</option>
                <option v-for="option in categoryOptions" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
            </div>
          </div>

          <div class="form-grid two">
            <div class="field">
              <label for="guest-status">出席狀態</label>
              <select id="guest-status" v-model="form.status" class="field-control">
                <option value="attend">出席</option>
                <option value="decline">不出席</option>
                <option value="undecided">未決定</option>
              </select>
            </div>
            <div class="field">
              <label for="guest-table">桌次</label>
              <select id="guest-table" v-model="form.allocated_table" class="field-control">
                <option value="">未分桌</option>
                <option v-for="option in tableOptions" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
            </div>
          </div>

          <div class="form-grid two">
            <div class="form-grid two">
              <div class="field">
                <label for="guest-adults">大人</label>
                <input id="guest-adults" v-model.number="form.total_adults" class="field-control" min="0" type="number" />
              </div>
              <div class="field">
                <label for="guest-children">小孩</label>
                <input id="guest-children" v-model.number="form.total_children" class="field-control" min="0" type="number" />
              </div>
            </div>
            <div class="form-grid two">
              <div class="field">
                <label for="guest-seats">兒童座椅</label>
                <input id="guest-seats" v-model.number="form.child_seats" class="field-control" min="0" type="number" />
              </div>
              <div class="field">
                <label for="guest-vegetarian">素食人數</label>
                <input id="guest-vegetarian" v-model.number="form.vegetarian_count" class="field-control" min="0" type="number" />
              </div>
            </div>
          </div>

          <div class="form-grid two">
            <div class="field">
              <label for="guest-diet">飲食備註</label>
              <textarea id="guest-diet" v-model="form.diet_notes" class="field-control" />
            </div>
            <div class="field">
              <label for="guest-allergy">過敏 / 特殊需求</label>
              <textarea id="guest-allergy" v-model="form.allergy_notes" class="field-control" />
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
                <label for="guest-invitation-address">喜帖地址</label>
                <textarea id="guest-invitation-address" v-model="form.invitation_address" class="field-control" />
              </div>
              <div class="field">
                <label for="guest-invitation-status">喜帖狀態</label>
                <select id="guest-invitation-status" v-model="form.invitation_status" class="field-control">
                  <option value="pending_address">待補地址</option>
                  <option value="pending_send">待寄送</option>
                  <option value="sent">已寄出</option>
                  <option value="received">已收件</option>
                </select>
              </div>
            </div>
          </div>

          <div v-if="form.status === 'decline'" class="shipping-block">
            <div class="summary-group__head">
              <h3>不出席資訊</h3>
            </div>
            <div class="field">
              <label for="guest-blessing">祝福訊息</label>
              <textarea id="guest-blessing" v-model="form.blessing_message" class="field-control" />
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
                <label for="guest-shipping-recipient">收件人</label>
                <input id="guest-shipping-recipient" v-model="form.shipping_recipient" class="field-control" />
              </div>
              <div class="field">
                <label for="guest-shipping-phone">收件電話</label>
                <input id="guest-shipping-phone" v-model="form.shipping_phone" class="field-control" />
              </div>
            </div>
            <div class="form-grid two">
              <div class="field shipping-field-wide">
                <label for="guest-shipping-address">寄送地址</label>
                <textarea id="guest-shipping-address" v-model="form.shipping_address" class="field-control" />
              </div>
              <div class="field">
                <label for="guest-cake-status">喜餅狀態</label>
                <select id="guest-cake-status" v-model="form.cake_status" class="field-control">
                  <option value="pending_address">待補地址</option>
                  <option value="pending_send">待寄送</option>
                  <option value="sent">已寄出</option>
                  <option value="pickup">已領取</option>
                </select>
              </div>
            </div>
            <div class="form-grid two">
              <div class="field">
                <label for="guest-shipping-date">寄送日期</label>
                <input id="guest-shipping-date" v-model="form.shipping_date" class="field-control" type="date" />
              </div>
              <div class="field">
                <label for="guest-tracking-no">物流單號</label>
                <input id="guest-tracking-no" v-model="form.tracking_no" class="field-control" />
              </div>
            </div>
          </div>

          <div class="shipping-block">
            <div class="summary-group__head">
              <h3>現場資訊</h3>
            </div>
            <div class="form-grid two">
              <div class="form-grid two">
                <div class="field">
                  <label for="guest-actual-adults">實到大人</label>
                  <input id="guest-actual-adults" v-model.number="form.actual_adults" class="field-control" min="0" type="number" />
                </div>
                <div class="field">
                  <label for="guest-actual-children">實到小孩</label>
                  <input id="guest-actual-children" v-model.number="form.actual_children" class="field-control" min="0" type="number" />
                </div>
              </div>
              <div class="form-grid two">
                <div class="field">
                  <label for="guest-gift-amount">禮金</label>
                  <input id="guest-gift-amount" v-model.number="form.gift_amount" class="field-control" min="0" type="number" />
                </div>
                <label class="inline-check guest-inline-toggle">
                  <input v-model="form.is_arrived" type="checkbox" />
                  <span>已到場</span>
                </label>
              </div>
            </div>
          </div>

          <div class="field">
            <label for="guest-admin-notes">管理備註</label>
            <textarea id="guest-admin-notes" v-model="form.admin_notes" class="field-control" />
          </div>

          <div class="toolbar">
            <button class="btn btn-primary" type="submit" :disabled="isSaving">
              {{ isSaving ? '儲存中...' : editingGuestId ? '更新賓客' : '新增賓客' }}
            </button>
            <button class="btn btn-ghost" type="button" @click="cancelGuestForm">
              取消
            </button>
          </div>
        </form>
      </section>

      <section class="shipping-list-panel">
        <section class="panel guest-toolbar">
          <div class="form-grid guest-filters-grid">
            <div class="field">
              <label for="guest-search">搜尋姓名、電話、Email、分類、桌號或備註</label>
              <input
                id="guest-search"
                v-model="searchQuery"
                class="field-control"
                type="search"
                placeholder="例如：林怡君、0912、主桌、男方家人"
                autocomplete="off"
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
                <label for="guest-filter-status">出席狀態</label>
                <select id="guest-filter-status" v-model="statusFilter" class="field-control">
                  <option value="all">全部</option>
                  <option value="attend">出席</option>
                  <option value="decline">不出席</option>
                  <option value="undecided">未決定</option>
                </select>
              </div>

              <div class="field">
                <label for="guest-filter-shipping">寄送篩選</label>
                <select id="guest-filter-shipping" v-model="shippingFilter" class="field-control">
                  <option value="all">全部</option>
                  <option value="pending">待補 / 待寄</option>
                  <option value="invitation">喜帖</option>
                  <option value="cake">喜餅</option>
                </select>
              </div>

              <div class="field">
                <label for="guest-filter-category">分類</label>
                <select id="guest-filter-category" v-model="categoryFilter" class="field-control">
                  <option value="all">全部</option>
                  <option v-for="option in categoryOptions" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
              </div>

              <div class="field">
                <label for="guest-filter-table">桌次</label>
                <select id="guest-filter-table" v-model="tableFilter" class="field-control">
                  <option value="all">全部</option>
                  <option v-for="option in tableOptions" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
              </div>

              <div class="field">
                <label for="guest-filter-diet">飲食需求</label>
                <select id="guest-filter-diet" v-model="dietFilter" class="field-control">
                  <option value="all">全部</option>
                  <option value="with">有備註</option>
                  <option value="without">無備註</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <p v-if="errorMessage" class="message message--error">{{ errorMessage }}</p>
        <p v-else-if="successMessage" class="message shipping-success">{{ successMessage }}</p>
        <p v-if="isLoading" class="message">載入中...</p>

        <section v-else class="shipping-list">
          <article v-for="guest in guests" :key="guest.id" class="shipping-item guest-card">
            <div class="shipping-item__head guest-card__head">
              <div>
                <p class="guest-name">{{ guest.name }}</p>
                <p class="guest-sub">
                  {{ guest.phone }}
                  <template v-if="guest.email"> · {{ guest.email }}</template>
                  <template v-if="guest.guest_category"> · {{ guest.guest_category }}</template>
                </p>
              </div>
              <div class="shipping-item__badges">
                <span class="badge" :class="`badge--${guest.status}`">
                  {{ statusLabel(guest.status) }}
                </span>
                <span v-if="guest.is_arrived" class="badge badge-success">已到場</span>
                <span class="badge badge-neutral">{{ shippingLabel(guest) }}</span>
              </div>
            </div>

            <div class="shipping-item__body guest-card__body">
              <div>
                <p class="shipping-label">桌次與人數</p>
                <p class="shipping-value">
                  {{ guest.allocated_table || '未分桌' }} · 大人 {{ guest.total_adults }} / 小孩 {{ guest.total_children }}
                </p>
                <p class="guest-sub">{{ attendanceSummary(guest) }}</p>
              </div>

              <div>
                <p class="shipping-label">飲食需求</p>
                <p class="shipping-value">{{ dietSummary(guest) }}</p>
              </div>

              <div>
                <p class="shipping-label">寄送狀態</p>
                <p class="shipping-value">
                  喜帖 {{ invitationStatusLabel(guest.invitation_status) }}
                  <template v-if="guest.decline_response === 'request_cake'">
                    · 喜餅 {{ cakeStatusLabel(guest.cake_status) }}
                  </template>
                  <template v-else-if="guest.status === 'attend'">
                    · 喜餅 {{ cakeStatusLabel(guest.cake_status) }}
                  </template>
                </p>
                <p v-if="guest.need_invitation && guest.invitation_address" class="guest-sub">
                  喜帖地址：{{ guest.invitation_address }}
                </p>
                <p v-if="guest.shipping_address" class="guest-sub">
                  喜餅地址：{{ guest.shipping_address }}
                </p>
              </div>
            </div>

            <div class="guest-card__extra">
              <p class="guest-sub">
                禮金：${{ Number(guest.gift_amount || 0).toLocaleString() }}
              </p>
              <p v-if="guest.decline_response" class="guest-sub">
                不出席回覆：{{ declineResponseLabel(guest.decline_response) }}
              </p>
              <p v-if="guest.blessing_message" class="guest-sub">
                祝福：{{ guest.blessing_message }}
              </p>
              <p v-if="guest.admin_notes" class="guest-sub">
                備註：{{ guest.admin_notes }}
              </p>
              <p v-if="guest.tracking_no || guest.shipping_date" class="guest-sub">
                物流：{{ guest.shipping_date || '未設定日期' }}<template v-if="guest.tracking_no"> · {{ guest.tracking_no }}</template>
              </p>
            </div>

            <div class="toolbar">
              <button class="btn btn-ghost" type="button" @click="fillForm(guest)">
                編輯
              </button>
              <button class="btn btn-ghost shipping-delete" type="button" @click="removeGuest(guest)">
                刪除
              </button>
            </div>
          </article>

          <p v-if="guests.length === 0" class="message">
            找不到符合條件的賓客
          </p>
        </section>
      </section>
    </section>
  </AdminLayout>
</template>
