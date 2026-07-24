import { createRouter, createWebHistory } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import CheckinScanEntryView from '../views/CheckinScanEntryView.vue'
import CheckinView from '../views/CheckinView.vue'
import DashboardView from '../views/DashboardView.vue'
import GuestsView from '../views/GuestsView.vue'
import InvitationView from '../views/InvitationView.vue'
import LoginView from '../views/LoginView.vue'
import RsvpView from '../views/RsvpView.vue'
import ShippingView from '../views/ShippingView.vue'
import SettingsView from '../views/SettingsView.vue'
import TablePlanView from '../views/TablePlanView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/rsvp' },
    { path: '/invitation', name: 'invitation', component: InvitationView },
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
      redirect: '/admin/operations',
    },
    {
      path: '/admin/guests',
      name: 'guests',
      component: GuestsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/shipping',
      name: 'shipping',
      component: ShippingView,
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/tables',
      name: 'tables',
      component: TablePlanView,
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/settings',
      name: 'settings',
      component: SettingsView,
      meta: { requiresAuth: true, requiresRole: 'admin' },
    },
    {
      path: '/admin/operations',
      name: 'checkin',
      component: CheckinView,
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/operations/scan/:token',
      name: 'checkin-scan',
      component: CheckinScanEntryView,
    },
  ],
})

router.beforeEach((to) => {
  const { isAuthenticated, role } = useAuth()
  if (to.meta.requiresAuth && !isAuthenticated.value) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresRole && role.value !== to.meta.requiresRole) {
    return { name: 'dashboard' }
  }
  if (to.name === 'login' && isAuthenticated.value) {
    return { name: 'dashboard' }
  }
  return true
})

export default router
