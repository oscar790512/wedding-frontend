<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import QrCode from '../components/QrCode.vue'
import invitationScene from '../data/invitationScene.json'

const DESIGN_WIDTH = 375
const DESKTOP_SCENE_HEIGHT = 603
const AUTO_SCROLL_DURATION = 120_000
const AUTO_SCROLL_RESUME_DELAY = 3_000

const audio = ref(null)
const canvas = ref(null)
const isOpened = ref(false)
const isPlaying = ref(false)
const viewportWidth = ref(window.innerWidth)
const viewportHeight = ref(window.innerHeight)

let countdownTimer
let revealFrame
let autoScrollFrame
let autoScrollResumeTimer

const isMobile = computed(() => viewportWidth.value <= 768)
const canvasScale = computed(() => (isMobile.value ? viewportWidth.value / DESIGN_WIDTH : 1))
const sceneHeight = computed(() =>
  isMobile.value ? viewportHeight.value / canvasScale.value : DESKTOP_SCENE_HEIGHT,
)
const canvasStyle = computed(() => ({
  '--invitation-scale': canvasScale.value,
  '--scene-height': `${sceneHeight.value}px`,
  height: `${sceneHeight.value}px`,
}))
const shareUrl = computed(() => `${window.location.origin}/invitation`)

function updateViewport() {
  viewportWidth.value = window.innerWidth
  viewportHeight.value = window.innerHeight
}

function setCountdown() {
  if (!canvas.value) return

  const remaining = Math.max(0, new Date(invitationScene.targetDate).getTime() - Date.now())
  const days = Math.floor(remaining / 86_400_000)
  const hours = Math.floor((remaining / 3_600_000) % 24)
  const minutes = Math.floor((remaining / 60_000) % 60)
  const seconds = Math.floor((remaining / 1_000) % 60)
  const values = {
    '.c-day': String(days).padStart(3, '0').slice(-3),
    '.c-hour': String(hours).padStart(3, '0'),
    '.c-minute': String(minutes).padStart(3, '0'),
    '.c-second': String(seconds).padStart(3, '0'),
  }

  Object.entries(values).forEach(([selector, value]) => {
    const group = canvas.value.querySelector(selector)
    if (!group) return
    const currentDigits = group.querySelectorAll('.curr-num')
    const nextDigits = group.querySelectorAll('.next-num')
    currentDigits.forEach((node, index) => { node.textContent = value[index] ?? '0' })
    nextDigits.forEach((node, index) => { node.textContent = value[index] ?? '0' })
  })
}

function revealVisibleElements() {
  if (!canvas.value || !isOpened.value) return
  const stage = canvas.value.querySelector('.invitation-scene')
  if (!stage) return
  const viewport = canvas.value.getBoundingClientRect()
  stage.querySelectorAll('.eles').forEach((element) => {
    const rect = element.getBoundingClientRect()
    if (rect.bottom >= viewport.top - 40 && rect.top <= viewport.bottom + 40) {
      element.classList.add('is-visible')
    }
  })
}

function beginRevealLoop() {
  if (!isOpened.value) return
  revealVisibleElements()
  revealFrame = window.requestAnimationFrame(beginRevealLoop)
}

function stopAutoScroll() {
  window.cancelAnimationFrame(autoScrollFrame)
  autoScrollFrame = undefined
}

function startAutoScroll(resetPosition = false) {
  const scrollContainer = canvas.value?.querySelector('.page-wrap')
  if (!scrollContainer) return

  window.clearTimeout(autoScrollResumeTimer)
  autoScrollResumeTimer = undefined
  stopAutoScroll()
  if (resetPosition) scrollContainer.scrollTop = 0

  const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight
  const startingScrollTop = scrollContainer.scrollTop
  const remainingScroll = maxScroll - startingScrollTop
  if (remainingScroll <= 0) return

  const remainingDuration = AUTO_SCROLL_DURATION * (remainingScroll / maxScroll)
  const startedAt = window.performance.now()

  function advance(now) {
    const progress = Math.min((now - startedAt) / remainingDuration, 1)
    const currentMaxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight
    scrollContainer.scrollTop = startingScrollTop + (currentMaxScroll - startingScrollTop) * progress
    if (progress < 1) autoScrollFrame = window.requestAnimationFrame(advance)
  }

  autoScrollFrame = window.requestAnimationFrame(advance)
}

function pauseAutoScroll() {
  stopAutoScroll()
  window.clearTimeout(autoScrollResumeTimer)
  autoScrollResumeTimer = window.setTimeout(() => startAutoScroll(), AUTO_SCROLL_RESUME_DELAY)
}

function onPointerMove(event) {
  if (event.buttons) pauseAutoScroll()
}

async function openInvitation() {
  isOpened.value = true
  await nextTick()
  setCountdown()
  try {
    await audio.value?.play()
    isPlaying.value = true
  } catch {
    isPlaying.value = false
  }
  startAutoScroll(true)
  window.requestAnimationFrame(beginRevealLoop)
}

async function toggleMusic() {
  if (!audio.value) return
  if (audio.value.paused) {
    try {
      await audio.value.play()
      isPlaying.value = true
    } catch {
      isPlaying.value = false
    }
  } else {
    audio.value.pause()
    isPlaying.value = false
  }
}

onMounted(() => {
  window.addEventListener('resize', updateViewport)
  countdownTimer = window.setInterval(setCountdown, 1000)
  nextTick(setCountdown)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewport)
  window.clearInterval(countdownTimer)
  window.cancelAnimationFrame(revealFrame)
  stopAutoScroll()
  window.clearTimeout(autoScrollResumeTimer)
  audio.value?.pause()
})
</script>

<template>
  <main class="invitation-view" :class="{ 'is-mobile': isMobile, 'is-opened': isOpened }">
    <audio ref="audio" :src="invitationScene.music" loop preload="auto" />

    <section v-if="!isOpened" class="invitation-entry" aria-labelledby="invitation-title">
      <div class="invitation-entry__veil" />
      <div class="invitation-entry__content">
        <p class="invitation-entry__eyebrow">WEDDING INVITATION</p>
        <h1 id="invitation-title">祺元 <span>&amp;</span> 姵妤</h1>
        <p>2026.11.08</p>
        <button type="button" @click="openInvitation">
          <span>開啟喜帖</span>
          <small>點擊後播放音樂</small>
        </button>
      </div>
    </section>

    <template v-else>
      <header v-if="!isMobile" class="invitation-header">祺元 &amp; 姵妤</header>

      <section class="invitation-preview" aria-label="婚禮邀請函">
        <div class="invitation-phone">
          <div
            ref="canvas"
            class="invitation-canvas"
            :style="canvasStyle"
            @pointerdown.passive="pauseAutoScroll"
            @pointermove.passive="onPointerMove"
            @touchstart.passive="pauseAutoScroll"
            @touchmove.passive="pauseAutoScroll"
            @wheel.passive="pauseAutoScroll"
          >
            <div class="invitation-scene" v-html="invitationScene.pages[0]" />
          </div>
        </div>
      </section>

      <aside v-if="!isMobile" class="invitation-share">
        <strong>手機掃一掃分享給朋友</strong>
        <QrCode :value="shareUrl" label="婚禮邀請函 QR Code" :size="176" />
        <span>祺元 &amp; 姵妤的婚禮喜帖</span>
      </aside>

      <button
        class="invitation-music"
        :class="{ 'is-playing': isPlaying }"
        type="button"
        :aria-label="isPlaying ? '暫停音樂' : '播放音樂'"
        :aria-pressed="isPlaying"
        @click="toggleMusic"
      >
        <span aria-hidden="true">♫</span>
      </button>

    </template>
  </main>
</template>

<style>
@font-face {
  font-family: invitation-waiting;
  src: url('/invitation/assets/11a934478756ebc386740bc13b88aed9-1783150084366-font-2.ttf');
}

@font-face {
  font-family: invitation-hei;
  src: url('/invitation/assets/4aefbc8aa56036797d719e09fae7e3f2-1783150337447-font-1.ttf');
}

@font-face {
  font-family: invitation-song;
  src: url('/invitation/assets/96f2d4576bf3cd97859b14539d8c6143-1783150084366-font-1.ttf');
}

@font-face {
  font-family: invitation-song-thin;
  src: url('/invitation/assets/ac9bdb89da818d6f5de0d0ae61d0d181-1783150084366-font-1.ttf');
}

@font-face {
  font-family: invitation-great-vibes;
  src: url('/invitation/assets/46f4cbfebc5d0a0501443d126b34266a-1783150084366-font-2.ttf');
}

@font-face {
  font-family: invitation-cinzel;
  src: url('/invitation/assets/Cinzel-Regular.ttf');
}

@font-face {
  font-family: iconfont;
  src: url('/invitation/assets/iconfont.18a8397.woff2') format('woff2');
}

.invitation-view,
.invitation-view * {
  box-sizing: border-box;
}

.invitation-view {
  --paper: #f4f2ea;
  position: fixed;
  inset: 0;
  z-index: 1000;
  overflow: hidden;
  color: #444141;
  background: #f8f2f4 url('/invitation/assets/preview-bg.png') center bottom / cover no-repeat;
  font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif;
  overscroll-behavior: none;
  touch-action: pan-y;
}

.invitation-entry {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  background: url('/invitation/assets/2026-4-7-iBKn3xbQWC7WFzXHzERXPEwknzs8SZQ4.jpeg') center 22% / cover no-repeat;
}

.invitation-entry__veil {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(23, 18, 16, 0.2), rgba(23, 18, 16, 0.66));
  backdrop-filter: saturate(0.8);
}

.invitation-entry__content {
  position: relative;
  z-index: 1;
  width: min(88vw, 440px);
  padding: 44px 28px 36px;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.62);
  background: rgba(30, 22, 20, 0.16);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.2);
}

.invitation-entry__eyebrow {
  margin: 0 0 18px;
  font-family: invitation-cinzel, serif;
  font-size: 13px;
  letter-spacing: 0.26em;
}

.invitation-entry h1 {
  margin: 0;
  font-family: invitation-song, serif;
  font-size: clamp(36px, 9vw, 54px);
  font-weight: 400;
  letter-spacing: 0.12em;
}

.invitation-entry h1 span {
  color: #f1d7ca;
  font-family: invitation-great-vibes, cursive;
}

.invitation-entry__content > p:not(.invitation-entry__eyebrow) {
  margin: 12px 0 30px;
  font-family: invitation-cinzel, serif;
  letter-spacing: 0.18em;
}

.invitation-entry button {
  min-width: 190px;
  padding: 13px 24px 11px;
  color: #5f3030;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 252, 248, 0.94);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16);
  cursor: pointer;
}

.invitation-entry button span,
.invitation-entry button small {
  display: block;
}

.invitation-entry button span {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.18em;
}

.invitation-entry button small {
  margin-top: 3px;
  color: #8e6a66;
  font-size: 11px;
}

.invitation-header {
  position: absolute;
  top: 18px;
  left: 50%;
  z-index: 3;
  transform: translateX(-50%);
  color: #383031;
  font-family: invitation-song, serif;
  font-size: 21px;
  font-weight: 600;
  letter-spacing: 0.18em;
}

.invitation-preview {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 32px;
  transform: translate(-50%, -48%);
}

.invitation-phone {
  position: relative;
  width: 431px;
  height: 668px;
  padding: 33px 28px 32px;
  overflow: hidden;
  background: url('/invitation/assets/preview_mobile.png') center / 100% 100% no-repeat;
  filter: drop-shadow(0 18px 28px rgba(100, 91, 94, 0.12));
}

.invitation-canvas {
  --scene-height: 603px;
  position: relative;
  width: 375px;
  overflow: hidden;
  background: var(--paper);
  font-size: 37.5px;
}

.invitation-scene,
.invitation-scene > .page-item {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.invitation-view .page-wrap {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}

.invitation-view .page-wrap::-webkit-scrollbar { display: none; }

.invitation-view .scroll-wrap {
  position: relative;
  width: 100%;
  overflow: hidden;
}

.invitation-view .scroll-long {
  transform: none !important;
}

.invitation-view .bg-wrap,
.invitation-view .page-bg,
.invitation-view .ele-wrap {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.invitation-view .page-bg {
  z-index: 0;
  background-position: center;
  background-size: cover;
}

.invitation-view .ele-wrap {
  z-index: 1;
}

.invitation-view .eles {
  position: absolute;
}

.invitation-view .eles:not(.is-visible) .ani-wrap {
  opacity: 0;
  transform: translateY(14px);
}

.invitation-view .eles.is-visible .ani-wrap {
  animation: invitation-reveal 850ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.invitation-view .ani-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}

.invitation-view .ele-img .rotate-wrap,
.invitation-view .ele-shape .rotate-wrap {
  position: absolute;
  inset: 0;
}

.invitation-view .ele-img .img-wrap,
.invitation-view .ele-shape .e-shape {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.invitation-view .ele-img img {
  position: relative;
  z-index: 0;
  display: block;
  max-width: none;
  pointer-events: none;
}

.invitation-view .e-shape svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.invitation-view .text-common {
  word-break: break-word;
  overflow-wrap: break-word;
  text-size-adjust: none;
}

.invitation-view .eles[data-id='1777112228733'] .text-common,
.invitation-view .eles[data-id='1777730933330'] .text-common {
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang TC', 'Helvetica Neue', sans-serif !important;
  font-weight: 400;
  line-height: 1.2 !important;
  letter-spacing: 0.015em !important;
}

.invitation-view .waitingforthesunrise { font-family: invitation-waiting !important; }
.invitation-view .siyuanheitichanggui { font-family: invitation-hei !important; }
.invitation-view .siyuansongtichanggui { font-family: invitation-song !important; }
.invitation-view .siyuansongtijixi { font-family: invitation-song-thin !important; }
.invitation-view .greatvibes { font-family: invitation-great-vibes !important; }
.invitation-view .Cinzel-Regular { font-family: invitation-cinzel !important; }

.invitation-view .count-down {
  display: block;
}

.invitation-view .count-flip,
.invitation-view .c-wrap {
  display: flex;
  align-items: center;
}

.invitation-view .count-flip {
  justify-content: center;
  height: 100%;
  transform-origin: center;
}

.invitation-view .c-com,
.invitation-view .c-wrap {
  height: 100%;
}

.invitation-view .c-com {
  display: flex;
  align-items: center;
}

.invitation-view .c-num {
  width: 20.625px;
  height: 30px;
  overflow: hidden;
  font-size: 18px;
  line-height: 30px;
  text-align: center;
}

.invitation-view .c-num[style*='display: none'] {
  display: none !important;
}

.invitation-view .flex-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}

.invitation-view .next-num,
.invitation-view .curr-num {
  position: absolute;
  inset: 0;
}

.invitation-view .next-num { visibility: hidden; }

.invitation-view .c-text {
  margin: 0 4.5px 0 1.5px;
  font-size: 10.5px;
  white-space: nowrap;
}

.invitation-view .ele-calendar .ani-wrap {
  overflow: hidden;
}

.invitation-view .iconfont {
  font-family: iconfont !important;
  font-style: normal;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.invitation-view .icon-zan1::before { content: '\e66d'; }

.invitation-view .can-wrap .can-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 47px 20px;
  line-height: 1;
}

.invitation-view .can-wrap .can-top .can-left {
  padding-bottom: 4px;
  font-size: 25px;
}

.invitation-view .can-wrap .can-top .can-right { font-size: 25px; }
.invitation-view .can-wrap .can-top .can-right span { position: relative; top: 2px; font-size: 57px; }
.invitation-view .can-wrap .can-main { padding: 0 23px; }

.invitation-view .can-wrap .can-week {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  height: 25px;
  padding: 0 10px;
  border-radius: 13px;
  line-height: 25px;
}

.invitation-view .can-wrap .can-week span { width: 14.2%; font-size: 12px; text-align: center; }
.invitation-view .can-wrap .can-date ul { margin: 0; padding: 5px 10px 0; font-size: 0; list-style: none; text-align: left; }
.invitation-view .can-wrap .can-date li { position: relative; display: inline-block; width: 14.2%; height: 25px; margin-top: 8px; text-align: center; }
.invitation-view .can-wrap .can-date li span { position: absolute; top: 50%; left: 50%; z-index: 1; font-size: 13px; transform: translate(-50%, -52%); }
.invitation-view .can-wrap .can-date li .iconfont { display: none; font-size: 26px; }
.invitation-view .can-wrap .can-date li.active { z-index: 2; }
.invitation-view .can-wrap .can-date li.active .iconfont {
  position: relative;
  top: -6.2px;
  display: block;
}
.invitation-view .can-wrap .can-date li.active span { color: #fff !important; }
.invitation-view .can-wrap .can-date li.heart-ani .iconfont { animation: jumpheart 0.8s ease infinite alternate; }

.invitation-share {
  position: absolute;
  right: max(34px, calc(50% - 600px));
  bottom: 10vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 184px;
  padding: 14px 10px 12px;
  color: #4b4547;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 12px 36px rgba(94, 79, 84, 0.08);
}

.invitation-share strong { font-size: 13px; }
.invitation-share span { margin-top: 5px; color: #999093; font-size: 11px; }
.invitation-share .qr-code-box { margin: 4px 0 0; padding: 0; background: #fff; }
.invitation-share .qr-code-box img { display: block; width: 164px; height: 164px; }

.invitation-music {
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 20;
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  color: #7f0505;
  border: 1px solid rgba(127, 5, 5, 0.22);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 7px 22px rgba(77, 54, 57, 0.14);
  cursor: pointer;
}

.invitation-music span { font-family: serif; font-size: 21px; }
.invitation-music.is-playing { animation: invitation-spin 4s linear infinite; }

@keyframes invitation-reveal {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes jumpheart { to { transform: scale(1.2); } }

@keyframes invitation-spin { to { transform: rotate(360deg); } }

@media (max-width: 768px) {
  .invitation-view { background: var(--paper); }
  .invitation-preview { inset: 0; display: block; transform: none; }
  .invitation-phone { width: 100%; height: 100%; padding: 0; background: none; filter: none; }
  .invitation-canvas {
    width: 375px;
    transform: scale(var(--invitation-scale));
    transform-origin: top left;
  }
  .invitation-music { top: max(14px, env(safe-area-inset-top)); right: 14px; }
}
</style>
