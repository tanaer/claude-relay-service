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
              @change="handleFilterChange"
            />

            <!-- 类型筛选 -->
            <CustomDropdown
              v-model="filters.type"
              :options="typeOptions"
              placeholder="所有类型"
              @change="handleFilterChange"
            />

            <!-- 搜索框 -->
            <div class="flex gap-2">
              <input
                v-model="filters.code"
                class="w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="搜索兑换码..."
                type="text"
                @input="debounceSearch"
              />
              <input
                v-model="filters.apiKey"
                class="w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="搜索API Key..."
                type="text"
                @input="debounceSearch"
              />
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="flex flex-wrap gap-2">
            <!-- 生成按钮 -->
            <button
              class="btn btn-primary flex items-center gap-2"
              :disabled="isGenerating"
              @click="generateCodes('daily')"
            >
              <i class="fas fa-plus"></i>
              生成日卡 (20个)
            </button>
            <button
              class="btn btn-secondary flex items-center gap-2"
              :disabled="isGenerating"
              @click="generateCodes('monthly')"
            >
              <i class="fas fa-plus"></i>
              生成月卡 (20个)
            </button>

            <!-- 提取按钮 -->
            <button class="btn btn-success flex items-center gap-2" @click="extractCodes('daily')">
              <i class="fas fa-download"></i>
              提取日卡 (默认20个)
            </button>
            <button
              class="btn btn-success flex items-center gap-2"
              @click="extractCodes('monthly')"
            >
              <i class="fas fa-download"></i>
              提取月卡 (默认20个)
            </button>

            <!-- 刷新按钮 -->
            <button class="btn btn-outline flex items-center gap-2" @click="refreshData()">
              <i class="fas fa-sync-alt" :class="{ 'fa-spin': isLoading }"></i>
              刷新
            </button>

            <!-- 策略配置按钮 -->
            <div class="flex items-center gap-2">
              <button
                class="btn btn-info flex items-center gap-2"
                @click="openPolicyConfig('global')"
              >
                <i class="fas fa-cog"></i>
                全局策略
              </button>
              <button
                class="btn btn-warning flex items-center gap-2"
                @click="openTypeConfigDropdown"
              >
                <i class="fas fa-layer-group"></i>
                类型策略
              </button>
            </div>

            <!-- 类型策略下拉菜单 -->
            <div
              v-if="showTypeDropdown"
              class="absolute right-0 top-12 z-10 w-40 rounded-lg border border-gray-200 bg-white shadow-lg"
            >
              <div class="py-1">
                <button
                  class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                  @click="openPolicyConfig('type', 'daily')"
                >
                  日卡策略
                </button>
                <button
                  class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                  @click="openPolicyConfig('type', 'monthly')"
                >
                  月卡策略
                </button>
              </div>
            </div>
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
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  操作
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white">
              <tr v-if="isLoading">
                <td class="px-6 py-4 text-center" colspan="7">
                  <i class="fas fa-spinner fa-spin mr-2"></i>
                  加载中...
                </td>
              </tr>
              <tr v-else-if="codes.length === 0">
                <td class="px-6 py-4 text-center text-gray-500" colspan="7">暂无兑换码数据</td>
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
                <td class="whitespace-nowrap px-6 py-4 text-sm">
                  <div class="flex items-center gap-2">
                    <button
                      class="text-xs text-blue-600 hover:text-blue-900"
                      title="配置策略"
                      @click="openPolicyConfig('code', code.id)"
                    >
                      <i class="fas fa-cog"></i>
                      策略
                    </button>
                    <button
                      v-if="code.usedByApiKey"
                      class="text-xs text-green-600 hover:text-green-900"
                      title="查看策略状态"
                      @click="viewPolicyStatus(code.usedByApiKey)"
                    >
                      <i class="fas fa-chart-line"></i>
                      状态
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 分页控件 -->
      <div class="mt-4 flex items-center justify-between">
        <div class="text-sm text-gray-500">
          显示
          {{
            Math.min((pagination.currentPage - 1) * pagination.pageSize + 1, pagination.totalCount)
          }}
          -
          {{ Math.min(pagination.currentPage * pagination.pageSize, pagination.totalCount) }}
          共 {{ pagination.totalCount }} 条记录
        </div>
        <div class="flex items-center gap-2">
          <button
            class="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="pagination.currentPage <= 1"
            @click="changePage(pagination.currentPage - 1)"
          >
            上一页
          </button>

          <div class="flex items-center gap-1">
            <template v-for="page in getPageNumbers()" :key="page">
              <button
                v-if="page !== '...'"
                class="rounded-lg px-3 py-2 text-sm"
                :class="
                  page === pagination.currentPage
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-300 hover:bg-gray-50'
                "
                @click="changePage(page)"
              >
                {{ page }}
              </button>
              <span v-else class="px-2 text-gray-500">...</span>
            </template>
          </div>

          <button
            class="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="pagination.currentPage >= pagination.totalPages"
            @click="changePage(pagination.currentPage + 1)"
          >
            下一页
          </button>
        </div>
      </div>
    </div>

    <!-- 策略配置弹窗 -->
    <PolicyConfigModal
      :policy-type="policyConfigModal.type"
      :show="policyConfigModal.show"
      :target-id="policyConfigModal.targetId"
      @close="closePolicyConfig"
      @saved="onPolicySaved"
    />

    <!-- 策略状态弹窗 -->
    <div v-if="policyStatusModal.show" class="modal-overlay" @click="closePolicyStatus">
      <div class="modal-content policy-status-modal" @click.stop>
        <div class="modal-header">
          <h3 class="modal-title">API Key 策略状态</h3>
          <button class="modal-close-btn" @click="closePolicyStatus">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <PolicyStatusMonitor
            :api-key-id="policyStatusModal.apiKeyId"
            @configure="handleConfigureFromStatus"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { showToast } from '../utils/toast'
import { useApi } from '../composables/useApi'
import CustomDropdown from '../components/common/CustomDropdown.vue'
import PolicyConfigModal from '../components/redemption/PolicyConfigModal.vue'
import PolicyStatusMonitor from '../components/redemption/PolicyStatusMonitor.vue'

// 使用API组合式函数
const api = useApi()

// 响应式数据
const isLoading = ref(false)
const isGenerating = ref(false)
const codes = ref([])
const stats = ref(null)

// 分页数据
const pagination = reactive({
  currentPage: 1,
  pageSize: 20,
  totalCount: 0,
  totalPages: 0
})

// 策略配置相关状态
const showTypeDropdown = ref(false)
const policyConfigModal = reactive({
  show: false,
  type: 'global', // 'global' | 'type' | 'code'
  targetId: null
})

const policyStatusModal = reactive({
  show: false,
  apiKeyId: null
})

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
    // 搜索时重置到第一页
    pagination.currentPage = 1
    loadCodes()
  }, 500)
}

// 处理筛选器改变
const handleFilterChange = () => {
  // 筛选器改变时重置到第一页
  pagination.currentPage = 1
  loadCodes()
}

// 加载兑换码列表
const loadCodes = async () => {
  isLoading.value = true
  try {
    const params = {}
    if (filters.status) params.status = filters.status
    if (filters.type) params.type = filters.type
    if (filters.code) params.code = filters.code
    if (filters.apiKey) params.apiKey = filters.apiKey

    // 添加分页参数
    params.page = pagination.currentPage
    params.pageSize = pagination.pageSize

    console.log('🔍 Loading redemption codes with params:', params)

    const result = await api.get('/admin/redemption-codes', {
      params
    })

    console.log('📊 API response:', result)

    if (result.success) {
      // 处理响应数据结构
      if (result.data && typeof result.data === 'object' && result.data.items) {
        // 分页数据结构: { items: [], pagination: {} }
        codes.value = result.data.items

        // 更新分页信息
        if (result.data.pagination) {
          Object.assign(pagination, result.data.pagination)
          console.log('📄 Updated pagination:', pagination)
        }
      } else if (Array.isArray(result.data)) {
        // 直接返回数组（向后兼容）
        codes.value = result.data
        // 没有分页信息时，重置分页
        pagination.totalCount = result.data.length
        pagination.totalPages = Math.ceil(result.data.length / pagination.pageSize)
        console.log('📄 Legacy array response, updated pagination:', pagination)
      } else {
        console.warn('⚠️ Unexpected data structure:', result.data)
        codes.value = []
      }

      console.log('✅ Loaded codes count:', codes.value.length)
    }
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
    const result = await api.get('/admin/redemption-codes/stats')
    if (result.success) {
      stats.value = result.data
    }
  } catch (error) {
    console.error('Error loading stats:', error)
    showToast('加载统计信息失败', 'error')
  }
}

// 生成兑换码
const generateCodes = async (type) => {
  isGenerating.value = true
  try {
    const result = await api.post('/admin/redemption-codes/generate', { type, count: 20 })

    if (result.success) {
      showToast(`成功生成 ${result.data.length} 个${type === 'daily' ? '日卡' : '月卡'}`, 'success')
      // 刷新数据
      await refreshData()
    }
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
    const defaultCount = 20
    const input = window.prompt('请输入要提取的数量（默认20，最多100）', String(defaultCount))
    if (input === null) return
    const parsed = parseInt(input, 10)
    let count = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultCount
    if (count > 100) {
      count = 100
      showToast('最多一次提取 100 个，已自动调整为 100', 'info')
    }

    const result = await api.get(`/admin/redemption-codes/extract/${type}?count=${count}`)

    if (result.success) {
      const codeText = result.data.join('\n')

      // 复制到剪贴板
      await navigator.clipboard.writeText(codeText)
      showToast(
        `成功提取 ${result.data.length} 个${type === 'daily' ? '日卡' : '月卡'}并复制到剪贴板`,
        'success'
      )
    }
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

// 策略配置相关方法
const openTypeConfigDropdown = () => {
  showTypeDropdown.value = !showTypeDropdown.value
  // 点击其他地方关闭下拉菜单
  if (showTypeDropdown.value) {
    const closeDropdown = (e) => {
      if (!e.target.closest('.relative')) {
        showTypeDropdown.value = false
        document.removeEventListener('click', closeDropdown)
      }
    }
    setTimeout(() => {
      document.addEventListener('click', closeDropdown)
    }, 0)
  }
}

const openPolicyConfig = (type, targetId = null) => {
  policyConfigModal.show = true
  policyConfigModal.type = type
  policyConfigModal.targetId = targetId
  showTypeDropdown.value = false
}

const closePolicyConfig = () => {
  policyConfigModal.show = false
  policyConfigModal.type = 'global'
  policyConfigModal.targetId = null
}

const onPolicySaved = () => {
  showToast('策略配置保存成功', 'success')
}

const viewPolicyStatus = (apiKeyId) => {
  policyStatusModal.show = true
  policyStatusModal.apiKeyId = apiKeyId
}

const closePolicyStatus = () => {
  policyStatusModal.show = false
  policyStatusModal.apiKeyId = null
}

const handleConfigureFromStatus = (config) => {
  // 从策略状态组件触发的配置操作
  closePolicyStatus()
  if (config?.type && config?.id) {
    openPolicyConfig('code', config.id)
  }
}

// 分页相关方法
const changePage = (page) => {
  if (page < 1 || page > pagination.totalPages) return
  pagination.currentPage = page
  loadCodes()
}

const getPageNumbers = () => {
  const { currentPage, totalPages } = pagination
  const pages = []

  if (totalPages <= 7) {
    // 如果总页数不超过7页，显示所有页码
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i)
    }
  } else {
    // 复杂分页逻辑
    if (currentPage <= 4) {
      // 当前页在前4页
      for (let i = 1; i <= 5; i++) {
        pages.push(i)
      }
      pages.push('...')
      pages.push(totalPages)
    } else if (currentPage >= totalPages - 3) {
      // 当前页在后4页
      pages.push(1)
      pages.push('...')
      for (let i = totalPages - 4; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // 当前页在中间
      pages.push(1)
      pages.push('...')
      for (let i = currentPage - 1; i <= currentPage + 1; i++) {
        pages.push(i)
      }
      pages.push('...')
      pages.push(totalPages)
    }
  }

  return pages
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

.btn-info {
  @apply bg-cyan-600 text-white hover:bg-cyan-700 focus:ring-cyan-500;
}

.btn-warning {
  @apply bg-yellow-600 text-white hover:bg-yellow-700 focus:ring-yellow-500;
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

/* 模态框样式 */
.modal-overlay {
  @apply fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50;
}

.modal-content {
  @apply max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-xl;
}

.policy-status-modal {
  @apply max-w-2xl;
}

.modal-header {
  @apply flex items-center justify-between border-b border-gray-200 px-6 py-4;
}

.modal-title {
  @apply text-lg font-semibold text-gray-900;
}

.modal-close-btn {
  @apply rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600;
}

.modal-body {
  @apply max-h-[calc(90vh-8rem)] overflow-y-auto px-6 py-4;
}
</style>
