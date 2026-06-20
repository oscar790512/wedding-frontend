import { computed, ref } from 'vue'

const token = ref(localStorage.getItem('token'))
const username = ref(localStorage.getItem('username'))
const role = ref(localStorage.getItem('role'))

export function useAuth() {
  const isAuthenticated = computed(() => Boolean(token.value))

  function setSession(data) {
    token.value = data.access_token
    username.value = data.username
    role.value = data.role
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('username', data.username)
    localStorage.setItem('role', data.role)
  }

  function clearSession() {
    token.value = null
    username.value = null
    role.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    localStorage.removeItem('role')
  }

  return {
    token,
    username,
    role,
    isAuthenticated,
    setSession,
    clearSession,
  }
}
