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
            @click="activeFilter = filter.key"
          >
            <i :class="[filter.icon, 'mr-1 sm:mr-2']" />
            {{ filter.name }}
          </button>
        </div>

        <!-- 刷新按钮 -->
        <button
          class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-all duration-200 hover:border-gray-300 hover:shadow-sm sm:px-4 sm:py-2 sm:text-sm"
          :disabled="loading"
          @click="loadLogs"
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
          @click="
            currentPage--
            loadLogs()
          "
        >
          上一页
        </button>
        <span class="text-sm text-gray-600"> 第 {{ currentPage }} 页，共 {{ totalPages }} 页 </span>
        <button
          class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="currentPage === totalPages"
          @click="
            currentPage++
            loadLogs()
          "
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

// 日志类型过滤器
const logFilters = ref([
  { key: 'all', name: '全部', icon: 'fas fa-list' },
  { key: 'rate_limit', name: '智能限流', icon: 'fas fa-shield-alt' },
  { key: 'template_switch', name: '模板切换', icon: 'fas fa-exchange-alt' },
  { key: 'account_status', name: '账户状态', icon: 'fas fa-user-circle' },
  { key: 'redemption', name: '兑换码', icon: 'fas fa-ticket-alt' },
  { key: 'system', name: '系统事件', icon: 'fas fa-cogs' }
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
    totalPages.value = response.data.totalPages
  } catch (error) {
    console.error('加载关键日志失败:', error)
    logs.value = []
  } finally {
    loading.value = false
  }
}

// 获取日志边框颜色
const getLogBorderColor = (type) => {
  const colors = {
    rate_limit: 'border-l-4 border-l-orange-400 border-r border-t border-b border-gray-200',
    template_switch: 'border-l-4 border-l-blue-400 border-r border-t border-b border-gray-200',
    account_status: 'border-l-4 border-l-green-400 border-r border-t border-b border-gray-200',
    redemption: 'border-l-4 border-l-purple-400 border-r border-t border-b border-gray-200',
    system: 'border-l-4 border-l-gray-400 border-r border-t border-b border-gray-200'
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
    system: 'fas fa-cogs'
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
    system: 'text-gray-500'
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
