<template>
  <div class="policy-monitor">
    <div class="monitor-header">
      <h4 class="monitor-title">策略状态监控</h4>
      <div class="monitor-controls">
        <button class="refresh-btn" :disabled="loading" title="刷新数据" @click="refreshData">
          <i :class="['fas fa-sync', { 'fa-spin': loading }]"></i>
        </button>
      </div>
    </div>

    <div v-if="loading && !policyBinding" class="loading-state">
      <div class="spinner"></div>
      <p>加载策略状态...</p>
    </div>

    <div v-else-if="!policyBinding" class="empty-state">
      <div class="empty-icon">
        <i class="fas fa-info-circle"></i>
      </div>
      <p>此API Key未绑定动态策略</p>
    </div>

    <div v-else class="monitor-content">
      <!-- 策略绑定信息 -->
      <div class="info-card">
        <h5 class="card-title">绑定信息</h5>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">来源类型</span>
            <span class="info-value">{{ getSourceTypeName(policyBinding.sourceType) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">来源标识</span>
            <span class="info-value">{{ policyBinding.sourceId }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">当前模板</span>
            <span class="info-value template-value">
              {{ getCurrentTemplateName(policyBinding.currentTemplate) }}
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">初始模板</span>
            <span class="info-value">{{
              getInitialTemplateName(policyBinding.initialTemplate)
            }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">绑定状态</span>
            <span :class="['status-badge', getStatusClass(policyBinding.isActive)]">
              {{ policyBinding.isActive === 'true' ? '活跃' : '非活跃' }}
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">最后检查</span>
            <span class="info-value">{{ formatTime(policyBinding.lastCheck) }}</span>
          </div>
        </div>
      </div>

      <!-- 使用量监控 -->
      <div v-if="usageData" class="usage-card">
        <h5 class="card-title">今日使用量</h5>
        <div class="usage-overview">
          <div class="usage-progress">
            <div class="progress-bar">
              <div
                class="progress-fill"
                :class="getProgressClass(currentPercentage)"
                :style="{ width: `${Math.min(currentPercentage, 100)}%` }"
              ></div>
            </div>
            <div class="progress-text">
              <span class="percentage">{{ currentPercentage.toFixed(1) }}%</span>
              <span class="tokens"
                >{{ formatNumber(usageData.totalTokens) }} /
                {{ formatNumber(usageData.dailyLimit) }} tokens</span
              >
            </div>
          </div>
        </div>

        <div class="usage-details">
          <div class="usage-item">
            <span class="usage-label">输入Token</span>
            <span class="usage-value">{{ formatNumber(usageData.inputTokens) }}</span>
          </div>
          <div class="usage-item">
            <span class="usage-label">输出Token</span>
            <span class="usage-value">{{ formatNumber(usageData.outputTokens) }}</span>
          </div>
          <div class="usage-item">
            <span class="usage-label">缓存创建</span>
            <span class="usage-value">{{ formatNumber(usageData.cacheCreateTokens) }}</span>
          </div>
          <div class="usage-item">
            <span class="usage-label">缓存读取</span>
            <span class="usage-value">{{ formatNumber(usageData.cacheReadTokens) }}</span>
          </div>
          <div class="usage-item">
            <span class="usage-label">请求次数</span>
            <span class="usage-value">{{ formatNumber(usageData.requestCount) }}</span>
          </div>
          <div class="usage-item">
            <span class="usage-label">最后更新</span>
            <span class="usage-value">{{ formatTime(usageData.lastUpdate) }}</span>
          </div>
        </div>
      </div>

      <!-- 已应用阈值 -->
      <div v-if="appliedThresholds.length > 0" class="thresholds-card">
        <h5 class="card-title">已触发阈值</h5>
        <div class="thresholds-list">
          <div v-for="(threshold, index) in appliedThresholds" :key="index" class="threshold-item">
            <div class="threshold-info">
              <div class="threshold-percentage">{{ threshold.percentage }}%</div>
              <div class="threshold-template">{{ getTemplateName(threshold.templateId) }}</div>
              <div class="threshold-time">{{ formatTime(threshold.triggeredAt) }}</div>
            </div>
            <div class="threshold-usage">使用量: {{ threshold.usagePercentage?.toFixed(1) }}%</div>
          </div>
        </div>
      </div>

      <!-- 模板切换历史 -->
      <div v-if="switchHistory.length > 0" class="history-card">
        <h5 class="card-title">切换历史（最近10次）</h5>
        <div class="history-list">
          <div v-for="(record, index) in switchHistory" :key="index" class="history-item">
            <div class="history-main">
              <div class="history-action">
                <i class="fas fa-exchange-alt"></i>
                从
                <span class="template-name">{{ getTemplateName(record.fromTemplate) }}</span> 切换到
                <span class="template-name">{{ getTemplateName(record.toTemplate) }}</span>
              </div>
              <div class="history-reason">原因: {{ getSwitchReason(record.reason) }}</div>
            </div>
            <div class="history-meta">
              <div class="history-usage">{{ record.usagePercentage?.toFixed(1) }}%</div>
              <div class="history-time">{{ formatTime(record.triggeredAt) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="actions">
        <button
          class="btn btn-primary btn-sm"
          @click="
            $emit('configure', {
              type: policyBinding.metadata?.codeType,
              id: policyBinding.metadata?.originalCode
            })
          "
        >
          <i class="fas fa-cog"></i>
          配置策略
        </button>
        <button class="btn btn-secondary btn-sm" :disabled="loading" @click="loadSwitchHistory">
          <i class="fas fa-history"></i>
          查看完整历史
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { apiClient } from '@/config/api'
import { calculateUsagePercentage, formatNumber as formatNumberUtil } from '@/utils/usage'

export default {
  name: 'PolicyStatusMonitor',
  props: {
    apiKeyId: {
      type: String,
      required: true
    },
    autoRefresh: {
      type: Boolean,
      default: true
    },
    refreshInterval: {
      type: Number,
      default: 30000 // 30秒
    }
  },
  emits: ['configure'],
  setup(props) {
    const loading = ref(false)
    const policyBinding = ref(null)
    const usageData = ref(null)
    const switchHistory = ref([])
    const rateTemplates = ref([])

    let refreshTimer = null

    // 计算属性
    const appliedThresholds = computed(() => {
      return policyBinding.value?.appliedThresholds || []
    })

    const currentPercentage = computed(() => {
      if (!usageData.value) return 0
      // 使用统一的计算方法
      return calculateUsagePercentage(usageData.value.totalTokens, usageData.value.dailyLimit)
    })

    // 方法
    const loadPolicyBinding = async () => {
      try {
        const response = await apiClient.get(`/admin/redemption-policies/api-key/${props.apiKeyId}`)
        const result = await response.json()
        if (result.success) {
          policyBinding.value = result.data
        } else {
          policyBinding.value = null
        }
      } catch (error) {
        console.error('Failed to load policy binding:', error)
        policyBinding.value = null
      }
    }

    const loadUsageData = async () => {
      try {
        const response = await apiClient.get(`/admin/redemption-policies/usage/${props.apiKeyId}`)
        const result = await response.json()
        if (result.success) {
          usageData.value = result.data
        } else {
          usageData.value = null
        }
      } catch (error) {
        console.error('Failed to load usage data:', error)
        usageData.value = null
      }
    }

    const loadSwitchHistory = async () => {
      try {
        const response = await apiClient.get(
          `/admin/redemption-policies/switch-history/${props.apiKeyId}?limit=10`
        )
        const result = await response.json()
        if (result.success) {
          switchHistory.value = result.data || []
        }
      } catch (error) {
        console.error('Failed to load switch history:', error)
        switchHistory.value = []
      }
    }

    const loadRateTemplates = async () => {
      try {
        const response = await apiClient.get('/admin/rate-templates')
        const result = await response.json()
        if (result.success) {
          rateTemplates.value = result.data || []
        }
      } catch (error) {
        console.error('Failed to load rate templates:', error)
      }
    }

    const refreshData = async () => {
      loading.value = true
      try {
        await Promise.all([loadPolicyBinding(), loadUsageData(), loadSwitchHistory()])
      } finally {
        loading.value = false
      }
    }

    const startAutoRefresh = () => {
      if (props.autoRefresh) {
        refreshTimer = setInterval(refreshData, props.refreshInterval)
      }
    }

    const stopAutoRefresh = () => {
      if (refreshTimer) {
        clearInterval(refreshTimer)
        refreshTimer = null
      }
    }

    // 格式化方法
    const formatTime = (timestamp) => {
      if (!timestamp) return '-'
      const date = new Date(timestamp)
      return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    }

    const formatNumber = (num) => {
      return formatNumberUtil(num)
    }

    const getSourceTypeName = (type) => {
      const typeMap = {
        redemption: '兑换码',
        manual: '手动绑定',
        system: '系统'
      }
      return typeMap[type] || type
    }

    const getTemplateName = (templateId) => {
      if (!templateId) return '无'
      const template = rateTemplates.value.find((t) => t.id === templateId)
      return template?.name || templateId
    }

    const getCurrentTemplateName = (templateId) => {
      const name = getTemplateName(templateId)
      return name === '无' ? '未绑定动态策略' : name
    }

    const getInitialTemplateName = (templateId) => {
      const name = getTemplateName(templateId)
      return name === '无' ? '未设置' : name
    }

    const getStatusClass = (isActive) => {
      return isActive === 'true' ? 'status-active' : 'status-inactive'
    }

    const getProgressClass = (percentage) => {
      if (percentage >= 90) return 'progress-danger'
      if (percentage >= 70) return 'progress-warning'
      return 'progress-normal'
    }

    const getSwitchReason = (reason) => {
      const reasonMap = {
        daily_reset: '每日重置',
        manual_switch: '手动切换',
        threshold_exceeded: '阈值触发'
      }

      // 处理阈值触发的具体原因
      if (reason?.startsWith('threshold_')) {
        const match = reason.match(/threshold_(\d+)_exceeded/)
        if (match) {
          return `${match[1]}% 阈值触发`
        }
      }

      return reasonMap[reason] || reason
    }

    // 生命周期
    onMounted(async () => {
      await loadRateTemplates()
      await refreshData()
      startAutoRefresh()
    })

    onUnmounted(() => {
      stopAutoRefresh()
    })

    return {
      loading,
      policyBinding,
      usageData,
      switchHistory,
      appliedThresholds,
      currentPercentage,
      refreshData,
      loadSwitchHistory,
      formatTime,
      formatNumber,
      getSourceTypeName,
      getTemplateName,
      getCurrentTemplateName,
      getInitialTemplateName,
      getStatusClass,
      getProgressClass,
      getSwitchReason
    }
  }
}
</script>

<style scoped>
.policy-monitor {
  @apply rounded-lg border border-gray-200 bg-white;
}

.monitor-header {
  @apply flex items-center justify-between border-b border-gray-200 px-4 py-3;
}

.monitor-title {
  @apply text-sm font-semibold text-gray-900;
}

.monitor-controls {
  @apply flex items-center gap-2;
}

.refresh-btn {
  @apply rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50;
}

.loading-state,
.empty-state {
  @apply flex flex-col items-center justify-center py-8 text-gray-500;
}

.spinner {
  @apply mb-2 h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600;
}

.empty-icon {
  @apply mb-2 text-2xl text-gray-300;
}

.monitor-content {
  @apply space-y-4 p-4;
}

.info-card,
.usage-card,
.thresholds-card,
.history-card {
  @apply rounded-lg border border-gray-100 p-4;
}

.card-title {
  @apply mb-3 text-sm font-medium text-gray-900;
}

.info-grid {
  @apply grid grid-cols-1 gap-3 sm:grid-cols-2;
}

.info-item {
  @apply flex flex-col gap-1;
}

.info-label {
  @apply text-xs text-gray-500;
}

.info-value {
  @apply text-sm text-gray-900;
}

.template-value {
  @apply font-medium text-blue-600;
}

.status-badge {
  @apply inline-block rounded-full px-2 py-1 text-xs font-medium;
}

.status-active {
  @apply bg-green-100 text-green-800;
}

.status-inactive {
  @apply bg-gray-100 text-gray-800;
}

.usage-overview {
  @apply mb-4;
}

.usage-progress {
  @apply space-y-2;
}

.progress-bar {
  @apply h-2 w-full overflow-hidden rounded-full bg-gray-200;
}

.progress-fill {
  @apply h-full transition-all duration-300;
}

.progress-normal {
  @apply bg-green-500;
}

.progress-warning {
  @apply bg-yellow-500;
}

.progress-danger {
  @apply bg-red-500;
}

.progress-text {
  @apply flex items-center justify-between text-sm;
}

.percentage {
  @apply font-semibold text-gray-900;
}

.tokens {
  @apply text-gray-600;
}

.usage-details {
  @apply grid grid-cols-2 gap-3 sm:grid-cols-3;
}

.usage-item {
  @apply flex flex-col gap-1;
}

.usage-label {
  @apply text-xs text-gray-500;
}

.usage-value {
  @apply text-sm text-gray-900;
}

.thresholds-list,
.history-list {
  @apply space-y-3;
}

.threshold-item {
  @apply flex items-center justify-between rounded-lg bg-gray-50 p-3;
}

.threshold-info {
  @apply flex items-center gap-3;
}

.threshold-percentage {
  @apply text-sm font-semibold text-blue-600;
}

.threshold-template {
  @apply text-sm text-gray-900;
}

.threshold-time {
  @apply text-xs text-gray-500;
}

.threshold-usage {
  @apply text-xs text-gray-500;
}

.history-item {
  @apply flex items-start justify-between rounded-lg bg-gray-50 p-3;
}

.history-main {
  @apply flex-1;
}

.history-action {
  @apply mb-1 text-sm text-gray-900;
}

.template-name {
  @apply font-medium text-blue-600;
}

.history-reason {
  @apply text-xs text-gray-500;
}

.history-meta {
  @apply ml-4 flex flex-col items-end gap-1;
}

.history-usage {
  @apply text-xs font-medium text-gray-700;
}

.history-time {
  @apply text-xs text-gray-500;
}

.actions {
  @apply flex items-center gap-2 border-t border-gray-100 pt-4;
}

.btn {
  @apply rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50;
}

.btn-primary {
  @apply bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500;
}

.btn-secondary {
  @apply bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-500;
}

.btn-sm {
  @apply px-2 py-1 text-xs;
}
</style>
