import { createRouter, createWebHashHistory } from 'vue-router'
import { supabase } from '../supabase'
import LoginView from '../views/LoginView.vue'
import InputView from '../views/InputView.vue'
import TodayView from '../views/TodayView.vue'
import ItemsView from '../views/ItemsView.vue'
import TeamView from '../views/TeamView.vue'
import SuperAdminView from '../views/SuperAdminView.vue'
// ইমপোর্টের নিচে যোগ করুন
import DashboardView from '../views/DashboardView.vue'
import ReportView from '../views/ReportView.vue'
import CostControlView from '../views/CostControlView.vue'
import PurchasePlanView from '../views/PurchasePlanView.vue'
// routes অ্যারেতে যোগ করুন:


// routes অ্যারেতে যোগ করুন (today এর নিচে)


const routes = [
  { path: '/login', name: 'login', component: LoginView },
  { path: '/', name: 'input', component: InputView, meta: { requiresAuth: true } },
  { path: '/today', name: 'today', component: TodayView, meta: { requiresAuth: true } },
  { path: '/items', name: 'items', component: ItemsView, meta: { requiresAuth: true } },
  { path: '/team', name: 'team', component: TeamView, meta: { requiresAuth: true, roles: ['admin'] } },
  { path: '/superadmin', name: 'superadmin', component: SuperAdminView, meta: { requiresAuth: true, roles: ['superadmin'] } },
  { path: '/dashboard', name: 'dashboard', component: DashboardView, meta: { requiresAuth: true } },
  { path: '/report', name: 'report', component: ReportView, meta: { requiresAuth: true, roles: ['admin']  } },
  { path: '/cost-control', name: 'cost-control', component: CostControlView, meta: { requiresAuth: true } },
  { path: '/purchase-plan', name: 'purchase-plan', component: PurchasePlanView, meta: { requiresAuth: true } }

]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach(async (to, from, next) => {
  const { data: { session } } = await supabase.auth.getSession()
  
  if (to.meta.requiresAuth && !session) {
    return next('/login')
  }
  
  if (to.name === 'login' && session) {
    return next('/')
  }

  if (to.meta.roles && session) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
    if (!profile || !to.meta.roles.includes(profile.role)) {
      return next('/') // পারমিশন না থাকলে হোমে পাঠাবে
    }
  }

  next()
})

export default router