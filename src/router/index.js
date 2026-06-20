import { createRouter, createWebHistory } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import CheckinView from '../views/CheckinView.vue'
import DashboardView from '../views/DashboardView.vue'
import LoginView from '../views/LoginView.vue'
import RsvpView from '../views/RsvpView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/rsvp' },
    { path: '/rsvp', name: 'rsvp', component: RsvpView },
    { path: '/login', name: 'login', component: LoginView },
    {
      path: '/admin/dashboard',
      name: 'dashboard',
      component: DashboardView,
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/checkin',
      name: 'checkin',
      component: CheckinView,
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach((to) => {
  const { isAuthenticated } = useAuth()
  if (to.meta.requiresAuth && !isAuthenticated.value) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && isAuthenticated.value) {
    return { name: 'dashboard' }
  }
  return true
})

export default router
