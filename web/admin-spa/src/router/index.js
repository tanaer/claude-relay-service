import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { APP_CONFIG } from '@/config/app'

// 路由懒加载
const LoginView = () => import('@/views/LoginView.vue')
const MainLayout = () => import('@/components/layout/MainLayout.vue')
const DashboardView = () => import('@/views/DashboardView.vue')
const ApiKeysView = () => import('@/views/ApiKeysView.vue')
const AccountsView = () => import('@/views/AccountsView.vue')
const KeyLogsView = () => import('@/views/KeyLogsView.vue')
const SettingsView = () => import('@/views/SettingsView.vue')
const ApiStatsView = () => import('@/views/ApiStatsView.vue')
const RedeemView = () => import('@/views/RedeemView.vue')
const RedemptionCodesView = () => import('@/views/RedemptionCodesView.vue')
const RateTemplatesView = () => import('@/views/RateTemplates.vue')
const PolicyMonitoringView = () => import('@/views/PolicyMonitoringView.vue')
const SmartRateLimitView = () => import('@/views/SmartRateLimitView.vue')
const UpstreamErrorsView = () => import('@/views/UpstreamErrorsView.vue')

const routes = [
  {
    path: '/',
    redirect: () => {
      // 智能重定向：避免循环
      const currentPath = window.location.pathname
      const basePath = APP_CONFIG.basePath.replace(/\/$/, '') // 移除末尾斜杠

      // 如果当前路径已经是 basePath 或 basePath/，重定向到 api-stats
      const searchParams = new URLSearchParams(window.location.search)
      const query = Object.fromEntries(searchParams.entries())

      // 支持使用 t=tutorial 简写，映射为 tab=tutorial
      if (query.t && !query.tab) {
        query.tab = query.t
        delete query.t
      }

      if (currentPath === basePath || currentPath === basePath + '/') {
        return { path: '/api-stats', query }
      }

      // 否则保持默认重定向，同时保留查询参数
      return { path: '/api-stats', query }
    }
  },
  {
    path: '/redeem',
    name: 'Redeem',
    component: RedeemView,
    meta: { requiresAuth: false }
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { requiresAuth: false }
  },
  {
    path: '/api-stats',
    name: 'ApiStats',
    component: ApiStatsView,
    meta: { requiresAuth: false }
  },
  {
    path: '/dashboard',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: DashboardView
      }
    ]
  },
  {
    path: '/api-keys',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'ApiKeys',
        component: ApiKeysView
      }
    ]
  },
  {
    path: '/accounts',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Accounts',
        component: AccountsView
      }
    ]
  },
  {
    path: '/redemption-codes',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'RedemptionCodes',
        component: RedemptionCodesView
      }
    ]
  },
  {
    path: '/rate-templates',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'RateTemplates',
        component: RateTemplatesView
      }
    ]
  },
  {
    path: '/key-logs',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'KeyLogs',
        component: KeyLogsView
      }
    ]
  },
  {
    path: '/policy-monitoring',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'PolicyMonitoring',
        component: PolicyMonitoringView
      }
    ]
  },
  {
    path: '/smart-rate-limit',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'SmartRateLimit',
        component: SmartRateLimitView
      }
    ]
  },
  {
    path: '/upstream-errors',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'UpstreamErrors',
        component: UpstreamErrorsView
      }
    ]
  },
  {
    path: '/settings',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Settings',
        component: SettingsView
      }
    ]
  },
  // 捕获所有未匹配的路由
  {
    path: '/:pathMatch(.*)*',
    redirect: '/api-stats'
  }
]

const router = createRouter({
  history: createWebHistory(APP_CONFIG.basePath),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()

  console.log('路由导航:', {
    to: to.path,
    from: from.path,
    fullPath: to.fullPath,
    requiresAuth: to.meta.requiresAuth,
    isAuthenticated: authStore.isAuthenticated
  })

  // 防止重定向循环：如果已经在目标路径，直接放行
  if (to.path === from.path && to.fullPath === from.fullPath) {
    return next()
  }

  // API Stats 页面不需要认证，直接放行
  if (to.path === '/api-stats' || to.path.startsWith('/api-stats')) {
    next()
  } else if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else if (to.path === '/login' && authStore.isAuthenticated) {
    next('/dashboard')
  } else {
    next()
  }
})

export default router
