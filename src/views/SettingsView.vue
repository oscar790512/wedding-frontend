<script setup>
import { computed, onMounted, reactive, ref } from 'vue'

import {
  createStaffUser,
  fetchAdminRsvpSettings,
  fetchStaffAuditLogs,
  fetchStaffUsers,
  resetStaffPassword,
  updateAdminRsvpSettings,
  updateStaffDisplayName,
  updateStaffStatus,
} from '../api/client'
import AdminLayout from '../components/AdminLayout.vue'
import { formatWeddingDate } from '../utils/date'

const rsvpDeadline = ref('')
const isLoading = ref(true)
const isSaving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const staffUsers = ref([])
const auditLogs = ref([])
const isAccountsLoading = ref(true)
const isCreating = ref(false)
const accountErrorMessage = ref('')
const accountSuccessMessage = ref('')
const showCreatePassword = ref(false)

const createForm = reactive({
  displayName: '',
  username: '',
  password: '',
  passwordConfirmation: '',
})

const dialogMode = ref('')
const selectedUser = ref(null)
const dialogDisplayName = ref('')
const dialogPassword = ref('')
const dialogPasswordConfirmation = ref('')
const showDialogPassword = ref(false)
const dialogErrorMessage = ref('')
const isDialogSaving = ref(false)

const formattedDeadline = computed(() => formatWeddingDate(rsvpDeadline.value))
const dialogTitle = computed(() => {
  if (dialogMode.value === 'display-name') return '修改顯示名稱'
  if (dialogMode.value === 'password') return '重設工作人員密碼'
  if (dialogMode.value === 'status') {
    return selectedUser.value?.is_active ? '停用工作人員帳號' : '重新啟用工作人員帳號'
  }
  return ''
})

const auditActionLabels = {
  created: '建立帳號',
  display_name_updated: '修改顯示名稱',
  password_reset: '重設密碼',
  deactivated: '停用帳號',
  reactivated: '重新啟用帳號',
}

function normalizeUsernameInput() {
  createForm.username = createForm.username.trim().toLowerCase()
}

function formatAuditTime(value) {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

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

async function loadAccountManagement() {
  isAccountsLoading.value = true
  accountErrorMessage.value = ''

  try {
    const [users, logs] = await Promise.all([
      fetchStaffUsers(),
      fetchStaffAuditLogs(),
    ])
    staffUsers.value = users
    auditLogs.value = logs
  } catch (error) {
    accountErrorMessage.value = error.message
  } finally {
    isAccountsLoading.value = false
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

async function handleCreateStaff() {
  accountErrorMessage.value = ''
  accountSuccessMessage.value = ''
  normalizeUsernameInput()

  if (createForm.password !== createForm.passwordConfirmation) {
    accountErrorMessage.value = '兩次輸入的密碼不一致。'
    return
  }

  isCreating.value = true
  try {
    const created = await createStaffUser({
      display_name: createForm.displayName,
      username: createForm.username,
      password: createForm.password,
    })
    createForm.displayName = ''
    createForm.username = ''
    createForm.password = ''
    createForm.passwordConfirmation = ''
    showCreatePassword.value = false
    accountSuccessMessage.value = `已建立 ${created.display_name}（${created.username}）的工作人員帳號。`
    await loadAccountManagement()
  } catch (error) {
    accountErrorMessage.value = error.message
  } finally {
    isCreating.value = false
  }
}

function openDialog(mode, user) {
  dialogMode.value = mode
  selectedUser.value = user
  dialogDisplayName.value = user.display_name
  dialogPassword.value = ''
  dialogPasswordConfirmation.value = ''
  showDialogPassword.value = false
  dialogErrorMessage.value = ''
}

function closeDialog() {
  if (isDialogSaving.value) return
  dialogMode.value = ''
  selectedUser.value = null
  dialogErrorMessage.value = ''
}

async function submitDialog() {
  if (!selectedUser.value) return

  dialogErrorMessage.value = ''
  if (
    dialogMode.value === 'password'
    && dialogPassword.value !== dialogPasswordConfirmation.value
  ) {
    dialogErrorMessage.value = '兩次輸入的密碼不一致。'
    return
  }

  isDialogSaving.value = true
  accountSuccessMessage.value = ''
  try {
    if (dialogMode.value === 'display-name') {
      await updateStaffDisplayName(
        selectedUser.value.username,
        dialogDisplayName.value,
      )
      accountSuccessMessage.value = `已更新 ${selectedUser.value.username} 的顯示名稱。`
    } else if (dialogMode.value === 'password') {
      await resetStaffPassword(
        selectedUser.value.username,
        dialogPassword.value,
      )
      accountSuccessMessage.value = `已重設 ${selectedUser.value.username} 的密碼，既有登入已失效。`
    } else if (dialogMode.value === 'status') {
      const nextStatus = !selectedUser.value.is_active
      await updateStaffStatus(selectedUser.value.username, nextStatus)
      accountSuccessMessage.value = nextStatus
        ? `已重新啟用 ${selectedUser.value.username}。`
        : `已停用 ${selectedUser.value.username}，既有登入已失效。`
    }

    dialogMode.value = ''
    selectedUser.value = null
    await loadAccountManagement()
  } catch (error) {
    dialogErrorMessage.value = error.message
  } finally {
    isDialogSaving.value = false
  }
}

onMounted(() => {
  loadSettings()
  loadAccountManagement()
})
</script>

<template>
  <AdminLayout
    title="系統設定"
    eyebrow="Settings"
    subtitle="公開 RSVP 與工作人員帳號管理"
  >
    <header class="admin-top">
      <div>
        <p class="eyebrow">Settings</p>
        <h1>系統設定</h1>
        <p class="lead">管理公開 RSVP 資訊與工作人員的後台存取權限。</p>
      </div>
    </header>

    <div class="settings-stack">
      <p v-if="isLoading" class="message">載入 RSVP 設定中...</p>

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

      <section class="panel settings-panel account-management-panel">
        <div class="section-head settings-panel__head">
          <div>
            <p class="eyebrow">Staff Access</p>
            <h2>工作人員帳號管理</h2>
            <p class="muted">建立的帳號只能使用婚禮作業功能，無法進入系統設定。</p>
          </div>
        </div>

        <form class="settings-form staff-create-form" @submit.prevent="handleCreateStaff">
          <h3>建立工作人員</h3>
          <div class="staff-create-grid">
            <div class="field">
              <label for="staff-display-name">顯示名稱</label>
              <input
                id="staff-display-name"
                v-model="createForm.displayName"
                class="field-control"
                maxlength="50"
                required
                autocomplete="off"
                placeholder="例如：怡君"
              />
            </div>

            <div class="field">
              <label for="staff-username">登入帳號</label>
              <input
                id="staff-username"
                v-model="createForm.username"
                class="field-control"
                minlength="3"
                maxlength="32"
                pattern="[A-Za-z0-9._\-]+"
                required
                autocomplete="off"
                placeholder="例如：frontdesk-1"
                @blur="normalizeUsernameInput"
              />
              <p class="settings-preview">3–32 個英文字母、數字、句點、底線或連字號。</p>
            </div>

            <div class="field">
              <label for="staff-password">密碼</label>
              <div class="password-field">
                <input
                  id="staff-password"
                  v-model="createForm.password"
                  class="field-control"
                  :type="showCreatePassword ? 'text' : 'password'"
                  minlength="8"
                  maxlength="128"
                  required
                  autocomplete="new-password"
                />
                <button
                  class="password-toggle"
                  type="button"
                  :aria-label="showCreatePassword ? '隱藏密碼' : '顯示密碼'"
                  @click="showCreatePassword = !showCreatePassword"
                >
                  {{ showCreatePassword ? '隱藏' : '顯示' }}
                </button>
              </div>
            </div>

            <div class="field">
              <label for="staff-password-confirmation">確認密碼</label>
              <input
                id="staff-password-confirmation"
                v-model="createForm.passwordConfirmation"
                class="field-control"
                :type="showCreatePassword ? 'text' : 'password'"
                minlength="8"
                maxlength="128"
                required
                autocomplete="new-password"
              />
            </div>
          </div>

          <p v-if="accountErrorMessage" class="message message--error">
            {{ accountErrorMessage }}
          </p>
          <p v-if="accountSuccessMessage" class="success-note is-visible">
            {{ accountSuccessMessage }}
          </p>

          <div class="actions">
            <button class="btn btn-primary" type="submit" :disabled="isCreating">
              {{ isCreating ? '建立中...' : '建立工作人員帳號' }}
            </button>
          </div>
        </form>

        <div class="staff-list-section">
          <div class="section-head staff-list-head">
            <div>
              <h3>現有工作人員</h3>
              <p class="muted">帳號建立後不可修改；顯示名稱、密碼與啟用狀態可由管理員調整。</p>
            </div>
          </div>

          <p v-if="isAccountsLoading" class="message">載入帳號中...</p>
          <p v-else-if="staffUsers.length === 0" class="empty-state">尚未建立工作人員帳號。</p>
          <div v-else class="staff-account-list">
            <article
              v-for="user in staffUsers"
              :key="user.username"
              class="staff-account-row"
              :class="{ 'is-disabled': !user.is_active }"
            >
              <div class="staff-account-identity">
                <div>
                  <strong>{{ user.display_name }}</strong>
                  <p>@{{ user.username }}</p>
                </div>
                <span :class="['badge', user.is_active ? 'badge-success' : 'badge-neutral']">
                  {{ user.is_active ? '啟用中' : '已停用' }}
                </span>
              </div>
              <div class="staff-account-actions">
                <button class="btn btn-ghost" type="button" @click="openDialog('display-name', user)">
                  改名稱
                </button>
                <button class="btn btn-ghost" type="button" @click="openDialog('password', user)">
                  重設密碼
                </button>
                <button
                  :class="['btn', user.is_active ? 'btn-danger-outline' : 'btn-ghost']"
                  type="button"
                  @click="openDialog('status', user)"
                >
                  {{ user.is_active ? '停用' : '重新啟用' }}
                </button>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section class="panel settings-panel audit-panel">
        <div class="section-head settings-panel__head">
          <div>
            <p class="eyebrow">Audit Log</p>
            <h2>最近帳號操作</h2>
            <p class="muted">顯示最近 20 筆工作人員帳號異動，不記錄任何密碼內容。</p>
          </div>
        </div>

        <p v-if="isAccountsLoading" class="message">載入操作紀錄中...</p>
        <p v-else-if="auditLogs.length === 0" class="empty-state">尚無帳號操作紀錄。</p>
        <ol v-else class="audit-list">
          <li v-for="log in auditLogs" :key="`${log.created_at}-${log.target_username}-${log.action}`">
            <div>
              <strong>{{ log.actor_username }}</strong>
              <span>{{ auditActionLabels[log.action] || log.action }}</span>
              <strong>@{{ log.target_username }}</strong>
            </div>
            <time :datetime="log.created_at">{{ formatAuditTime(log.created_at) }}</time>
          </li>
        </ol>
      </section>
    </div>

    <div
      v-if="dialogMode"
      class="dialog-backdrop"
      role="presentation"
      @click.self="closeDialog"
    >
      <section class="dialog-card staff-account-dialog" role="dialog" aria-modal="true">
        <div class="section-head staff-dialog-head">
          <div>
            <p class="eyebrow">@{{ selectedUser?.username }}</p>
            <h2>{{ dialogTitle }}</h2>
          </div>
          <button class="btn btn-ghost" type="button" :disabled="isDialogSaving" @click="closeDialog">
            關閉
          </button>
        </div>

        <form class="settings-form" @submit.prevent="submitDialog">
          <div v-if="dialogMode === 'display-name'" class="field">
            <label for="dialog-display-name">顯示名稱</label>
            <input
              id="dialog-display-name"
              v-model="dialogDisplayName"
              class="field-control"
              maxlength="50"
              required
              autocomplete="off"
            />
          </div>

          <template v-else-if="dialogMode === 'password'">
            <p class="message">儲存後，這個帳號在其他裝置上的既有登入會立即失效。</p>
            <div class="field">
              <label for="dialog-password">新密碼</label>
              <div class="password-field">
                <input
                  id="dialog-password"
                  v-model="dialogPassword"
                  class="field-control"
                  :type="showDialogPassword ? 'text' : 'password'"
                  minlength="8"
                  maxlength="128"
                  required
                  autocomplete="new-password"
                />
                <button
                  class="password-toggle"
                  type="button"
                  :aria-label="showDialogPassword ? '隱藏密碼' : '顯示密碼'"
                  @click="showDialogPassword = !showDialogPassword"
                >
                  {{ showDialogPassword ? '隱藏' : '顯示' }}
                </button>
              </div>
            </div>
            <div class="field">
              <label for="dialog-password-confirmation">確認新密碼</label>
              <input
                id="dialog-password-confirmation"
                v-model="dialogPasswordConfirmation"
                class="field-control"
                :type="showDialogPassword ? 'text' : 'password'"
                minlength="8"
                maxlength="128"
                required
                autocomplete="new-password"
              />
            </div>
          </template>

          <p v-else-if="dialogMode === 'status'" class="message">
            <template v-if="selectedUser?.is_active">
              停用後，{{ selectedUser.display_name }} 將無法登入，既有登入也會立即失效。
            </template>
            <template v-else>
              重新啟用後，{{ selectedUser?.display_name }} 可以使用原密碼登入。
            </template>
          </p>

          <p v-if="dialogErrorMessage" class="message message--error">
            {{ dialogErrorMessage }}
          </p>

          <div class="actions staff-dialog-actions">
            <button class="btn btn-ghost" type="button" :disabled="isDialogSaving" @click="closeDialog">
              取消
            </button>
            <button
              :class="['btn', dialogMode === 'status' && selectedUser?.is_active ? 'btn-danger' : 'btn-primary']"
              type="submit"
              :disabled="isDialogSaving"
            >
              {{ isDialogSaving ? '處理中...' : '確認' }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </AdminLayout>
</template>
