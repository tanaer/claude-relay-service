<template>
  <div class="fixed inset-0 z-50 overflow-y-auto">
    <div
      class="flex min-h-screen items-end justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0"
    >
      <!-- 背景遮罩 -->
      <div
        class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
        @click="$emit('close')"
      ></div>

      <!-- 模态框内容 -->
      <div
        class="relative inline-block transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle"
      >
        <!-- 标题栏 -->
        <div class="border-b border-gray-200 bg-white px-6 py-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-medium text-gray-900">
              配置倍率模板 - {{ entity?.name || '未知实体' }}
            </h3>
            <button class="rounded-md text-gray-400 hover:text-gray-600" @click="$emit('close')">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="mt-2">
            <p class="text-sm text-gray-500">
              {{ getEntityTypeText(entityType) }} / ID: {{ entity?.id?.slice(0, 8) || 'N/A' }}...
            </p>
            <p v-if="entity?.platform" class="mt-1 text-xs text-gray-400">
              平台: {{ entity.platform }}
            </p>
          </div>
        </div>

        <!-- 内容区域 -->
        <div class="bg-white px-6 py-4">
          <div class="mb-4">
            <label class="mb-2 block text-sm font-medium text-gray-700"> 选择倍率模板 </label>
            <div class="space-y-2">
              <!-- 默认选项 -->
              <label class="flex items-center">
                <input
                  v-model="selectedTemplateId"
                  class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  type="radio"
                  :value="null"
                />
                <div class="ml-3">
                  <div class="text-sm font-medium text-gray-900">无 (使用默认倍率)</div>
                  <div class="text-xs text-gray-500">不单独配置倍率模板，使用系统默认倍率</div>
                </div>
              </label>

              <!-- 模板选项 -->
              <template v-if="templates.length > 0">
                <label v-for="template in templates" :key="template.id" class="flex items-center">
                  <input
                    v-model="selectedTemplateId"
                    class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                    type="radio"
                    :value="template.id"
                  />
                  <div class="ml-3 flex-1">
                    <div class="flex items-center">
                      <span class="text-sm font-medium text-gray-900">{{ template.name }}</span>
                      <span
                        v-if="template.isDefault"
                        class="ml-2 inline-flex rounded-full bg-green-100 px-2 text-xs font-semibold leading-5 text-green-800"
                      >
                        默认
                      </span>
                    </div>
                    <div v-if="template.description" class="mt-1 text-xs text-gray-500">
                      {{ template.description }}
                    </div>
                    <div class="mt-1 text-xs text-gray-400">
                      创建时间: {{ formatDate(template.createdAt) }}
                    </div>
                  </div>
                </label>
              </template>

              <!-- 无可用模板 -->
              <div v-else class="py-4 text-center text-sm text-gray-500">
                <i class="fas fa-info-circle mr-2"></i>
                暂无可用的倍率模板
              </div>
            </div>
          </div>

          <!-- 当前设置提示 -->
          <div v-if="currentTemplateId" class="mb-4 rounded-md bg-blue-50 p-3">
            <div class="flex">
              <i class="fas fa-info-circle mr-2 mt-0.5 text-blue-400"></i>
              <div class="text-sm">
                <span class="font-medium text-blue-800">当前配置:</span>
                <span class="ml-1 text-blue-700">{{ getCurrentTemplateName() }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div class="flex justify-end space-x-3">
            <button
              class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              type="button"
              @click="$emit('close')"
            >
              取消
            </button>
            <button
              class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              :disabled="saving"
              type="button"
              @click="handleSave"
            >
              <i v-if="saving" class="fas fa-spinner fa-spin mr-2"></i>
              {{ saving ? '保存中...' : '保存配置' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, defineProps, defineEmits } from 'vue'

// Props
const props = defineProps({
  entity: {
    type: Object,
    required: true
  },
  entityType: {
    type: String,
    required: true
  },
  templates: {
    type: Array,
    default: () => []
  }
})

// Emits
const emit = defineEmits(['close', 'save'])

// 响应式数据
const selectedTemplateId = ref(null)
const currentTemplateId = ref(null)
const saving = ref(false)

// 初始化选中的模板
onMounted(() => {
  currentTemplateId.value = props.entity?.rateTemplateId || null
  selectedTemplateId.value = currentTemplateId.value
})

// 获取实体类型文本
const getEntityTypeText = (entityType) => {
  const typeMap = {
    groups: '账户分组',
    shared: '共享账户',
    dedicated: '专属账户'
  }
  return typeMap[entityType] || entityType
}

// 获取当前模板名称
const getCurrentTemplateName = () => {
  if (!currentTemplateId.value) return '使用默认倍率'
  const template = props.templates.find((t) => t.id === currentTemplateId.value)
  return template ? template.name : '未知模板'
}

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 保存配置
const handleSave = async () => {
  // 如果选择没有变化，直接关闭
  if (selectedTemplateId.value === currentTemplateId.value) {
    emit('close')
    return
  }

  saving.value = true

  try {
    // 触发保存事件，传递模板ID
    await emit('save', {
      templateId: selectedTemplateId.value
    })
  } catch (error) {
    console.error('Save failed:', error)
  } finally {
    saving.value = false
  }
}
</script>
