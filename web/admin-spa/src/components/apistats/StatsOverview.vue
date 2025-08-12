<template>
  <div class="mb-6 grid grid-cols-1 items-stretch gap-4 md:mb-8 md:grid-cols-2 md:gap-6">
    <!-- API Key 基本信息 -->
    <div class="card h-full p-4 md:p-6">
      <h3 class="mb-3 flex items-center text-lg font-bold text-gray-900 md:mb-4 md:text-xl">
        <i class="fas fa-info-circle mr-2 text-sm text-blue-500 md:mr-3 md:text-base" />
        API Key 信息
      </h3>
      <div class="space-y-2 md:space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 md:text-base">名称</span>
          <span class="break-all text-sm font-medium text-gray-900 md:text-base">{{
            statsData.name
          }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 md:text-base">状态</span>
          <span
            class="text-sm font-medium md:text-base"
            :class="statsData.isActive ? 'text-green-600' : 'text-red-600'"
          >
            <i
              class="mr-1 text-xs md:text-sm"
              :class="statsData.isActive ? 'fas fa-check-circle' : 'fas fa-times-circle'"
            />
            {{ statsData.isActive ? '活跃' : '已停用' }}
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 md:text-base">权限</span>
          <span class="text-sm font-medium text-gray-900 md:text-base">{{
            formatPermissions(statsData.permissions)
          }}</span>
        </div>
        <div class="flex items-start justify-between">
          <span class="mt-1 flex-shrink-0 text-sm text-gray-600 md:text-base">过期时间</span>
          <div v-if="statsData.expiresAt" class="text-right">
            <div
              v-if="isApiKeyExpired(statsData.expiresAt)"
              class="text-sm font-medium text-red-600 md:text-base"
            >
              <i class="fas fa-exclamation-circle mr-1 text-xs md:text-sm" />
              已过期
            </div>
            <div
              v-else-if="isApiKeyExpiringSoon(statsData.expiresAt)"
              class="break-all text-xs font-medium text-orange-600 md:text-base"
            >
              <i class="fas fa-clock mr-1 text-xs md:text-sm" />
              {{ formatExpireDate(statsData.expiresAt) }}
            </div>
            <div v-else class="break-all text-xs font-medium text-gray-900 md:text-base">
              {{ formatExpireDate(statsData.expiresAt) }}
            </div>
          </div>
          <div v-else class="text-sm font-medium text-gray-400 md:text-base">
            <i class="fas fa-infinity mr-1 text-xs md:text-sm" />
            永不过期
          </div>
        </div>
      </div>
    </div>

    <!-- Token 使用进度 -->
    <div class="card h-full p-4 md:p-6">
      <h3 class="mb-3 flex items-center text-lg font-bold text-gray-900 md:mb-4 md:text-xl">
        <i class="fas fa-chart-bar mr-2 text-sm text-green-500 md:mr-3 md:text-base" />
        Token 使用情况
      </h3>

      <div class="space-y-4">
        <!-- 进度条 -->
        <div class="relative">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm text-gray-600">Token使用量</span>
            <span class="text-sm font-medium text-gray-900">
              {{ formatTokenDisplay(calculateTokensFromCost(getCurrentDayCost())) }} /
              {{ formatTokenDisplay(maxTokens) }}
            </span>
          </div>

          <div class="h-3 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              class="h-full rounded-full transition-all duration-500 ease-out"
              :class="getProgressBarClass(tokenProgress)"
              :style="{ width: tokenProgress + '%' }"
            ></div>
          </div>

          <div class="mt-2 flex items-center justify-between text-xs text-gray-500">
            <span>{{ tokenProgress.toFixed(1) }}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'
import { computed } from 'vue'

const apiStatsStore = useApiStatsStore()
const { statsData, currentPeriodData } = storeToRefs(apiStatsStore)

// 检查API Key类型（日卡或月卡）
const getApiKeyType = () => {
  if (!statsData.value?.limits?.dailyCostLimit) return 'daily'
  const limit = parseFloat(statsData.value.limits.dailyCostLimit)
  // 根据费用限额判断类型：$20为日卡，$100为月卡
  return limit >= 80 ? 'monthly' : 'daily'
}

// 获取API Key的最大Token数
const getApiKeyMaxTokens = () => {
  const keyType = getApiKeyType()
  return keyType === 'monthly' ? 70000000 : 10000000 // 月卡7000万，日卡1000万
}

// 根据费用计算Token使用量
const calculateTokensFromCost = (cost) => {
  if (!cost || cost === 0) return 0

  const keyType = getApiKeyType()
  const maxTokens = getApiKeyMaxTokens()
  const maxCost = keyType === 'monthly' ? 100 : 20

  // 根据费用比例计算Token使用量
  return Math.round((cost / maxCost) * maxTokens)
}

// 计算最大Token数
const maxTokens = computed(() => {
  return getApiKeyMaxTokens()
})

// 获取API Key的今日费用
const getCurrentDayCost = () => {
  // 使用当前时间段的费用数据
  return parseFloat(currentPeriodData.value?.cost || 0)
}

// 计算Token使用进度百分比（基于费用）
const tokenProgress = computed(() => {
  const todayCost = getCurrentDayCost()
  const tokensFromCost = calculateTokensFromCost(todayCost)
  const maxTokenValue = maxTokens.value

  if (maxTokenValue === 0) return 0

  const progress = (tokensFromCost / maxTokenValue) * 100
  return Math.min(progress, 100) // 限制最大100%
})

// 根据进度获取进度条颜色
const getProgressBarClass = (progress) => {
  if (progress >= 90) {
    return 'bg-gradient-to-r from-red-500 to-red-600'
  } else if (progress >= 70) {
    return 'bg-gradient-to-r from-yellow-500 to-orange-500'
  } else if (progress >= 50) {
    return 'bg-gradient-to-r from-blue-500 to-cyan-500'
  } else {
    return 'bg-gradient-to-r from-green-500 to-emerald-500'
  }
}

// 格式化过期日期
const formatExpireDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 检查 API Key 是否已过期
const isApiKeyExpired = (expiresAt) => {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

// 检查 API Key 是否即将过期（7天内）
const isApiKeyExpiringSoon = (expiresAt) => {
  if (!expiresAt) return false
  const expireDate = new Date(expiresAt)
  const now = new Date()
  const daysUntilExpire = (expireDate - now) / (1000 * 60 * 60 * 24)
  return daysUntilExpire > 0 && daysUntilExpire <= 7
}

// 格式化Token显示
const formatTokenDisplay = (tokens) => {
  if (typeof tokens !== 'number') {
    tokens = parseInt(tokens) || 0
  }

  if (tokens === 0) return '0'

  // 大数字使用简化格式
  if (tokens >= 1000000) {
    return (tokens / 1000000).toFixed(1) + 'M'
  } else if (tokens >= 1000) {
    return (tokens / 1000).toFixed(1) + 'K'
  } else {
    return tokens.toLocaleString()
  }
}

// 格式化权限
const formatPermissions = (permissions) => {
  const permissionMap = {
    claude: 'Claude',
    gemini: 'Gemini',
    all: '全部模型'
  }

  return permissionMap[permissions] || permissions || '未知'
}
</script>

<style scoped>
/* 卡片样式 */
.card {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow:
    0 10px 15px -3px rgba(0, 0, 0, 0.1),
    0 4px 6px -2px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
}

.card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.15),
    0 10px 10px -5px rgba(0, 0, 0, 0.08);
}

/* 统计卡片样式 */
.stat-card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.8) 100%);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 16px;
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
}

@media (min-width: 768px) {
  .stat-card {
    border-radius: 20px;
    padding: 24px;
  }
}

.stat-card::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.stat-card:hover::before {
  opacity: 1;
}

/* 响应式优化 */
@media (max-width: 768px) {
  .card {
    margin-bottom: 1rem;
  }
}

@media (max-width: 480px) {
  .stat-card {
    padding: 12px;
  }
}
</style>
