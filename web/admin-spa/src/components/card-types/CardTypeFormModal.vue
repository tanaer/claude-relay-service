<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
  >
    <div
      class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800"
    >
      <div class="p-6">
        <!-- 标题栏 -->
        <div class="mb-6 flex items-center justify-between">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
            {{ isEditing ? '编辑卡类型' : '创建卡类型' }}
          </h2>
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

        <!-- 表单 -->
        <form @submit.prevent="handleSubmit">
          <div class="grid gap-6">
            <!-- 基本信息 -->
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  卡类型名称 *
                </label>
                <input
                  v-model="form.name"
                  class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:disabled:bg-gray-600"
                  :disabled="cardType?.builtin"
                  placeholder="输入卡类型名称"
                  required
                  type="text"
                />
              </div>

              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  分类 *
                </label>
                <select
                  v-model="form.category"
                  class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:disabled:bg-gray-600"
                  :disabled="cardType?.builtin"
                  required
                >
                  <option value="">选择分类</option>
                  <option value="daily">每日卡</option>
                  <option value="monthly">月卡</option>
                  <option value="unlimited">不限时</option>
                </select>
              </div>
            </div>

            <!-- 描述 -->
            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                描述
              </label>
              <textarea
                v-model="form.description"
                class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder="输入卡类型描述"
                rows="3"
              ></textarea>
            </div>

            <!-- Token 配置 -->
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  总Token数量 *
                </label>
                <input
                  v-model.number="form.totalTokens"
                  class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  min="0"
                  placeholder="0"
                  required
                  type="number"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">0表示不限制总数</p>
              </div>

              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  每日Token数量 *
                </label>
                <input
                  v-model.number="form.dailyTokens"
                  class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  min="0"
                  placeholder="0"
                  required
                  type="number"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">0表示不限制每日数量</p>
              </div>
            </div>

            <!-- 时间和价格配置 -->
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  有效期（天） *
                </label>
                <input
                  v-model.number="form.duration"
                  class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  min="-1"
                  placeholder="-1"
                  required
                  type="number"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">-1表示不限时</p>
              </div>

              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  价格 (USD) *
                </label>
                <input
                  v-model.number="form.priceUsd"
                  class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  min="0"
                  placeholder="0.00"
                  required
                  step="0.01"
                  type="number"
                />
              </div>
            </div>

            <!-- 高级配置 -->
            <div class="border-t border-gray-200 pt-6 dark:border-gray-600">
              <h3 class="mb-4 text-lg font-medium text-gray-900 dark:text-white">高级配置</h3>

              <div class="grid gap-4">
                <!-- 状态 -->
                <div class="flex items-center gap-2">
                  <input id="active" v-model="form.active" class="rounded" type="checkbox" />
                  <label class="text-sm text-gray-700 dark:text-gray-300" for="active">
                    启用此卡类型
                  </label>
                </div>

                <!-- 标签配置 -->
                <div>
                  <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    默认标签
                  </label>
                  <div class="mb-2 flex items-center gap-2">
                    <input
                      v-model="newTag"
                      class="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      placeholder="输入标签名称并按回车"
                      type="text"
                      @keydown.enter.prevent="addTag"
                    />
                    <button
                      class="rounded-lg bg-blue-500 px-3 py-2 text-sm text-white hover:bg-blue-600"
                      type="button"
                      @click="addTag"
                    >
                      添加
                    </button>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <span
                      v-for="(tag, index) in form.defaultTags"
                      :key="index"
                      class="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-300"
                    >
                      {{ tag }}
                      <button
                        class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        type="button"
                        @click="removeTag(index)"
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

                <!-- 元数据 -->
                <div>
                  <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    备注
                  </label>
                  <textarea
                    v-model="form.notes"
                    class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    placeholder="内部备注信息"
                    rows="3"
                  ></textarea>
                </div>
              </div>
            </div>

            <!-- 计费模版关联预览 -->
            <div
              v-if="isEditing && cardType?.associatedTemplates?.length"
              class="border-t border-gray-200 pt-6 dark:border-gray-600"
            >
              <h3 class="mb-4 text-lg font-medium text-gray-900 dark:text-white">关联的计费模版</h3>
              <div class="grid gap-2">
                <div
                  v-for="template in cardType.associatedTemplates"
                  :key="template.id"
                  class="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700"
                >
                  <div>
                    <span class="font-medium text-gray-900 dark:text-white">{{
                      template.name
                    }}</span>
                    <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">
                      {{ template.usageCount || 0 }}个关联
                    </span>
                  </div>
                  <button
                    class="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                    title="移除关联"
                    type="button"
                    @click="removeTemplateAssociation(template.id)"
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
          </div>

          <!-- 按钮栏 -->
          <div
            class="mt-8 flex justify-end gap-3 border-t border-gray-200 pt-6 dark:border-gray-600"
          >
            <button
              class="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              type="button"
              @click="$emit('close')"
            >
              取消
            </button>
            <button
              class="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600 disabled:bg-blue-300"
              :disabled="submitting"
              type="submit"
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
              {{ submitting ? '保存中...' : '保存' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useToast } from '@/utils/toast'

const props = defineProps({
  visible: Boolean,
  cardType: {
    type: Object,
    default: () => null
  }
})

const emit = defineEmits(['close', 'success', 'template-removed'])

const toast = useToast()

// 响应式数据
const submitting = ref(false)
const newTag = ref('')

const form = reactive({
  name: '',
  description: '',
  category: '',
  duration: -1,
  totalTokens: 0,
  dailyTokens: 0,
  priceUsd: 0,
  active: true,
  defaultTags: [],
  notes: ''
})

// 计算属性
const isEditing = computed(() => !!props.cardType)

// 监听器
watch(
  () => props.cardType,
  (newCardType) => {
    if (newCardType) {
      // 编辑模式，填充表单数据
      Object.assign(form, {
        name: newCardType.name || '',
        description: newCardType.description || '',
        category: newCardType.category || '',
        duration: newCardType.duration ?? -1,
        totalTokens: newCardType.totalTokens || 0,
        dailyTokens: newCardType.dailyTokens || 0,
        priceUsd: newCardType.priceUsd || 0,
        active: newCardType.active ?? true,
        defaultTags: [...(newCardType.defaultTags || [])],
        notes: newCardType.notes || ''
      })
    } else {
      // 创建模式，重置表单
      Object.assign(form, {
        name: '',
        description: '',
        category: '',
        duration: -1,
        totalTokens: 0,
        dailyTokens: 0,
        priceUsd: 0,
        active: true,
        defaultTags: [],
        notes: ''
      })
    }
  },
  { immediate: true }
)

// 方法
async function handleSubmit() {
  try {
    submitting.value = true

    const url = isEditing.value ? `/admin/card-types/${props.cardType.id}` : '/admin/card-types'

    const method = isEditing.value ? 'PUT' : 'POST'

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      },
      body: JSON.stringify(form)
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || '操作失败')
    }

    const result = await response.json()
    toast.success(isEditing.value ? '卡类型更新成功' : '卡类型创建成功')
    emit('success', result.data)
  } catch (error) {
    console.error('提交失败:', error)
    toast.error('操作失败: ' + error.message)
  } finally {
    submitting.value = false
  }
}

function addTag() {
  const tag = newTag.value.trim()
  if (tag && !form.defaultTags.includes(tag)) {
    form.defaultTags.push(tag)
    newTag.value = ''
  }
}

function removeTag(index) {
  form.defaultTags.splice(index, 1)
}

async function removeTemplateAssociation(templateId) {
  try {
    const response = await fetch(`/admin/card-types/${props.cardType.id}/templates/${templateId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      }
    })

    if (!response.ok) throw new Error('移除关联失败')

    toast.success('模版关联已移除')

    // 通知父组件更新数据
    emit('template-removed', templateId)
  } catch (error) {
    console.error('移除关联失败:', error)
    toast.error('操作失败: ' + error.message)
  }
}
</script>
