<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
  >
    <div
      class="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800"
    >
      <div class="p-6">
        <!-- 标题栏 -->
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">卡类型使用统计</h2>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {{ cardType?.name }} - {{ getCategoryName(cardType?.category) }}
            </p>
          </div>
          <button
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            @click="$emit('close')"
          >
            <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M6 18L18 6M6 6l12 12"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
          </button>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="py-12 text-center">
          <div class="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <svg class="h-6 w-6 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
            加载统计数据...
          </div>
        </div>

        <!-- 统计内容 -->
        <div v-else class="space-y-6">
          <!-- 概览统计 -->
          <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div class="rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 p-4 text-white">
              <div class="text-2xl font-bold">{{ stats?.totalAssociatedKeys || 0 }}</div>
              <div class="text-sm text-blue-100">关联 API Keys</div>
            </div>
            <div class="rounded-lg bg-gradient-to-r from-green-500 to-green-600 p-4 text-white">
              <div class="text-2xl font-bold">{{ stats?.activeKeys || 0 }}</div>
              <div class="text-sm text-green-100">活跃 Keys</div>
            </div>
            <div class="rounded-lg bg-gradient-to-r from-purple-500 to-purple-600 p-4 text-white">
              <div class="text-2xl font-bold">{{ stats?.totalRedemptions || 0 }}</div>
              <div class="text-sm text-purple-100">兑换次数</div>
            </div>
            <div class="rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 p-4 text-white">
              <div class="text-2xl font-bold">{{ formatUsage(stats?.totalTokenUsage) }}</div>
              <div class="text-sm text-orange-100">总使用量</div>
            </div>
          </div>

          <!-- 使用趋势图表 -->
          <div class="rounded-lg bg-gray-50 p-6 dark:bg-gray-700">
            <h3 class="mb-4 text-lg font-medium text-gray-900 dark:text-white">使用趋势</h3>
            <div
              v-if="!stats?.usageTrend?.length"
              class="py-8 text-center text-gray-500 dark:text-gray-400"
            >
              暂无使用趋势数据
            </div>
            <div v-else class="flex h-64 items-end justify-between gap-2">
              <div
                v-for="(point, index) in stats.usageTrend"
                :key="index"
                class="min-h-[8px] flex-1 rounded-t bg-blue-500"
                :style="{ height: getBarHeight(point.usage, stats.usageTrend) }"
                :title="`${point.date}: ${formatUsage(point.usage)}`"
              ></div>
            </div>
            <div class="mt-2 flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>过去{{ stats?.usageTrend?.length || 0 }}天</span>
              <span>今日</span>
            </div>
          </div>

          <!-- 关联的 API Keys -->
          <div
            class="rounded-lg border border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800"
          >
            <div class="border-b border-gray-200 px-6 py-4 dark:border-gray-600">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">关联的 API Keys</h3>
            </div>
            <div class="p-6">
              <div
                v-if="!stats?.associatedKeys?.length"
                class="py-8 text-center text-gray-500 dark:text-gray-400"
              >
                暂无关联的 API Keys
              </div>
              <div v-else class="space-y-3">
                <div
                  v-for="key in stats.associatedKeys"
                  :key="key.id"
                  class="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700"
                >
                  <div class="flex-1">
                    <div class="font-medium text-gray-900 dark:text-white">{{ key.name }}</div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">ID: {{ key.id }}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-sm font-medium text-gray-900 dark:text-white">
                      {{ formatUsage(key.totalUsage) }}
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">总用量</div>
                  </div>
                  <div class="ml-4">
                    <span
                      class="rounded-full px-2 py-1 text-xs font-medium"
                      :class="{
                        'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300':
                          key.active,
                        'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300': !key.active
                      }"
                    >
                      {{ key.active ? '活跃' : '停用' }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 兑换历史 -->
          <div
            class="rounded-lg border border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800"
          >
            <div class="border-b border-gray-200 px-6 py-4 dark:border-gray-600">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">兑换历史</h3>
            </div>
            <div class="p-6">
              <div
                v-if="!stats?.redemptionHistory?.length"
                class="py-8 text-center text-gray-500 dark:text-gray-400"
              >
                暂无兑换历史
              </div>
              <div v-else class="space-y-3">
                <div
                  v-for="redemption in stats.redemptionHistory.slice(0, 10)"
                  :key="redemption.id"
                  class="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700"
                >
                  <div class="flex-1">
                    <div class="font-medium text-gray-900 dark:text-white">
                      {{ redemption.code }}
                    </div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">
                      {{ formatDate(redemption.usedAt) }}
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-sm text-gray-900 dark:text-white">
                      {{ redemption.apiKeyName || redemption.apiKeyId }}
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">使用者</div>
                  </div>
                </div>
                <div v-if="stats.redemptionHistory.length > 10" class="text-center">
                  <button
                    class="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    @click="showAllRedemptions = !showAllRedemptions"
                  >
                    {{
                      showAllRedemptions
                        ? '收起'
                        : `查看全部 ${stats.redemptionHistory.length} 条记录`
                    }}
                  </button>
                </div>
                <div v-if="showAllRedemptions" class="space-y-3">
                  <div
                    v-for="redemption in stats.redemptionHistory.slice(10)"
                    :key="redemption.id"
                    class="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700"
                  >
                    <div class="flex-1">
                      <div class="font-medium text-gray-900 dark:text-white">
                        {{ redemption.code }}
                      </div>
                      <div class="text-sm text-gray-500 dark:text-gray-400">
                        {{ formatDate(redemption.usedAt) }}
                      </div>
                    </div>
                    <div class="text-right">
                      <div class="text-sm text-gray-900 dark:text-white">
                        {{ redemption.apiKeyName || redemption.apiKeyId }}
                      </div>
                      <div class="text-xs text-gray-500 dark:text-gray-400">使用者</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 按钮栏 -->
        <div class="mt-8 flex justify-end gap-3 border-t border-gray-200 pt-6 dark:border-gray-600">
          <button
            class="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600 disabled:bg-blue-300"
            :disabled="loading"
            @click="refreshStats"
          >
            <svg
              class="h-4 w-4"
              :class="{ 'animate-spin': loading }"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
            刷新数据
          </button>
          <button
            class="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="$emit('close')"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useToast } from '@/utils/toast'

const props = defineProps({
  visible: Boolean,
  cardType: {
    type: Object,
    default: () => null
  }
})

defineEmits(['close'])

const toast = useToast()

// 响应式数据
const loading = ref(false)
const stats = ref(null)
const showAllRedemptions = ref(false)

// 监听器
watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible && props.cardType) {
      loadStats()
    }
  }
)

// 方法
async function loadStats() {
  if (!props.cardType) return

  try {
    loading.value = true

    const response = await fetch(`/admin/card-types/${props.cardType.id}/stats`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      }
    })

    if (!response.ok) throw new Error('获取统计数据失败')

    const result = await response.json()
    stats.value = result.data || {}
  } catch (error) {
    console.error('加载统计数据失败:', error)
    toast.error('加载统计数据失败: ' + error.message)
    stats.value = {}
  } finally {
    loading.value = false
  }
}

async function refreshStats() {
  await loadStats()
  toast.success('统计数据已刷新')
}

// 工具函数
function getCategoryName(category) {
  const names = {
    daily: '每日卡',
    monthly: '月卡',
    unlimited: '不限时'
  }
  return names[category] || category
}

function formatUsage(usage) {
  if (!usage || usage === 0) return '0'

  if (usage >= 1000000) {
    return (usage / 1000000).toFixed(1) + 'M'
  } else if (usage >= 1000) {
    return (usage / 1000).toFixed(1) + 'K'
  }
  return usage.toString()
}

function formatDate(dateString) {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getBarHeight(value, data) {
  if (!data || !data.length) return '8px'

  const max = Math.max(...data.map((d) => d.usage))
  if (max === 0) return '8px'

  const percentage = (value / max) * 100
  return `${Math.max(8, percentage * 2.4)}px` // 最小高度8px，最大高度240px
}
</script>
