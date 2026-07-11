<script setup>
import { computed, onMounted, ref } from 'vue'

import { fetchSummary } from '../api/client'
import AdminLayout from '../components/AdminLayout.vue'
import StatCard from '../components/StatCard.vue'

const summary = ref(null)
const errorMessage = ref('')
const isLoading = ref(true)

const milestoneCards = computed(() => {
  if (!summary.value) {
    return []
  }

  const pendingInvitations = Math.max(
    summary.value.invitation_count - summary.value.attending_households,
    0,
  )

  return [
    {
      tag: 'Milestone 1',
      title: '名單整理',
      body: `目前 ${summary.value.total_guests} 組資料已進系統，建議優先整理分類、內部備註與待確認地址。`,
      cta: '/admin/guests',
      action: '進入賓客管理',
    },
    {
      tag: 'Milestone 2',
      title: '婚禮當天工作模式',
      body: `已有 ${summary.value.arrived_count} 組到場紀錄與 ${summary.value.child_seats_count} 張兒童座椅需求，可直接作為現場工作台基底。`,
      cta: '/admin/operations',
      action: '開啟現場工作台',
    },
    {
      tag: 'Roadmap',
      title: '待補流程',
      body: `喜帖需求 ${summary.value.invitation_count} 組。現階段仍缺寄送追蹤、桌次與匯出流程，建議從後台資訊架構先補齊。`,
      cta: '/admin/guests',
      action: pendingInvitations > 0 ? '整理寄送資料' : '查看完整名單',
    },
  ]
})

const summaryGroups = computed(() => {
  if (!summary.value) {
    return []
  }

  return [
    {
      title: 'RSVP 狀態',
      items: [
        {
          label: '總 RSVP 組數',
          value: summary.value.total_guests,
          hint: '含已出席、不出席與未決定',
        },
        {
          label: '確認出席組數',
          value: summary.value.attending_households,
          hint: '已回覆 attend 的賓客組數',
        },
        {
          label: '預計出席人數',
          value: summary.value.total_attendees,
          hint: `大人 ${summary.value.total_adults} · 小孩 ${summary.value.total_children}`,
        },
      ],
    },
    {
      title: '出席需求',
      items: [
        {
          label: '飲食需求組數',
          value: summary.value.vegetarian_count,
          hint: '以 diet notes 是否有填寫計算',
        },
        {
          label: '喜帖需求',
          value: summary.value.invitation_count,
          hint: '後續接寄送追蹤',
        },
        {
          label: '兒童座椅',
          value: summary.value.child_seats_count,
          hint: '婚宴現場安排參考',
        },
      ],
    },
    {
      title: '現場與禮金',
      items: [
        {
          label: '已到場',
          value: summary.value.arrived_count,
          hint: '由現場工作台更新',
        },
        {
          label: '禮金總額',
          value: `$${Number(summary.value.total_gift_amount).toLocaleString()}`,
          hint: '現階段所有已輸入紀錄加總',
        },
        {
          label: '不出席：希望收到喜餅',
          value: summary.value.decline_request_cake_count,
          hint: `${summary.value.decline_blessing_only_count} 組只致上祝福`,
        },
      ],
    },
  ]
})

async function loadSummary() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    summary.value = await fetchSummary()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

onMounted(loadSummary)
</script>

<template>
  <AdminLayout
    title="統計大盤"
    eyebrow="Summary"
    subtitle="新人工作區"
  >
    <p v-if="isLoading" class="message">載入中...</p>
    <p v-else-if="errorMessage" class="message message--error">
      {{ errorMessage }}
    </p>

    <template v-else-if="summary">
      <header class="admin-top">
        <div>
          <p class="eyebrow">Summary</p>
          <h1>統計大盤</h1>
          <p class="lead">快速確認 RSVP、出席需求、寄送待辦與婚禮當天狀態。</p>
        </div>
        <div class="toolbar">
          <button class="btn btn-ghost" type="button" @click="loadSummary">
            重新整理
          </button>
          <RouterLink class="btn btn-primary" to="/admin/guests">
            整理名單
          </RouterLink>
        </div>
      </header>

      <section class="summary-groups">
        <section
          v-for="group in summaryGroups"
          :key="group.title"
          class="summary-group"
        >
          <div class="summary-group__head">
            <h2>{{ group.title }}</h2>
          </div>
          <div class="grid-3">
            <StatCard
              v-for="item in group.items"
              :key="item.label"
              :label="item.label"
              :value="item.value"
              :hint="item.hint"
            />
          </div>
        </section>
      </section>

      <section class="section dashboard-actions">
        <div class="grid-3">
          <article v-for="card in milestoneCards" :key="card.title" class="panel">
            <span class="badge badge-warn">{{ card.tag }}</span>
            <h2>{{ card.title }}</h2>
            <p class="muted">{{ card.body }}</p>
            <RouterLink class="btn btn-dark" :to="card.cta">
              {{ card.action }}
            </RouterLink>
          </article>
        </div>
      </section>
    </template>
  </AdminLayout>
</template>
