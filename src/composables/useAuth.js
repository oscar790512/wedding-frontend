import { computed, ref } from 'vue'

const token = ref(localStorage.getItem('token'))
const username = ref(localStorage.getItem('username'))
const displayName = ref(localStorage.getItem('displayName'))
const role = ref(localStorage.getItem('role'))

export function useAuth() {
  const isAuthenticated = computed(() => Boolean(token.value))

  function setSession(data) {
    token.value = data.access_token
    username.value = data.username
    displayName.value = data.display_name || data.username
    role.value = data.role
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('username', data.username)
    localStorage.setItem('displayName', displayName.value)
    localStorage.setItem('role', data.role)
  }

  function clearSession() {
    token.value = null
    username.value = null
    displayName.value = null
    role.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    localStorage.removeItem('displayName')
    localStorage.removeItem('role')
  }

  return {
    token,
    username,
    displayName,
    role,
    isAuthenticated,
    setSession,
    clearSession,
  }
}
