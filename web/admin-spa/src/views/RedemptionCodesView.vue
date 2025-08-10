<template>
  <div class="tab-content">
    <div class="card p-4 sm:p-6">
      <div class="mb-4 flex flex-col gap-4 sm:mb-6">
        <div>
          <h3 class="mb-1 text-lg font-bold text-gray-900 sm:mb-2 sm:text-xl">兑换码管理</h3>
          <p class="text-sm text-gray-600 sm:text-base">管理和生成兑换码</p>
        </div>

        <!-- 统计信息 -->
        <div v-if="stats" class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div class="rounded-lg bg-blue-50 p-3">
            <div class="text-sm text-blue-600">总计</div>
            <div class="text-xl font-bold text-blue-900">{{ stats.total }}</div>
          </div>
          <div class="rounded-lg bg-green-50 p-3">
            <div class="text-sm text-green-600">可用</div>
            <div class="text-xl font-bold text-green-900">{{ stats.unused }}</div>
          </div>
          <div class="rounded-lg bg-orange-50 p-3">
            <div class="text-sm text-orange-600">日卡</div>
            <div class="text-xl font-bold text-orange-900">
              {{ stats.daily.unused }}/{{ stats.daily.total }}
            </div>
          </div>
          <div class="rounded-lg bg-purple-50 p-3">
            <div class="text-sm text-purple-600">月卡</div>
            <div class="text-xl font-bold text-purple-900">
              {{ stats.monthly.unused }}/{{ stats.monthly.total }}
            </div>
          </div>
        </div>

        <!-- 操作按钮和筛选器 -->
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <!-- 筛选器 -->
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <!-- 状态筛选 -->
            <CustomDropdown
              v-model="filters.status"
              :options="statusOptions"
              placeholder="所有状态"
              @change="loadCodes()"
            />

            <!-- 类型筛选 -->
            <CustomDropdown
              v-model="filters.type"
              :options="typeOptions"
              placeholder="所有类型"
              @change="loadCodes()"
            />

            <!-- 搜索框 -->
            <div class="flex gap-2">
              <input
                v-model="filters.code"
                type="text"
                placeholder="搜索兑换码..."
                class="w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                @input="debounceSearch"
              />
              <input
                v-model="filters.apiKey"
                type="text"
                placeholder="搜索API Key..."
                class="w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                @input="debounceSearch"
              />
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="flex flex-wrap gap-2">
            <!-- 生成按钮 -->
            <button
              :disabled="isGenerating"
              class="btn btn-primary flex items-center gap-2"
              @click="generateCodes('daily')"
            >
              <i class="fas fa-plus"></i>
              生成日卡 (20个)
            </button>
            <button
              :disabled="isGenerating"
              class="btn btn-secondary flex items-center gap-2"
              @click="generateCodes('monthly')"
            >
              <i class="fas fa-plus"></i>
              生成月卡 (20个)
            </button>

            <!-- 提取按钮 -->
            <button class="btn btn-success flex items-center gap-2" @click="extractCodes('daily')">
              <i class="fas fa-download"></i>
              提取日卡 (20个)
            </button>
            <button
              class="btn btn-success flex items-center gap-2"
              @click="extractCodes('monthly')"
            >
              <i class="fas fa-download"></i>
              提取月卡 (20个)
            </button>

            <!-- 刷新按钮 -->
            <button class="btn btn-outline flex items-center gap-2" @click="refreshData()">
              <i class="fas fa-sync-alt" :class="{ 'fa-spin': isLoading }"></i>
              刷新
            </button>
          </div>
        </div>
      </div>

      <!-- 兑换码列表 -->
      <div class="overflow-hidden rounded-lg border border-gray-200">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  兑换码
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  类型
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  状态
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  生成时间
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  兑换时间
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  兑换的API Key
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white">
              <tr v-if="isLoading">
                <td class="px-6 py-4 text-center" colspan="6">
                  <i class="fas fa-spinner fa-spin mr-2"></i>
                  加载中...
                </td>
              </tr>
              <tr v-else-if="codes.length === 0">
                <td class="px-6 py-4 text-center text-gray-500" colspan="6">暂无兑换码数据</td>
              </tr>
              <tr v-for="code in codes" v-else :key="code.id" class="hover:bg-gray-50">
                <td class="whitespace-nowrap px-6 py-4">
                  <div class="flex items-center gap-2">
                    <code class="font-mono text-sm">{{ code.code }}</code>
                    <button
                      class="text-gray-400 hover:text-blue-500"
                      title="复制兑换码"
                      @click="copyToClipboard(code.code)"
                    >
                      <i class="fas fa-copy"></i>
                    </button>
                  </div>
                </td>
                <td class="whitespace-nowrap px-6 py-4">
                  <span
                    class="inline-flex rounded-full px-2 py-1 text-xs font-medium"
                    :class="
                      code.type === 'daily'
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-purple-100 text-purple-800'
                    "
                  >
                    {{ code.type === 'daily' ? '日卡' : '月卡' }}
                  </span>
                </td>
                <td class="whitespace-nowrap px-6 py-4">
                  <span
                    class="inline-flex rounded-full px-2 py-1 text-xs font-medium"
                    :class="
                      code.status === 'unused'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    "
                  >
                    {{ code.status === 'unused' ? '未使用' : '已使用' }}
                  </span>
                </td>
                <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {{ formatDateTime(code.createdAt) }}
                </td>
                <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {{ code.usedAt ? formatDateTime(code.usedAt) : '-' }}
                </td>
                <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {{ code.usedByApiKey || '-' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { showToast } from '../utils/toast'
import CustomDropdown from '../components/CustomDropdown.vue'

// 响应式数据
const isLoading = ref(false)
const isGenerating = ref(false)
const codes = ref([])
const stats = ref(null)

// 筛选器
const filters = reactive({
  status: '',
  type: '',
  code: '',
  apiKey: ''
})

// 选项配置
const statusOptions = [
  { label: '所有状态', value: '' },
  { label: '未使用', value: 'unused' },
  { label: '已使用', value: 'used' }
]

const typeOptions = [
  { label: '所有类型', value: '' },
  { label: '日卡', value: 'daily' },
  { label: '月卡', value: 'monthly' }
]

// 搜索防抖
let searchTimeout = null
const debounceSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    loadCodes()
  }, 500)
}

// 加载兑换码列表
const loadCodes = async () => {
  isLoading.value = true
  try {
    const params = new URLSearchParams()
    if (filters.status) params.append('status', filters.status)
    if (filters.type) params.append('type', filters.type)
    if (filters.code) params.append('code', filters.code)
    if (filters.apiKey) params.append('apiKey', filters.apiKey)

    const response = await fetch(`/admin/redemption-codes?${params}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      }
    })

    if (!response.ok) {
      throw new Error('Failed to load redemption codes')
    }

    const result = await response.json()
    codes.value = result.data
  } catch (error) {
    console.error('Error loading redemption codes:', error)
    showToast('加载兑换码失败', 'error')
  } finally {
    isLoading.value = false
  }
}

// 加载统计信息
const loadStats = async () => {
  try {
    const response = await fetch('/admin/redemption-codes/stats', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      }
    })

    if (!response.ok) {
      throw new Error('Failed to load stats')
    }

    const result = await response.json()
    stats.value = result.data
  } catch (error) {
    console.error('Error loading stats:', error)
    showToast('加载统计信息失败', 'error')
  }
}

// 生成兑换码
const generateCodes = async (type) => {
  isGenerating.value = true
  try {
    const response = await fetch('/admin/redemption-codes/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      },
      body: JSON.stringify({ type, count: 20 })
    })

    if (!response.ok) {
      throw new Error('Failed to generate codes')
    }

    const result = await response.json()
    showToast(`成功生成 ${result.data.length} 个${type === 'daily' ? '日卡' : '月卡'}`, 'success')

    // 刷新数据
    await refreshData()
  } catch (error) {
    console.error('Error generating codes:', error)
    showToast('生成兑换码失败', 'error')
  } finally {
    isGenerating.value = false
  }
}

// 提取可用兑换码
const extractCodes = async (type) => {
  try {
    const response = await fetch(`/admin/redemption-codes/extract/${type}?count=20`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      }
    })

    if (!response.ok) {
      throw new Error('Failed to extract codes')
    }

    const result = await response.json()
    const codeText = result.data.join('\n')

    // 复制到剪贴板
    await navigator.clipboard.writeText(codeText)
    showToast(
      `成功提取 ${result.data.length} 个${type === 'daily' ? '日卡' : '月卡'}并复制到剪贴板`,
      'success'
    )
  } catch (error) {
    console.error('Error extracting codes:', error)
    showToast('提取兑换码失败', 'error')
  }
}

// 复制到剪贴板
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    showToast('已复制到剪贴板', 'success')
  } catch (error) {
    console.error('Copy failed:', error)
    showToast('复制失败', 'error')
  }
}

// 格式化日期时间
const formatDateTime = (dateString) => {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 刷新数据
const refreshData = async () => {
  await Promise.all([loadStats(), loadCodes()])
}

// 组件挂载时加载数据
onMounted(() => {
  refreshData()
})
</script>

<style scoped>
.btn {
  @apply rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2;
}

.btn-primary {
  @apply bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500;
}

.btn-secondary {
  @apply bg-purple-600 text-white hover:bg-purple-700 focus:ring-purple-500;
}

.btn-success {
  @apply bg-green-600 text-white hover:bg-green-700 focus:ring-green-500;
}

.btn-outline {
  @apply border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-blue-500;
}

.btn:disabled {
  @apply cursor-not-allowed opacity-50;
}

.card {
  @apply rounded-lg border border-gray-200 bg-white shadow-sm;
}
</style>
