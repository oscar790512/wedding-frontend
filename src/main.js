import { createApp } from 'vue'

import App from './App.vue'
import { useAuth } from './composables/useAuth'
import router from './router'
import './style.css'

const { clearSession } = useAuth()

window.addEventListener('wedding-auth-expired', () => {
  const currentRoute = router.currentRoute.value
  clearSession()

  if (currentRoute.name !== 'login') {
    router.replace({
      name: 'login',
      query: { redirect: currentRoute.fullPath },
    })
  }
})

createApp(App).use(router).mount('#app')
