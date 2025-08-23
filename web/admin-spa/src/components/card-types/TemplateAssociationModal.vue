<template>
  <div
    v-if="visible"
    class="inset0 fixed z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
  >
    <div
      class="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800"
    >
      <div class="p-6">
        <!-- 标题栏 -->
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">模版关联管理</h2>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
              管理卡类型与计费模版的关联关系
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

        <!-- 搜索和筛选 -->
        <div class="mb-6 flex flex-wrap gap-4">
          <div class="flex-1">
            <input
              v-model="searchQuery"
              class="w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="搜索卡类型或模版..."
              type="text"
            />
          </div>
          <select
            v-model="filterCategory"
            class="rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="">所有分类</option>
            <option value="daily">每日卡</option>
            <option value="monthly">月卡</option>
            <option value="unlimited">不限时</option>
          </select>
          <button
            class="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:bg-blue-300"
            :disabled="loading"
            @click="loadData"
          >
            刷新
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
            加载中...
          </div>
        </div>

        <!-- 关联管理界面 -->
        <div v-else class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <!-- 卡类型列表 -->
          <div class="rounded-lg border border-gray-200 dark:border-gray-600">
            <div class="border-b border-gray-200 px-4 py-3 dark:border-gray-600">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                卡类型 ({{ filteredCardTypes.length }})
              </h3>
            </div>
            <div class="max-h-96 overflow-y-auto">
              <div
                v-for="cardType in filteredCardTypes"
                :key="cardType.id"
                :class="[
                  'cursor-pointer border-b border-gray-100 p-4 transition-colors dark:border-gray-700',
                  selectedCardType?.id === cardType.id
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                ]"
                @click="selectCardType(cardType)"
              >
                <div class="flex items-center justify-between">
                  <div>
                    <h4 class="font-medium text-gray-900 dark:text-white">{{ cardType.name }}</h4>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      {{ getCategoryName(cardType.category) }} • ${{ cardType.priceUsd }}
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span
                      :class="[
                        'rounded-full px-2 py-1 text-xs font-medium',
                        cardType.active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
                      ]"
                    >
                      {{ cardType.active ? '启用' : '停用' }}
                    </span>
                    <span
                      class="rounded-full bg-purple-100 px-2 py-1 text-xs text-purple-800 dark:bg-purple-900 dark:text-purple-300"
                    >
                      {{ (cardType.associatedTemplates || []).length }} 模版
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 计费模版列表 -->
          <div class="rounded-lg border border-gray-200 dark:border-gray-600">
            <div class="border-b border-gray-200 px-4 py-3 dark:border-gray-600">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                计费模版 ({{ filteredTemplates.length }})
              </h3>
            </div>
            <div class="max-h-96 overflow-y-auto">
              <div
                v-for="template in filteredTemplates"
                :key="template.id"
                class="border-b border-gray-100 p-4 dark:border-gray-700"
              >
                <div class="flex items-center justify-between">
                  <div class="flex-1">
                    <h4 class="font-medium text-gray-900 dark:text-white">{{ template.name }}</h4>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      {{ template.description || '无描述' }}
                    </p>
                    <div
                      class="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
                    >
                      <span>应用倍率: {{ template.multiplier }}x</span>
                      <span>•</span>
                      <span>{{ template.associatedCount || 0 }} 个关联</span>
                    </div>
                  </div>
                  <div class="ml-4 flex items-center gap-2">
                    <button
                      v-if="selectedCardType && !isTemplateAssociated(template.id)"
                      class="rounded bg-green-500 px-3 py-1 text-xs text-white hover:bg-green-600 disabled:bg-green-300"
                      :disabled="associating"
                      @click="addAssociation(template.id)"
                    >
                      关联
                    </button>
                    <button
                      v-if="selectedCardType && isTemplateAssociated(template.id)"
                      class="rounded bg-red-500 px-3 py-1 text-xs text-white hover:bg-red-600 disabled:bg-red-300"
                      :disabled="associating"
                      @click="removeAssociation(template.id)"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 选中卡类型的关联详情 -->
        <div
          v-if="selectedCardType"
          class="mt-6 rounded-lg border border-gray-200 p-4 dark:border-gray-600"
        >
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">
              {{ selectedCardType.name }} - 关联的模版
            </h3>
            <div class="flex gap-2">
              <button
                class="rounded-lg bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600 disabled:bg-blue-300"
                :disabled="!hasUnassociatedTemplates || associating"
                @click="bulkAssociate"
              >
                批量关联
              </button>
              <button
                class="rounded-lg bg-red-500 px-3 py-1 text-sm text-white hover:bg-red-600 disabled:bg-red-300"
                :disabled="!selectedCardType.associatedTemplates?.length || associating"
                @click="bulkDisassociate"
              >
                批量取消
              </button>
            </div>
          </div>

          <div
            v-if="!selectedCardType.associatedTemplates?.length"
            class="py-8 text-center text-gray-500 dark:text-gray-400"
          >
            <svg
              class="mx-auto mb-4 h-12 w-12 opacity-50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
            暂无关联的计费模版
          </div>

          <div v-else class="grid gap-3 md:grid-cols-2">
            <div
              v-for="template in selectedCardType.associatedTemplates"
              :key="template.id"
              class="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700"
            >
              <div class="flex-1">
                <h4 class="font-medium text-gray-900 dark:text-white">{{ template.name }}</h4>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  倍率: {{ template.multiplier }}x • 关联: {{ template.usageCount || 0 }}
                </p>
              </div>
              <button
                class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                :disabled="associating"
                title="取消关联"
                @click="removeAssociation(template.id)"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M6 18L18 6M6 6l12 12"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- 批量操作提示 -->
        <div v-if="selectedCardType" class="mt-4 rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
          <p class="text-sm text-blue-800 dark:text-blue-200">
            <svg class="mr-1 inline h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
            提示: 选择左侧的卡类型，然后在右侧点击"关联"或"取消"按钮来管理关联关系。
          </p>
        </div>

        <!-- 按钮栏 -->
        <div class="mt-8 flex justify-end gap-3 border-t border-gray-200 pt-6 dark:border-gray-600">
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
import { ref, computed, watch, onMounted } from 'vue'
import { useToast } from '@/utils/toast'

const props = defineProps({
  visible: Boolean
})

defineEmits(['close', 'success'])

const toast = useToast()

// 响应式数据
const loading = ref(false)
const associating = ref(false)
const cardTypes = ref([])
const templates = ref([])
const selectedCardType = ref(null)
const searchQuery = ref('')
const filterCategory = ref('')

// 计算属性
const filteredCardTypes = computed(() => {
  let filtered = cardTypes.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(
      (ct) =>
        ct.name.toLowerCase().includes(query) ||
        (ct.description && ct.description.toLowerCase().includes(query))
    )
  }

  if (filterCategory.value) {
    filtered = filtered.filter((ct) => ct.category === filterCategory.value)
  }

  return filtered
})

const filteredTemplates = computed(() => {
  if (!searchQuery.value) return templates.value

  const query = searchQuery.value.toLowerCase()
  return templates.value.filter(
    (template) =>
      template.name.toLowerCase().includes(query) ||
      (template.description && template.description.toLowerCase().includes(query))
  )
})

const hasUnassociatedTemplates = computed(() => {
  if (!selectedCardType.value || !templates.value.length) return false

  const associatedIds = (selectedCardType.value.associatedTemplates || []).map((t) => t.id)
  return templates.value.some((t) => !associatedIds.includes(t.id))
})

// 监听器
watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) {
      loadData()
    }
  }
)

// 生命周期
onMounted(() => {
  if (props.visible) {
    loadData()
  }
})

// 方法
async function loadData() {
  try {
    loading.value = true

    // 并行加载卡类型和模版
    const [cardTypesResponse, templatesResponse] = await Promise.all([
      fetch('/admin/card-types', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('adminToken')}`
        }
      }),
      fetch('/admin/rate-templates', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('adminToken')}`
        }
      })
    ])

    if (!cardTypesResponse.ok || !templatesResponse.ok) {
      throw new Error('数据加载失败')
    }

    const [cardTypesResult, templatesResult] = await Promise.all([
      cardTypesResponse.json(),
      templatesResponse.json()
    ])

    cardTypes.value = cardTypesResult.data || []
    templates.value = templatesResult.data || []

    // 为模版添加关联计数
    for (const template of templates.value) {
      template.associatedCount = cardTypes.value.reduce((count, ct) => {
        return count + (ct.associatedTemplates || []).filter((t) => t.id === template.id).length
      }, 0)
    }
  } catch (error) {
    console.error('数据加载失败:', error)
    toast.error('数据加载失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

function selectCardType(cardType) {
  selectedCardType.value = cardType
}

function isTemplateAssociated(templateId) {
  if (!selectedCardType.value?.associatedTemplates) return false
  return selectedCardType.value.associatedTemplates.some((t) => t.id === templateId)
}

async function addAssociation(templateId) {
  if (!selectedCardType.value) return

  try {
    associating.value = true

    const response = await fetch(
      `/admin/card-types/${selectedCardType.value.id}/templates/${templateId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('adminToken')}`
        }
      }
    )

    if (!response.ok) throw new Error('关联失败')

    // 更新本地数据
    const template = templates.value.find((t) => t.id === templateId)
    if (template) {
      if (!selectedCardType.value.associatedTemplates) {
        selectedCardType.value.associatedTemplates = []
      }
      selectedCardType.value.associatedTemplates.push({
        id: template.id,
        name: template.name,
        multiplier: template.multiplier,
        usageCount: 0
      })
      template.associatedCount = (template.associatedCount || 0) + 1
    }

    toast.success('模版关联成功')
  } catch (error) {
    console.error('关联失败:', error)
    toast.error('关联失败: ' + error.message)
  } finally {
    associating.value = false
  }
}

async function removeAssociation(templateId) {
  if (!selectedCardType.value) return

  try {
    associating.value = true

    const response = await fetch(
      `/admin/card-types/${selectedCardType.value.id}/templates/${templateId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('adminToken')}`
        }
      }
    )

    if (!response.ok) throw new Error('取消关联失败')

    // 更新本地数据
    if (selectedCardType.value.associatedTemplates) {
      const index = selectedCardType.value.associatedTemplates.findIndex((t) => t.id === templateId)
      if (index > -1) {
        selectedCardType.value.associatedTemplates.splice(index, 1)
      }
    }

    const template = templates.value.find((t) => t.id === templateId)
    if (template && template.associatedCount > 0) {
      template.associatedCount -= 1
    }

    toast.success('取消关联成功')
  } catch (error) {
    console.error('取消关联失败:', error)
    toast.error('取消关联失败: ' + error.message)
  } finally {
    associating.value = false
  }
}

async function bulkAssociate() {
  if (!selectedCardType.value || associating.value) return

  try {
    associating.value = true

    const associatedIds = (selectedCardType.value.associatedTemplates || []).map((t) => t.id)
    const unassociatedTemplates = templates.value.filter((t) => !associatedIds.includes(t.id))

    if (unassociatedTemplates.length === 0) {
      toast.info('所有模版已关联')
      return
    }

    const promises = unassociatedTemplates.map((template) =>
      fetch(`/admin/card-types/${selectedCardType.value.id}/templates/${template.id}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('adminToken')}`
        }
      })
    )

    await Promise.all(promises)

    // 更新本地数据
    if (!selectedCardType.value.associatedTemplates) {
      selectedCardType.value.associatedTemplates = []
    }

    for (const template of unassociatedTemplates) {
      selectedCardType.value.associatedTemplates.push({
        id: template.id,
        name: template.name,
        multiplier: template.multiplier,
        usageCount: 0
      })
      template.associatedCount = (template.associatedCount || 0) + 1
    }

    toast.success(`批量关联成功，关联了 ${unassociatedTemplates.length} 个模版`)
  } catch (error) {
    console.error('批量关联失败:', error)
    toast.error('批量关联失败: ' + error.message)
  } finally {
    associating.value = false
  }
}

async function bulkDisassociate() {
  if (!selectedCardType.value?.associatedTemplates?.length || associating.value) return

  try {
    associating.value = true

    const promises = selectedCardType.value.associatedTemplates.map((template) =>
      fetch(`/admin/card-types/${selectedCardType.value.id}/templates/${template.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('adminToken')}`
        }
      })
    )

    await Promise.all(promises)

    // 更新本地数据
    const associatedCount = selectedCardType.value.associatedTemplates.length

    for (const associatedTemplate of selectedCardType.value.associatedTemplates) {
      const template = templates.value.find((t) => t.id === associatedTemplate.id)
      if (template && template.associatedCount > 0) {
        template.associatedCount -= 1
      }
    }

    selectedCardType.value.associatedTemplates = []

    toast.success(`批量取消关联成功，取消了 ${associatedCount} 个模版`)
  } catch (error) {
    console.error('批量取消关联失败:', error)
    toast.error('批量取消关联失败: ' + error.message)
  } finally {
    associating.value = false
  }
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
</script>
