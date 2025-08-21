<template>
  <div class="card p-3 sm:p-6">
    <div class="mb-4 sm:mb-6">
      <h3 class="mb-3 flex items-center text-xl font-bold text-gray-900 sm:mb-4 sm:text-2xl">
        <i class="fas fa-exclamation-triangle mr-2 text-red-600 sm:mr-3" />
        上游API错误统计
      </h3>
      <p class="text-sm text-gray-600 sm:text-base">
        查看客户在上游账户中遇到的错误情况，包括错误次数、时间和详细内容。
      </p>
    </div>

    <!-- 筛选栏 -->
    <div class="mb-4 flex flex-col gap-3 rounded-lg bg-gray-50 p-4 sm:flex-row sm:items-center">
      <!-- 日期选择 -->
      <div class="flex items-center gap-2">
        <label class="text-sm font-medium text-gray-700">日期：</label>
        <select
          v-model="selectedDate"
          class="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          @change="loadErrorStats"
        >
          <option v-if="availableDates.length === 0" :value="selectedDate">
            {{ selectedDate }}
          </option>
          <option v-for="date in availableDates" :key="date" :value="date">
            {{ date }}
          </option>
        </select>
      </div>

      <!-- 账户筛选 -->
      <div class="flex items-center gap-2">
        <label class="text-sm font-medium text-gray-700">账户：</label>
        <select
          v-model="selectedAccount"
          class="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          @change="loadErrorStats"
        >
          <option value="all">所有账户</option>
          <option
            v-for="account in availableAccounts"
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
          v-model="sortBy"
          class="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          @change="loadErrorStats"
        >
          <option value="count">按次数</option>
          <option value="lastTime">按最近时间</option>
        </select>
        <button
          class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
          @click="toggleSortOrder"
        >
          <i :class="['fas', sortOrder === 'desc' ? 'fa-sort-amount-down' : 'fa-sort-amount-up']" />
        </button>
      </div>

      <!-- 刷新按钮 -->
      <button
        class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-all duration-200 hover:border-gray-300 hover:shadow-sm sm:px-4 sm:py-2 sm:text-sm"
        :disabled="loading"
        @click="loadErrorStats"
      >
        <i :class="['fas', loading ? 'fa-spinner fa-spin' : 'fa-sync-alt']" />
        刷新
      </button>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="py-12 text-center">
      <div class="loading-spinner mx-auto mb-4" />
      <p class="text-gray-500">正在加载错误统计...</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="errorStats.length === 0" class="py-12 text-center">
      <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
        <i class="fas fa-check text-xl text-gray-400" />
      </div>
      <p class="text-lg text-gray-500">暂无上游错误</p>
      <p class="mt-2 text-sm text-gray-400">{{ selectedDate }} 没有记录到上游API错误</p>
    </div>

    <!-- 错误统计表格 -->
    <div v-else class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-gray-200 bg-gray-50">
            <th
              class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700"
            >
              上游账户
            </th>
            <th
              class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700"
            >
              错误内容
            </th>
            <th
              class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700"
            >
              时间范围
            </th>
            <th
              class="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-700"
            >
              错误次数
            </th>
            <th
              class="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-700"
            >
              操作
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 bg-white">
          <tr v-for="(stat, index) in errorStats" :key="index" class="hover:bg-gray-50">
            <!-- 上游账户 -->
            <td class="px-4 py-3">
              <div class="text-sm font-medium text-gray-900">{{ stat.accountName }}</div>
              <div class="text-xs text-gray-500">{{ stat.accountType }} · {{ stat.accountId }}</div>
            </td>

            <!-- 错误内容 -->
            <td class="px-4 py-3">
              <div class="text-sm text-gray-900">
                <span
                  class="mr-2 inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800"
                >
                  {{ stat.statusCode }}
                </span>
                <span class="text-gray-700">{{ getErrorSummary(stat.errorContent) }}</span>
              </div>
              <div v-if="stat.parsedError" class="mt-1 text-xs text-gray-500">
                {{ getErrorType(stat.parsedError) }}
              </div>
            </td>

            <!-- 时间范围 -->
            <td class="px-4 py-3">
              <div class="text-sm text-gray-600">
                <div>首次：{{ formatTime(stat.firstTime) }}</div>
                <div>最近：{{ formatTime(stat.lastTime) }}</div>
              </div>
            </td>

            <!-- 错误次数 -->
            <td class="px-4 py-3 text-center">
              <span
                class="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800"
              >
                {{ stat.count }}
              </span>
            </td>

            <!-- 操作 -->
            <td class="px-4 py-3 text-center">
              <button
                class="text-sm font-medium text-blue-600 hover:text-blue-800"
                @click="showErrorDetail(stat)"
              >
                查看详情
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 错误详情对话框 -->
    <div
      v-if="selectedError"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      @click="closeErrorDetail"
    >
      <div
        class="mx-4 max-h-[80vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6"
        @click.stop
      >
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">错误详情</h3>
          <button class="text-gray-400 hover:text-gray-600" @click="closeErrorDetail">
            <i class="fas fa-times" />
          </button>
        </div>

        <div class="space-y-4">
          <!-- 基本信息 -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm font-medium text-gray-700">上游账户</label>
              <p class="text-sm text-gray-900">
                {{ selectedError.accountName }} ({{ selectedError.accountType }})
              </p>
            </div>
            <div>
              <label class="text-sm font-medium text-gray-700">HTTP状态码</label>
              <p class="text-sm text-gray-900">{{ selectedError.statusCode }}</p>
            </div>
            <div>
              <label class="text-sm font-medium text-gray-700">发生次数</label>
              <p class="text-sm text-gray-900">{{ selectedError.count }} 次</p>
            </div>
            <div>
              <label class="text-sm font-medium text-gray-700">时间范围</label>
              <p class="text-sm text-gray-900">
                {{ formatTime(selectedError.firstTime) }} ~ {{ formatTime(selectedError.lastTime) }}
              </p>
            </div>
          </div>

          <!-- 原始响应内容 -->
          <div>
            <label class="mb-2 block text-sm font-medium text-gray-700">完整错误响应</label>
            <pre class="max-h-60 overflow-auto rounded bg-gray-100 p-3 text-xs text-gray-800">{{
              selectedError.rawResponse || selectedError.errorContent
            }}</pre>
          </div>

          <!-- 解析后的错误信息 -->
          <div v-if="selectedError.parsedError">
            <label class="mb-2 block text-sm font-medium text-gray-700">解析后错误信息</label>
            <pre class="max-h-40 overflow-auto rounded bg-blue-50 p-3 text-xs text-gray-800">{{
              JSON.stringify(selectedError.parsedError, null, 2)
            }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiClient } from '@/config/api'

// 数据状态
const loading = ref(false)
const errorStats = ref([])
const availableDates = ref([])
const availableAccounts = ref([])
const selectedDate = ref(new Date().toISOString().split('T')[0])
const selectedAccount = ref('all')
const sortBy = ref('count')
const sortOrder = ref('desc')
const selectedError = ref(null)

// 加载错误统计数据
const loadErrorStats = async () => {
  loading.value = true
  try {
    // 加载统计数据
    const params = {
      date: selectedDate.value,
      accountId: selectedAccount.value === 'all' ? undefined : selectedAccount.value,
      sortBy: sortBy.value,
      order: sortOrder.value
    }
    const response = await apiClient.get('/admin/key-logs/upstream-errors', { params })
    errorStats.value = response.data || []

    // 如果还没有加载过日期列表，加载它
    if (availableDates.value.length === 0) {
      const datesResponse = await apiClient.get('/admin/key-logs/upstream-errors/dates')
      availableDates.value = datesResponse.data || []

      // 如果有可用日期，设置第一个为选中
      if (availableDates.value.length > 0 && !availableDates.value.includes(selectedDate.value)) {
        selectedDate.value = availableDates.value[0]
      }
    }

    // 加载账户列表
    const accountsResponse = await apiClient.get('/admin/key-logs/upstream-errors/accounts', {
      params: { date: selectedDate.value }
    })
    availableAccounts.value = accountsResponse.data || []
  } catch (error) {
    console.error('加载上游错误统计失败:', error)
    errorStats.value = []
  } finally {
    loading.value = false
  }
}

// 切换排序方向
const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
  loadErrorStats()
}

// 获取错误摘要
const getErrorSummary = (errorContent) => {
  if (!errorContent) return '未知错误'

  // 如果是JSON格式，尝试提取error message
  try {
    const parsed = JSON.parse(errorContent)
    if (parsed.error && parsed.error.message) {
      return parsed.error.message
    }
    if (parsed.message) {
      return parsed.message
    }
    if (parsed.detail) {
      return parsed.detail
    }
  } catch (e) {
    // 非JSON格式，直接显示前100个字符
  }

  return errorContent.length > 100 ? errorContent.substring(0, 100) + '...' : errorContent
}

// 获取错误类型
const getErrorType = (parsedError) => {
  if (!parsedError) return ''

  if (parsedError.error && parsedError.error.type) {
    return parsedError.error.type
  }
  if (parsedError.type) {
    return parsedError.type
  }
  return ''
}

// 显示错误详情
const showErrorDetail = (errorStat) => {
  selectedError.value = errorStat
}

// 关闭错误详情
const closeErrorDetail = () => {
  selectedError.value = null
}

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return ''
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
  loadErrorStats()
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
