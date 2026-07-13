<script setup>
import { onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'

const props = defineProps({
  value: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    default: 'QR Code',
  },
  size: {
    type: Number,
    default: 220,
  },
})

const dataUrl = ref('')
const errorMessage = ref('')

async function renderQrCode() {
  dataUrl.value = ''
  errorMessage.value = ''

  if (!props.value) return

  try {
    dataUrl.value = await QRCode.toDataURL(props.value, {
      width: props.size,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#1f2933',
        light: '#ffffff',
      },
    })
  } catch {
    errorMessage.value = 'QR Code 產生失敗'
  }
}

watch(() => [props.value, props.size], renderQrCode)
onMounted(renderQrCode)
</script>

<template>
  <div class="qr-code-box">
    <img v-if="dataUrl" :src="dataUrl" :alt="label" />
    <p v-else-if="errorMessage" class="message message--error">{{ errorMessage }}</p>
    <p v-else class="message">QR Code 產生中...</p>
  </div>
</template>
