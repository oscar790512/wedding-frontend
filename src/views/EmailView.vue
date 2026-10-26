<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AdminLayout from '../components/AdminLayout.vue'
import { fetchAllGuests, fetchEmailOverview, previewWeddingEmail, sendWeddingEmail, fetchEmailBatch, resumeEmailBatch } from '../api/client'

const guests = ref([])
const overview = ref(null)
const content = ref(null)
const selected = ref([])
const search = ref('')
const error = ref('')
const busy = ref(false)
const loading = ref(true)
const preview = ref(null)
const previewDialog = ref(null)
const previewGuestId = ref('')
const previewRequest = ref(null)
const batch = ref(null)
const currentBatchId = ref('')
const message = ref('')
let pollTimer
let disposed = false
let previousFocus
let previousOverflow = ''
const fields = [
  ['subject', '信件主旨', false], ['message', '給賓客的文字', true],
  ['wedding_time', '婚禮時間', false], ['venue', '婚宴地點', false],
  ['address', '婚宴地址', false], ['parking', '停車建議', true],
  ['invitation_url', '電子喜帖網址', false], ['line_url', '新人 LINE 官方連結', false], ['line_id', '新人 LINE ID', false],
]
const labels = { pending: '待寄送', sending: '寄送中', sent: 'Gmail 已接受', failed: '寄送失敗', unknown: '待人工確認' }
const deliveryByGuest = computed(() => new Map((overview.value?.deliveries || []).map(item => [item.guest_id, item])))
function disabledReason(guest) {
  if (!guest.email) return '尚未填寫 Email'
  if (!guest.checkin_token) return '尚無報到碼'
  const record = deliveryByGuest.value.get(guest.id)
  if (record && record.status !== 'failed') return labels[record.status] || '已有寄送紀錄'
  return ''
}
const visibleGuests = computed(() => guests.value.filter(g => `${g.name} ${g.email || ''}`.toLowerCase().includes(search.value.trim().toLowerCase())))
const selectedGuests = computed(() => guests.value.filter(g => selected.value.includes(g.id)))
const counts = computed(() => Object.fromEntries(Object.keys(labels).map(key => [key, (batch.value?.deliveries || []).filter(row => row.status === key).length])))
const total = computed(() => batch.value?.deliveries.length || 0)
const completed = computed(() => counts.value.sent + counts.value.failed + counts.value.unknown)
const canSend = computed(() => overview.value?.smtp_ready && overview.value?.storage_ready)

function invalidatePreview() { preview.value = null; previewRequest.value = null }
watch(content, invalidatePreview, { deep: true })
watch(selected, invalidatePreview, { deep: true })
watch(preview, async (value, oldValue) => {
  if (value && !oldValue) {
    previousFocus = document.activeElement
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    await nextTick()
    previewDialog.value?.focus()
  } else if (!value && oldValue) {
    document.body.style.overflow = previousOverflow
    previousFocus?.focus()
  }
})
function trapFocus(event) {
  const items = [...previewDialog.value.querySelectorAll('button:not(:disabled), select:not(:disabled), iframe')]
  const first = items[0], last = items.at(-1)
  if (event.shiftKey && (document.activeElement === first || document.activeElement === previewDialog.value)) {
    event.preventDefault(); last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first?.focus()
  }
}
function selectVisible() {
  selected.value = [...new Set([...selected.value, ...visibleGuests.value.filter(g => !disabledReason(g)).map(g => g.id)])]
}
async function load() {
  loading.value = true
  error.value = ''
  try {
    const [guestData, data] = await Promise.all([fetchAllGuests({ status: 'attend' }), fetchEmailOverview()])
    guests.value = guestData
    overview.value = data
    content.value = data.content
    const saved = localStorage.getItem('weddingEmailBatch')
    const latest = data.batches.find(item => item.id === saved) || data.batches[0]
    if (latest) { currentBatchId.value = latest.id; await poll() }
  } catch (err) { error.value = err.message }
  finally { loading.value = false }
}
async function showPreview() {
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    if (!selected.value.includes(previewGuestId.value)) previewGuestId.value = selected.value[0]
    const payload = { guest_ids: [...selected.value], content: { ...content.value }, preview_guest_id: previewGuestId.value }
    const result = await previewWeddingEmail(payload)
    // Keep exactly the reviewed snapshot for confirmation, including recipient order/content.
    previewRequest.value = payload
    preview.value = result
  } catch (err) { error.value = err.message }
  finally { busy.value = false }
}
async function confirmSend() {
  if (!preview.value || !previewRequest.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await sendWeddingEmail({ ...previewRequest.value, batch_id: preview.value.batch_id, preview_token: preview.value.preview_token })
    currentBatchId.value = result.batch_id
    localStorage.setItem('weddingEmailBatch', result.batch_id)
    invalidatePreview()
    selected.value = []
    message.value = '已建立寄送批次，系統會在背景逐封寄送。'
    await poll()
    await refreshOverview()
  } catch (err) { error.value = err.message }
  finally { busy.value = false }
}
async function refreshOverview() { overview.value = await fetchEmailOverview() }
async function poll() {
  clearTimeout(pollTimer)
  if (!currentBatchId.value || disposed) return
  try {
    batch.value = await fetchEmailBatch(currentBatchId.value)
    if (!disposed && (counts.value.pending || counts.value.sending) && !batch.value.last_error) {
      pollTimer = setTimeout(poll, 2000)
    } else if (!disposed) {
      await refreshOverview()
    }
  } catch (err) { error.value = err.message }
}
async function resume(retryFailed = false) {
  busy.value = true
  error.value = ''
  try {
    await resumeEmailBatch(currentBatchId.value, retryFailed)
    await poll()
  } catch (err) { error.value = err.message }
  finally { busy.value = false }
}
async function changeBatch() { await poll() }
onMounted(load)
onBeforeUnmount(() => { disposed = true; clearTimeout(pollTimer); if (preview.value) document.body.style.overflow = previousOverflow })
</script>

<template>
  <AdminLayout title="Email 通知" eyebrow="Wedding Mail" subtitle="預覽每位賓客的婚禮通知，再安心寄出">
    <div class="email-page">
      <header class="email-heading">
        <div><p class="eyebrow">A LETTER BEFORE WE MEET</p><h1>一封信，準備好相聚</h1><p class="lead">婚宴資訊、交通提醒，還有每位賓客專屬的報到碼。</p></div>
        <span class="email-badge">Gmail SMTP</span>
      </header>
      <p v-if="loading" role="status">正在載入完整出席名單與寄送紀錄…</p>
      <p v-if="error" class="email-alert" role="alert">{{ error }}</p>
      <p v-if="message" class="email-notice" role="status">{{ message }}</p>
      <template v-if="overview && content">
        <section class="card email-connection">
          <strong>{{ overview.smtp_ready ? `寄件帳號：${overview.sender}` : '尚未設定 Gmail SMTP' }}</strong>
          <span>系統上限：滾動 24 小時 {{ overview.daily_limit }} 次寄送嘗試；Gmail 的其他寄信也會占用帳號額度。</span>
          <p v-if="!overview.smtp_ready">請在後端環境變數設定 SMTP_USERNAME 與 SMTP_PASSWORD（Google 應用程式密碼）。目前仍可預覽信件。</p>
          <p v-if="!overview.storage_ready" class="email-alert">寄送紀錄資料表尚未建立，請先套用後端的 20261026_wedding_email.sql。完成前可預覽，無法寄送。</p>
        </section>
        <div class="email-grid">
          <section class="card email-recipients">
            <div class="email-section-title"><div><p class="eyebrow">01 · RECIPIENTS</p><h2>選擇赴約的賓客</h2></div><strong>已選 {{ selected.length }} 位</strong></div>
            <p>僅列出確認出席者。每位賓客各收一封，報到碼不會混用。</p>
            <label for="email-search">搜尋姓名或 Email</label>
            <input id="email-search" v-model="search" type="search" placeholder="搜尋姓名或 Email">
            <div class="email-actions"><button class="btn btn-ghost" type="button" @click="selectVisible">全選搜尋結果</button><button class="btn btn-ghost" type="button" @click="selected = []">清除選取</button></div>
            <p class="email-small">完整名單 {{ guests.length }} 位 · 搜尋結果 {{ visibleGuests.length }} 位</p>
            <div class="email-guest-list">
              <label v-for="guest in visibleGuests" :key="guest.id" class="email-guest" :class="{ 'is-disabled': disabledReason(guest) }">
                <input v-model="selected" type="checkbox" :value="guest.id" :disabled="!!disabledReason(guest)" :aria-label="`選取 ${guest.name}`">
                <span><strong>{{ guest.name }}</strong><small>{{ guest.email || '尚未填寫 Email' }}</small><small v-if="disabledReason(guest)">{{ disabledReason(guest) }}</small></span>
              </label>
              <p v-if="!visibleGuests.length">沒有符合條件的出席賓客。</p>
            </div>
          </section>
          <section class="card email-editor">
            <p class="eyebrow">02 · YOUR LETTER</p><h2>婚禮通知模板</h2><p>已填好一版文稿，可直接調整；姓名與專屬報到碼會自動帶入。</p>
            <div v-for="[key, label, multiline] in fields" :key="key" class="email-field">
              <label :for="`mail-${key}`">{{ label }}</label>
              <textarea v-if="multiline" :id="`mail-${key}`" v-model="content[key]" :rows="key === 'message' ? 7 : 5" />
              <input v-else :id="`mail-${key}`" v-model="content[key]" :type="key.endsWith('_url') ? 'url' : 'text'">
            </div>
            <p class="email-small">已寄送、寄送中或待確認者不會再次加入。失敗信件可重試；若已修改賓客資料，請重新選取並預覽寄送。</p>
            <button class="btn btn-primary" type="button" :disabled="!selected.length || busy" @click="showPreview">{{ busy ? '處理中…' : `一鍵寄送 Email（${selected.length} 位）` }}</button>
            <p class="email-small">點擊後先預覽，確認後才會真正寄出。</p>
          </section>
        </div>
        <section v-if="batch" class="card email-results" aria-label="寄送進度">
          <p class="eyebrow">DELIVERY LOG</p><h2>寄送進度 {{ completed }} / {{ total }}</h2>
          <label for="email-batch">查看寄送批次</label>
          <select id="email-batch" v-model="currentBatchId" @change="changeBatch"><option v-if="!overview.batches.some(row => row.id === currentBatchId)" :value="currentBatchId">目前批次</option><option v-for="row in overview.batches" :key="row.id" :value="row.id">{{ new Date(row.created_at).toLocaleString('zh-TW') }}</option></select>
          <progress :value="completed" :max="total || 1" :aria-label="`已處理 ${completed} 封，共 ${total} 封`" />
          <div class="email-counts"><span v-for="(label, key) in labels" :key="key">{{ label }} {{ counts[key] }}</span></div>
          <p class="email-small">「Gmail 已接受」表示 SMTP 已接受寄送，實際收件仍可能延遲或退信。</p>
          <p v-if="batch.last_error" role="status" class="email-alert">{{ batch.last_error }}</p>
          <p v-if="!total">本次選取的賓客已有寄送紀錄，已略過，未重複寄送。</p>
          <div class="email-actions"><button v-if="counts.pending || counts.sending" class="btn btn-ghost" :disabled="busy || !canSend" @click="resume(false)">繼續寄送</button><button v-if="counts.failed" class="btn btn-ghost" :disabled="busy || !canSend" @click="resume(true)">只重試失敗信件（{{ counts.failed }}）</button><button class="btn btn-ghost" :disabled="busy" @click="poll">更新狀態</button></div>
          <p v-if="counts.unknown" class="email-alert">有 {{ counts.unknown }} 封無法確認是否已寄出，請至 Gmail 寄件備份確認；系統不會自動重寄。</p>
          <div class="email-log"><div v-for="row in batch.deliveries" :key="row.id" class="email-log-row"><span><strong>{{ row.name }}</strong><small>{{ row.email }}</small></span><span>{{ labels[row.status] }}<small v-if="row.error">{{ row.error }}</small></span></div></div>
        </section>
      </template>
    </div>
    <div v-if="preview" class="email-modal-backdrop" @click.self="!busy && invalidatePreview()" @keydown.esc="!busy && invalidatePreview()">
      <section ref="previewDialog" class="email-modal" role="dialog" aria-modal="true" aria-labelledby="email-preview-title" tabindex="-1" @keydown.tab="trapFocus">
        <header class="email-modal-header"><div><h2 id="email-preview-title">寄送前預覽</h2><p>{{ preview.subject }} · 共 {{ preview.total }} 位收件人</p></div><button class="btn btn-ghost" :disabled="busy" @click="invalidatePreview">關閉</button></header>
        <div class="email-preview-controls"><label for="preview-guest">切換預覽對象</label><select id="preview-guest" v-model="previewGuestId" :disabled="busy" @change="showPreview"><option v-for="guest in selectedGuests" :key="guest.id" :value="guest.id">{{ guest.name }} · {{ guest.email }}</option></select><p>收件人：{{ preview.recipient.name }} &lt;{{ preview.recipient.email }}&gt;</p></div>
        <iframe title="Email 寄送樣板預覽" :srcdoc="preview.html" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" />
        <footer class="email-modal-footer"><p>{{ canSend ? `每位賓客會收到自己的報到 QR Code，由 ${overview.sender} 寄出。` : '可先確認樣板，完成 SMTP 與資料表設定後即可寄送。' }}</p><button class="btn btn-primary" :disabled="busy || !canSend" @click="confirmSend">{{ busy ? '建立寄送批次中…' : `確認寄送給 ${preview.total} 位賓客` }}</button></footer>
      </section>
    </div>
  </AdminLayout>
</template>

<style scoped>
.email-page { display:grid; gap:24px; max-width:1400px; margin:auto }
.email-heading,.email-section-title,.email-modal-header { display:flex; align-items:center; justify-content:space-between; gap:16px }
.email-heading h1 { font-size:clamp(26px,3vw,38px); margin:6px 0 }
h2 { margin:4px 0 12px; font-size:23px }
.email-badge { background:#934e44; color:white; border-radius:24px; padding:9px 16px; white-space:nowrap }
.email-connection,.email-recipients,.email-editor,.email-results { padding:24px }
.email-connection { display:grid; gap:8px }
.email-connection span,.email-small { color:var(--muted); font-size:13px }
.email-grid { display:grid; grid-template-columns:minmax(260px,0.8fr) minmax(0,1.2fr); gap:24px; align-items:start }
.email-actions { display:flex; gap:8px; flex-wrap:wrap; margin:12px 0 }
.email-field { display:grid; gap:7px; margin-bottom:16px }
input:not([type=checkbox]),textarea,select { width:100%; max-width:100%; box-sizing:border-box; border:1px solid var(--border); border-radius:8px; padding:11px; background:#fffdf9; color:var(--fg); font:inherit }
textarea { resize:vertical; line-height:1.8 }
.email-guest-list { max-height:600px; overflow:auto }
.email-guest { display:flex; gap:12px; align-items:center; border-top:1px solid var(--border-soft); padding:14px 4px; cursor:pointer }
.email-guest input { width:19px; height:19px; flex-shrink:0; accent-color:#934e44 }
.email-guest span,.email-log-row span { min-width:0; overflow-wrap:anywhere }
.email-guest small,.email-log-row small { display:block; color:var(--muted); font-size:13px }
.is-disabled { opacity:0.58; cursor:default }
.email-alert,.email-notice { padding:12px 16px; border-radius:8px; background:#fff1e8; color:#864332; overflow-wrap:anywhere }
.email-notice { background:#e9f3ec; color:#326145 }
progress { display:block; width:100%; height:18px; accent-color:#934e44; margin:18px 0 }
.email-counts { display:flex; flex-wrap:wrap; gap:16px }
.email-log { max-height:400px; overflow:auto; margin-top:18px }
.email-log-row { display:grid; grid-template-columns:1fr 1fr; gap:16px; padding:14px 0; border-top:1px solid var(--border-soft) }
.email-modal-backdrop { position:fixed; inset:0; z-index:1500; background:#20151199; display:grid; place-items:center; padding:20px }
.email-modal { background:#fffaf7; border-radius:16px; width:min(100%,960px); max-height:94dvh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 24px 90px #0004 }
.email-modal-header,.email-preview-controls,.email-modal-footer { padding:16px 24px }
.email-modal-header { border-bottom:1px solid var(--border) }
.email-modal-header h2,.email-modal-header p,.email-preview-controls p { margin:4px 0; font-size:14px }
.email-modal-header h2 { font-size:23px }
.email-modal iframe { width:100%; min-height:200px; height:52dvh; flex:1 1 auto; border:0; background:#f7f0ea }
.email-preview-controls select { padding:7px; margin:5px 0 }
.email-modal-footer { border-top:1px solid var(--border); display:flex; gap:16px; justify-content:space-between; align-items:center }
.email-modal-footer p { font-size:13px; max-width:380px; margin:0 }
@media(max-width:800px) {
.email-grid { grid-template-columns:1fr }.email-heading { align-items:start }.email-badge { font-size:11px; padding:6px 10px }
.email-recipients,.email-editor,.email-results,.email-connection { padding:18px }.email-guest-list { max-height:320px }
.email-modal-backdrop { padding:6px }.email-modal { max-height:98dvh }.email-modal-header,.email-preview-controls,.email-modal-footer { padding:12px }
.email-modal-footer { flex-direction:column; align-items:stretch }.email-modal iframe { height:43dvh }.email-modal-header h2 { font-size:20px }
}
</style>
