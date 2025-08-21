<template>
  <div class="card p-3 sm:p-6">
    <div class="mb-4 sm:mb-6">
      <h3 class="mb-3 flex items-center text-xl font-bold text-gray-900 sm:mb-4 sm:text-2xl">
        <i class="fas fa-clipboard-list mr-2 text-blue-600 sm:mr-3" />
        关键日志
      </h3>
      <p class="text-sm text-gray-600 sm:text-base">
        查看系统重要事件和状态变更日志，包括智能限流、模板切换、账户状态变更等。
      </p>
    </div>

    <!-- 过滤器 -->
    <div class="mb-4 sm:mb-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <!-- 日志类型过滤 -->
        <div class="flex flex-wrap gap-2">
          <button
            v-for="filter in logFilters"
            :key="filter.key"
            :class="[
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200 sm:px-4 sm:py-2 sm:text-sm',
              activeFilter === filter.key
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            ]"
            @click="handleFilterChange(filter.key)"
          >
            <i :class="[filter.icon, 'mr-1 sm:mr-2']" />
            {{ filter.name }}
          </button>
        </div>

        <!-- 刷新按钮 -->
        <button
          class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-all duration-200 hover:border-gray-300 hover:shadow-sm sm:px-4 sm:py-2 sm:text-sm"
          :disabled="loading"
          @click="activeFilter === 'upstream_error' ? loadUpstreamErrorStats() : loadLogs()"
        >
          <i :class="['fas', loading ? 'fa-spinner fa-spin' : 'fa-sync-alt']" />
          刷新
        </button>
      </div>
    </div>

    <!-- 日志列表 -->
    <div v-if="loading" class="py-12 text-center">
      <div class="loading-spinner mx-auto mb-4" />
      <p class="text-gray-500">正在加载日志...</p>
    </div>

    <!-- 上游报错统计视图 -->
    <div v-else-if="activeFilter === 'upstream_error'">
      <!-- 筛选栏 -->
      <div class="mb-4 flex flex-col gap-3 rounded-lg bg-gray-50 p-4 sm:flex-row sm:items-center">
        <!-- 日期选择 -->
        <div class="flex items-center gap-2">
          <label class="text-sm font-medium text-gray-700">日期：</label>
          <select
            v-model="selectedErrorDate"
            class="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            @change="loadUpstreamErrorStats"
          >
            <option v-if="upstreamErrorDates.length === 0" :value="selectedErrorDate">
              {{ selectedErrorDate }}
            </option>
            <option v-for="date in upstreamErrorDates" :key="date" :value="date">
              {{ date }}
            </option>
          </select>
        </div>

        <!-- 账户筛选 -->
        <div class="flex items-center gap-2">
          <label class="text-sm font-medium text-gray-700">账户：</label>
          <select
            v-model="selectedErrorAccount"
            class="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            @change="loadUpstreamErrorStats"
          >
            <option value="all">所有账户</option>
            <option
              v-for="account in upstreamErrorAccounts"
              :key="account.accountId"
              :value="account.accountId"
            >
              {{ account.accountName }} ({{ account.accountType }})
            </option>
          </select>
        </div>

        <!-- 排序选项 -->
        <div class="flex items-center gap-2">
          <label class="text-sm font-medium text-gray-700">排序：</label>
          <select
            v-model="errorStatsSortBy"
            class="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            @change="loadUpstreamErrorStats"
          >
            <option value="count">按次数</option>
            <option value="lastTime">按时间</option>
          </select>
          <button
            class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            @click="toggleErrorSortOrder"
          >
            <i
              :class="[
                'fas',
                errorStatsOrder === 'desc' ? 'fa-sort-amount-down' : 'fa-sort-amount-up'
              ]"
            />
          </button>
        </div>
      </div>

      <!-- 统计表格 -->
      <div v-if="upstreamErrorStats.length === 0" class="py-12 text-center">
        <div
          class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100"
        >
          <i class="fas fa-check text-xl text-gray-400" />
        </div>
        <p class="text-lg text-gray-500">暂无上游报错</p>
        <p class="mt-2 text-sm text-gray-400">{{ selectedErrorDate }} 没有记录到上游API报错</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-200 bg-gray-50">
              <th
                class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700"
              >
                报错账户
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700"
              >
                错误内容
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700"
              >
                最近时间
              </th>
              <th
                class="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-700"
              >
                次数
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 bg-white">
            <tr v-for="(stat, index) in upstreamErrorStats" :key="index" class="hover:bg-gray-50">
              <td class="px-4 py-3">
                <div class="text-sm font-medium text-gray-900">{{ stat.accountName }}</div>
                <div class="text-xs text-gray-500">{{ stat.accountType }}</div>
              </td>
              <td class="px-4 py-3">
                <div class="text-sm text-gray-900">
                  <span class="font-medium text-red-600">{{ stat.statusCode }}</span>
                  {{ stat.errorMessage || '无错误消息' }}
                </div>
              </td>
              <td class="px-4 py-3">
                <div class="text-sm text-gray-600">
                  {{ formatRecentTime(stat.lastTime) }}
                </div>
              </td>
              <td class="px-4 py-3 text-center">
                <span
                  class="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800"
                >
                  {{ stat.count }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else-if="filteredLogs.length === 0" class="py-12 text-center">
      <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
        <i class="fas fa-search text-xl text-gray-400" />
      </div>
      <p class="text-lg text-gray-500">暂无日志记录</p>
      <p class="mt-2 text-sm text-gray-400">
        {{ activeFilter === 'all' ? '系统还没有产生任何关键日志' : '当前筛选条件下暂无日志' }}
      </p>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="log in filteredLogs"
        :key="log.id"
        :class="[
          'rounded-lg border p-4 transition-all duration-200 hover:shadow-sm',
          getLogBorderColor(log.type),
          'bg-white'
        ]"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <!-- 日志标题和图标 -->
            <div class="mb-2 flex items-center gap-2">
              <i :class="[getLogIcon(log.type), getLogIconColor(log.type)]" />
              <span class="text-sm font-medium text-gray-900 sm:text-base">
                {{ log.title }}
              </span>
              <span
                :class="[
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  getLogLevelColor(log.level)
                ]"
              >
                {{ getLogLevelText(log.level) }}
              </span>
            </div>

            <!-- 日志内容 -->
            <p class="mb-2 text-sm text-gray-600 sm:text-base">
              {{ log.message }}
            </p>

            <!-- 详细信息 -->
            <div v-if="log.details" class="mb-2 text-xs text-gray-500 sm:text-sm">
              <span v-for="(value, key) in log.details" :key="key" class="mr-4">
                <strong>{{ key }}:</strong> {{ value }}
              </span>
            </div>

            <!-- 时间戳 -->
            <div class="text-xs text-gray-400 sm:text-sm">
              <i class="fas fa-clock mr-1" />
              {{ formatTime(log.timestamp) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="mt-6 flex justify-center">
      <div class="flex items-center gap-2">
        <button
          class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="currentPage === 1"
          @click="goPrevPage"
        >
          上一页
        </button>
        <span class="text-sm text-gray-600"> 第 {{ currentPage }} 页，共 {{ totalPages }} 页 </span>
        <button
          class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="currentPage === totalPages"
          @click="goNextPage"
        >
          下一页
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiClient } from '@/config/api'

// 数据状态
const logs = ref([])
const loading = ref(false)
const activeFilter = ref('all')
const currentPage = ref(1)
const totalPages = ref(1)
const pageSize = 20

// 上游报错统计相关状态
const upstreamErrorStats = ref([])
const upstreamErrorDates = ref([])
const upstreamErrorAccounts = ref([])
const selectedErrorDate = ref(new Date().toISOString().split('T')[0])
const selectedErrorAccount = ref('all')
const errorStatsSortBy = ref('count')
const errorStatsOrder = ref('desc')

// 日志类型过滤器
const logFilters = ref([
  { key: 'all', name: '全部', icon: 'fas fa-list' },
  { key: 'rate_limit', name: '智能限流', icon: 'fas fa-shield-alt' },
  { key: 'template_switch', name: '模板切换', icon: 'fas fa-exchange-alt' },
  { key: 'account_status', name: '账户状态', icon: 'fas fa-user-circle' },
  { key: 'redemption', name: '兑换码', icon: 'fas fa-ticket-alt' },
  { key: 'system', name: '系统事件', icon: 'fas fa-cogs' },
  { key: 'upstream_error', name: '上游报错', icon: 'fas fa-exclamation-triangle' }
])

// 计算属性
const filteredLogs = computed(() => {
  if (activeFilter.value === 'all') {
    return logs.value
  }
  return logs.value.filter((log) => log.type === activeFilter.value)
})

// 加载日志数据
const loadLogs = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize,
      type: activeFilter.value === 'all' ? undefined : activeFilter.value
    }

    const response = await apiClient.get('/admin/key-logs', { params })
    logs.value = response.data.logs
    totalPages.value = response.data.pagination
      ? response.data.pagination.totalPages
      : response.data.totalPages
  } catch (error) {
    console.error('加载关键日志失败:', error)
    logs.value = []
  } finally {
    loading.value = false
  }
}

// 分页方法，避免模板内多语句触发 Prettier 报错
const goPrevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--
    loadLogs()
  }
}

const goNextPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    loadLogs()
  }
}

// 获取日志边框颜色
const getLogBorderColor = (type) => {
  const colors = {
    rate_limit: 'border-l-4 border-l-orange-400 border-r border-t border-b border-gray-200',
    template_switch: 'border-l-4 border-l-blue-400 border-r border-t border-b border-gray-200',
    account_status: 'border-l-4 border-l-green-400 border-r border-t border-b border-gray-200',
    redemption: 'border-l-4 border-l-purple-400 border-r border-t border-b border-gray-200',
    system: 'border-l-4 border-l-gray-400 border-r border-t border-b border-gray-200',
    upstream_error: 'border-l-4 border-l-red-400 border-r border-t border-b border-gray-200'
  }
  return colors[type] || 'border border-gray-200'
}

// 获取日志图标
const getLogIcon = (type) => {
  const icons = {
    rate_limit: 'fas fa-shield-alt',
    template_switch: 'fas fa-exchange-alt',
    account_status: 'fas fa-user-circle',
    redemption: 'fas fa-ticket-alt',
    system: 'fas fa-cogs',
    upstream_error: 'fas fa-exclamation-triangle'
  }
  return icons[type] || 'fas fa-info-circle'
}

// 获取日志图标颜色
const getLogIconColor = (type) => {
  const colors = {
    rate_limit: 'text-orange-500',
    template_switch: 'text-blue-500',
    account_status: 'text-green-500',
    redemption: 'text-purple-500',
    system: 'text-gray-500',
    upstream_error: 'text-red-500'
  }
  return colors[type] || 'text-gray-500'
}

// 获取日志级别颜色
const getLogLevelColor = (level) => {
  const colors = {
    error: 'bg-red-100 text-red-800',
    warn: 'bg-yellow-100 text-yellow-800',
    info: 'bg-blue-100 text-blue-800',
    success: 'bg-green-100 text-green-800'
  }
  return colors[level] || 'bg-gray-100 text-gray-800'
}

// 获取日志级别文本
const getLogLevelText = (level) => {
  const texts = {
    error: '错误',
    warn: '警告',
    info: '信息',
    success: '成功'
  }
  return texts[level] || '未知'
}

// 格式化时间
const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 加载上游错误统计
const loadUpstreamErrorStats = async () => {
  loading.value = true
  try {
    // 加载统计数据
    const params = {
      date: selectedErrorDate.value,
      accountId: selectedErrorAccount.value === 'all' ? undefined : selectedErrorAccount.value,
      sortBy: errorStatsSortBy.value,
      order: errorStatsOrder.value
    }
    const response = await apiClient.get('/admin/key-logs/upstream-errors', { params })
    upstreamErrorStats.value = response.data || []

    // 如果还没有加载过日期列表，加载它
    if (upstreamErrorDates.value.length === 0) {
      const datesResponse = await apiClient.get('/admin/key-logs/upstream-errors/dates')
      upstreamErrorDates.value = datesResponse.data || []

      // 如果有可用日期，设置第一个为选中
      if (
        upstreamErrorDates.value.length > 0 &&
        !upstreamErrorDates.value.includes(selectedErrorDate.value)
      ) {
        selectedErrorDate.value = upstreamErrorDates.value[0]
      }
    }

    // 加载账户列表
    const accountsResponse = await apiClient.get('/admin/key-logs/upstream-errors/accounts', {
      params: { date: selectedErrorDate.value }
    })
    upstreamErrorAccounts.value = accountsResponse.data || []
  } catch (error) {
    console.error('加载上游错误统计失败:', error)
    upstreamErrorStats.value = []
  } finally {
    loading.value = false
  }
}

// 切换错误排序方向
const toggleErrorSortOrder = () => {
  errorStatsOrder.value = errorStatsOrder.value === 'desc' ? 'asc' : 'desc'
  loadUpstreamErrorStats()
}

// 监听过滤器变化
const handleFilterChange = (filter) => {
  activeFilter.value = filter
  currentPage.value = 1 // 重置页码

  if (filter === 'upstream_error') {
    loadUpstreamErrorStats()
  } else {
    loadLogs()
  }
}

// 格式化最近时间
const formatRecentTime = (timestamp) => {
  const now = new Date()
  const time = new Date(timestamp)
  const diff = now - time

  if (diff < 60000) {
    return '刚刚'
  } else if (diff < 3600000) {
    return `${Math.floor(diff / 60000)} 分钟前`
  } else if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)} 小时前`
  } else {
    return formatTime(timestamp)
  }
}

// 组件挂载时加载数据
onMounted(() => {
  loadLogs()
})
</script>

<style scoped>
.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f4f6;
  border-top: 4px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
