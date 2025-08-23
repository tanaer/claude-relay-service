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
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">批量编辑卡类型</h2>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
              选择了 {{ selectedCardTypes.length }} 个卡类型进行批量修改
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

        <!-- 选中的卡类型列表 -->
        <div class="mb-6 rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
          <h3 class="mb-3 text-sm font-medium text-gray-900 dark:text-white">选中的卡类型</h3>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="cardType in selectedCardTypes"
              :key="cardType.id"
              class="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800 dark:bg-blue-900 dark:text-blue-300"
            >
              {{ cardType.name }}
              <button
                class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                @click="removeFromSelection(cardType.id)"
              >
                <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M6 18L18 6M6 6l12 12"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                  />
                </svg>
              </button>
            </span>
          </div>
        </div>

        <!-- 批量操作选项 -->
        <div class="space-y-6">
          <!-- 快速操作 -->
          <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
            <h3 class="mb-4 text-lg font-medium text-gray-900 dark:text-white">快速操作</h3>
            <div class="grid gap-3 md:grid-cols-2">
              <button
                class="flex items-center justify-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-white transition-colors hover:bg-green-600 disabled:bg-green-300"
                :disabled="submitting"
                @click="batchToggleStatus(true)"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                  />
                </svg>
                批量启用
              </button>

              <button
                class="flex items-center justify-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 text-white transition-colors hover:bg-yellow-600 disabled:bg-yellow-300"
                :disabled="submitting"
                @click="batchToggleStatus(false)"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M10 9V6a4 4 0 118 0v3M5 9h14l-1 10a2 2 0 01-2 2H8a2 2 0 01-2-2L5 9z"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                  />
                </svg>
                批量停用
              </button>
            </div>
          </div>

          <!-- 字段修改 -->
          <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
            <h3 class="mb-4 text-lg font-medium text-gray-900 dark:text-white">批量修改字段</h3>

            <!-- 价格调整 -->
            <div class="mb-4">
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                价格调整
              </label>
              <div class="flex items-center gap-3">
                <select
                  v-model="batchEdit.priceAction"
                  class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="">不修改</option>
                  <option value="set">设置为</option>
                  <option value="multiply">乘以倍数</option>
                  <option value="add">增加</option>
                  <option value="subtract">减少</option>
                </select>
                <input
                  v-if="batchEdit.priceAction"
                  v-model.number="batchEdit.priceValue"
                  class="w-32 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  min="0"
                  :placeholder="getPricePlaceholder()"
                  step="0.01"
                  type="number"
                />
                <span v-if="batchEdit.priceAction" class="text-sm text-gray-500 dark:text-gray-400">
                  USD
                </span>
              </div>
            </div>

            <!-- Token数量调整 -->
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  总Token调整
                </label>
                <div class="flex items-center gap-2">
                  <select
                    v-model="batchEdit.totalTokensAction"
                    class="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">不修改</option>
                    <option value="set">设置为</option>
                    <option value="multiply">乘以倍数</option>
                  </select>
                  <input
                    v-if="batchEdit.totalTokensAction"
                    v-model.number="batchEdit.totalTokensValue"
                    class="w-32 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    min="0"
                    type="number"
                  />
                </div>
              </div>

              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  每日Token调整
                </label>
                <div class="flex items-center gap-2">
                  <select
                    v-model="batchEdit.dailyTokensAction"
                    class="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">不修改</option>
                    <option value="set">设置为</option>
                    <option value="multiply">乘以倍数</option>
                  </select>
                  <input
                    v-if="batchEdit.dailyTokensAction"
                    v-model.number="batchEdit.dailyTokensValue"
                    class="w-32 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    min="0"
                    type="number"
                  />
                </div>
              </div>
            </div>

            <!-- 标签管理 -->
            <div class="mt-4">
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                标签管理
              </label>
              <div class="space-y-3">
                <!-- 添加标签 -->
                <div>
                  <div class="mb-2 flex items-center gap-2">
                    <input
                      v-model="newBatchTag"
                      class="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      placeholder="输入要添加的标签"
                      type="text"
                      @keydown.enter.prevent="addBatchTag"
                    />
                    <button
                      class="rounded-lg bg-blue-500 px-3 py-2 text-sm text-white hover:bg-blue-600"
                      @click="addBatchTag"
                    >
                      添加标签
                    </button>
                  </div>
                  <div v-if="batchEdit.tagsToAdd.length" class="flex flex-wrap gap-2">
                    <span class="text-xs text-gray-500 dark:text-gray-400">将添加：</span>
                    <span
                      v-for="(tag, index) in batchEdit.tagsToAdd"
                      :key="`add-${index}`"
                      class="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs text-green-800 dark:bg-green-900 dark:text-green-300"
                    >
                      {{ tag }}
                      <button
                        class="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                        @click="removeBatchTag(index, 'add')"
                      >
                        <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            d="M6 18L18 6M6 6l12 12"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                          />
                        </svg>
                      </button>
                    </span>
                  </div>
                </div>

                <!-- 移除标签 -->
                <div>
                  <div class="mb-2 flex items-center gap-2">
                    <input
                      v-model="removeTagInput"
                      class="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      placeholder="输入要移除的标签"
                      type="text"
                      @keydown.enter.prevent="addRemoveTag"
                    />
                    <button
                      class="rounded-lg bg-red-500 px-3 py-2 text-sm text-white hover:bg-red-600"
                      @click="addRemoveTag"
                    >
                      移除标签
                    </button>
                  </div>
                  <div v-if="batchEdit.tagsToRemove.length" class="flex flex-wrap gap-2">
                    <span class="text-xs text-gray-500 dark:text-gray-400">将移除：</span>
                    <span
                      v-for="(tag, index) in batchEdit.tagsToRemove"
                      :key="`remove-${index}`"
                      class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs text-red-800 dark:bg-red-900 dark:text-red-300"
                    >
                      {{ tag }}
                      <button
                        class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                        @click="removeBatchTag(index, 'remove')"
                      >
                        <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            d="M6 18L18 6M6 6l12 12"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                          />
                        </svg>
                      </button>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 预览更改 -->
          <div
            v-if="hasChanges"
            class="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20"
          >
            <h3 class="mb-3 text-lg font-medium text-blue-900 dark:text-blue-100">预览更改</h3>
            <div class="space-y-2 text-sm">
              <div v-if="batchEdit.priceAction" class="text-blue-800 dark:text-blue-200">
                价格{{ getPriceActionText() }}
              </div>
              <div v-if="batchEdit.totalTokensAction" class="text-blue-800 dark:text-blue-200">
                总Token{{ getTokenActionText('total') }}
              </div>
              <div v-if="batchEdit.dailyTokensAction" class="text-blue-800 dark:text-blue-200">
                每日Token{{ getTokenActionText('daily') }}
              </div>
              <div v-if="batchEdit.tagsToAdd.length" class="text-blue-800 dark:text-blue-200">
                添加标签: {{ batchEdit.tagsToAdd.join(', ') }}
              </div>
              <div v-if="batchEdit.tagsToRemove.length" class="text-blue-800 dark:text-blue-200">
                移除标签: {{ batchEdit.tagsToRemove.join(', ') }}
              </div>
            </div>
          </div>
        </div>

        <!-- 按钮栏 -->
        <div class="mt-8 flex justify-end gap-3 border-t border-gray-200 pt-6 dark:border-gray-600">
          <button
            class="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            @click="$emit('close')"
          >
            取消
          </button>
          <button
            class="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600 disabled:bg-blue-300"
            :disabled="!hasChanges || submitting"
            @click="applyBatchChanges"
          >
            <svg
              v-if="submitting"
              class="h-4 w-4 animate-spin"
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
            {{ submitting ? '应用中...' : '应用更改' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useToast } from '@/utils/toast'

const props = defineProps({
  visible: Boolean,
  selectedCardTypes: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close', 'success', 'remove-from-selection'])

const toast = useToast()

// 响应式数据
const submitting = ref(false)
const newBatchTag = ref('')
const removeTagInput = ref('')

const batchEdit = reactive({
  priceAction: '',
  priceValue: 0,
  totalTokensAction: '',
  totalTokensValue: 0,
  dailyTokensAction: '',
  dailyTokensValue: 0,
  tagsToAdd: [],
  tagsToRemove: []
})

// 计算属性
const hasChanges = computed(() => {
  return !!(
    batchEdit.priceAction ||
    batchEdit.totalTokensAction ||
    batchEdit.dailyTokensAction ||
    batchEdit.tagsToAdd.length ||
    batchEdit.tagsToRemove.length
  )
})

// 方法
function removeFromSelection(cardTypeId) {
  emit('remove-from-selection', cardTypeId)
}

async function batchToggleStatus(active) {
  try {
    submitting.value = true
    const action = active ? 'activate' : 'deactivate'

    const promises = props.selectedCardTypes
      .filter((cardType) => !cardType.builtin && cardType.active !== active)
      .map((cardType) =>
        fetch(`/admin/card-types/${cardType.id}/${action}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('adminToken')}`
          }
        })
      )

    await Promise.all(promises)

    toast.success(`成功${active ? '启用' : '停用'}了 ${promises.length} 个卡类型`)
    emit('success')
  } catch (error) {
    console.error('批量状态切换失败:', error)
    toast.error('操作失败: ' + error.message)
  } finally {
    submitting.value = false
  }
}

function addBatchTag() {
  const tag = newBatchTag.value.trim()
  if (tag && !batchEdit.tagsToAdd.includes(tag)) {
    batchEdit.tagsToAdd.push(tag)
    newBatchTag.value = ''
  }
}

function addRemoveTag() {
  const tag = removeTagInput.value.trim()
  if (tag && !batchEdit.tagsToRemove.includes(tag)) {
    batchEdit.tagsToRemove.push(tag)
    removeTagInput.value = ''
  }
}

function removeBatchTag(index, type) {
  if (type === 'add') {
    batchEdit.tagsToAdd.splice(index, 1)
  } else {
    batchEdit.tagsToRemove.splice(index, 1)
  }
}

async function applyBatchChanges() {
  try {
    submitting.value = true

    const changes = {}

    // 构建更改对象
    if (batchEdit.priceAction) {
      changes.priceAction = {
        type: batchEdit.priceAction,
        value: batchEdit.priceValue
      }
    }

    if (batchEdit.totalTokensAction) {
      changes.totalTokensAction = {
        type: batchEdit.totalTokensAction,
        value: batchEdit.totalTokensValue
      }
    }

    if (batchEdit.dailyTokensAction) {
      changes.dailyTokensAction = {
        type: batchEdit.dailyTokensAction,
        value: batchEdit.dailyTokensValue
      }
    }

    if (batchEdit.tagsToAdd.length) {
      changes.addTags = batchEdit.tagsToAdd
    }

    if (batchEdit.tagsToRemove.length) {
      changes.removeTags = batchEdit.tagsToRemove
    }

    const response = await fetch('/admin/card-types/batch-edit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      },
      body: JSON.stringify({
        cardTypeIds: props.selectedCardTypes.map((ct) => ct.id),
        changes
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || '批量编辑失败')
    }

    const result = await response.json()
    toast.success(`成功更新了 ${result.data?.updated || props.selectedCardTypes.length} 个卡类型`)
    emit('success')
  } catch (error) {
    console.error('批量编辑失败:', error)
    toast.error('操作失败: ' + error.message)
  } finally {
    submitting.value = false
  }
}

// 工具函数
function getPricePlaceholder() {
  switch (batchEdit.priceAction) {
    case 'set':
      return '新价格'
    case 'multiply':
      return '倍数'
    case 'add':
      return '增加金额'
    case 'subtract':
      return '减少金额'
    default:
      return ''
  }
}

function getPriceActionText() {
  switch (batchEdit.priceAction) {
    case 'set':
      return `设置为 $${batchEdit.priceValue}`
    case 'multiply':
      return `乘以 ${batchEdit.priceValue}`
    case 'add':
      return `增加 $${batchEdit.priceValue}`
    case 'subtract':
      return `减少 $${batchEdit.priceValue}`
    default:
      return ''
  }
}

function getTokenActionText(type) {
  const action = type === 'total' ? batchEdit.totalTokensAction : batchEdit.dailyTokensAction
  const value = type === 'total' ? batchEdit.totalTokensValue : batchEdit.dailyTokensValue

  switch (action) {
    case 'set':
      return `设置为 ${value}`
    case 'multiply':
      return `乘以 ${value}`
    default:
      return ''
  }
}
</script>
