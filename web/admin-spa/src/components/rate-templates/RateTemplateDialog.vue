<template>
  <div class="fixed inset-0 z-50 overflow-y-auto">
    <div
      class="flex min-h-screen items-center justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0"
    >
      <!-- 背景遮罩 -->
      <div
        class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
        @click="handleClose"
      ></div>

      <!-- 对话框 -->
      <div
        class="inline-block transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl sm:align-middle"
      >
        <!-- 标题栏 -->
        <div class="border-b border-gray-200 bg-white px-6 py-4">
          <h3 class="text-lg font-medium leading-6 text-gray-900">
            {{ isEdit ? '编辑倍率模板' : '创建倍率模板' }}
          </h3>
        </div>

        <!-- 内容区 -->
        <div class="bg-white px-6 pb-4 pt-5">
          <!-- 基本信息 -->
          <div class="mb-6">
            <h4 class="mb-4 text-sm font-medium text-gray-900">基本信息</h4>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700">模板名称 *</label>
                <input
                  v-model="formData.name"
                  class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="例如：标准定价"
                  type="text"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">描述</label>
                <input
                  v-model="formData.description"
                  class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="模板描述"
                  type="text"
                />
              </div>
            </div>
            <div class="mt-4">
              <label class="flex items-center">
                <input
                  v-model="formData.isDefault"
                  class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  type="checkbox"
                />
                <span class="ml-2 text-sm text-gray-700">设为默认模板</span>
              </label>
            </div>
          </div>

          <!-- 批量设置 -->
          <div class="mb-6">
            <h4 class="mb-4 text-sm font-medium text-gray-900">批量设置倍率</h4>
            <div class="grid grid-cols-4 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700">输入倍率</label>
                <div class="mt-1 flex">
                  <input
                    v-model.number="batchRates.input"
                    class="block w-full rounded-l-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    step="0.1"
                    type="number"
                  />
                  <button
                    class="rounded-r-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                    @click="applyBatchRate('input')"
                  >
                    应用
                  </button>
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">输出倍率</label>
                <div class="mt-1 flex">
                  <input
                    v-model.number="batchRates.output"
                    class="block w-full rounded-l-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    step="0.1"
                    type="number"
                  />
                  <button
                    class="rounded-r-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                    @click="applyBatchRate('output')"
                  >
                    应用
                  </button>
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">缓存创建倍率</label>
                <div class="mt-1 flex">
                  <input
                    v-model.number="batchRates.cacheCreate"
                    class="block w-full rounded-l-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    step="0.1"
                    type="number"
                  />
                  <button
                    class="rounded-r-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                    @click="applyBatchRate('cacheCreate')"
                  >
                    应用
                  </button>
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">缓存读取倍率</label>
                <div class="mt-1 flex">
                  <input
                    v-model.number="batchRates.cacheRead"
                    class="block w-full rounded-l-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    step="0.1"
                    type="number"
                  />
                  <button
                    class="rounded-r-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                    @click="applyBatchRate('cacheRead')"
                  >
                    应用
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 模型倍率设置 -->
          <div class="mb-6">
            <h4 class="mb-4 text-sm font-medium text-gray-900">模型倍率设置</h4>

            <!-- 搜索框 -->
            <div class="mb-4">
              <input
                v-model="searchQuery"
                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="搜索模型..."
                type="text"
              />
            </div>

            <!-- 模型列表 -->
            <div class="max-h-96 overflow-y-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th
                      class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                    >
                      模型名称
                    </th>
                    <th
                      class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500"
                    >
                      输入倍率
                    </th>
                    <th
                      class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500"
                    >
                      输出倍率
                    </th>
                    <th
                      class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500"
                    >
                      缓存创建
                    </th>
                    <th
                      class="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500"
                    >
                      缓存读取
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 bg-white">
                  <tr v-for="model in filteredModels" :key="model">
                    <td class="whitespace-nowrap px-3 py-2 text-sm text-gray-900">
                      {{ model }}
                    </td>
                    <td class="px-3 py-2">
                      <input
                        :value="getModelRate(model, 'input')"
                        class="block w-full rounded-md border-gray-300 text-center text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        min="0"
                        step="0.1"
                        type="number"
                        @input="updateModelRate(model, 'input', $event.target.value)"
                      />
                    </td>
                    <td class="px-3 py-2">
                      <input
                        :value="getModelRate(model, 'output')"
                        class="block w-full rounded-md border-gray-300 text-center text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        min="0"
                        step="0.1"
                        type="number"
                        @input="updateModelRate(model, 'output', $event.target.value)"
                      />
                    </td>
                    <td class="px-3 py-2">
                      <input
                        :value="getModelRate(model, 'cacheCreate')"
                        class="block w-full rounded-md border-gray-300 text-center text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        min="0"
                        step="0.1"
                        type="number"
                        @input="updateModelRate(model, 'cacheCreate', $event.target.value)"
                      />
                    </td>
                    <td class="px-3 py-2">
                      <input
                        :value="getModelRate(model, 'cacheRead')"
                        class="block w-full rounded-md border-gray-300 text-center text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        min="0"
                        step="0.1"
                        type="number"
                        @input="updateModelRate(model, 'cacheRead', $event.target.value)"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 自定义模型 -->
          <div class="mb-6">
            <h4 class="mb-4 text-sm font-medium text-gray-900">自定义模型</h4>
            <div class="flex gap-2">
              <input
                v-model="newCustomModel"
                class="block flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="输入自定义模型名称"
                type="text"
                @keyup.enter="addCustomModel"
              />
              <button
                class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                @click="addCustomModel"
              >
                添加模型
              </button>
            </div>
            <div v-if="formData.customModels.length > 0" class="mt-2">
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="(model, index) in formData.customModels"
                  :key="index"
                  class="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800"
                >
                  {{ model }}
                  <button
                    class="ml-2 text-blue-600 hover:text-blue-800"
                    @click="removeCustomModel(index)"
                  >
                    <i class="fas fa-times"></i>
                  </button>
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 按钮栏 -->
        <div class="bg-gray-50 px-6 py-3 sm:flex sm:flex-row-reverse">
          <button
            class="inline-flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm"
            :disabled="!formData.name"
            @click="handleSave"
          >
            {{ isEdit ? '更新' : '创建' }}
          </button>
          <button
            class="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:ml-3 sm:mt-0 sm:w-auto sm:text-sm"
            @click="handleClose"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { showToast } from '@/utils/toast'

const props = defineProps({
  template: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'save'])

// 默认模型列表
const defaultModels = ref([
  // Claude 系列
  'claude-sonnet-4-20250514',
  'claude-opus-4-1-20250805',
  'claude-opus-4-20250514',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  // GPT 系列
  'gpt-5-mini-2025-08-07',
  'gpt-5-2025-08-07',
  'gpt-5',
  'gpt-5-mini',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4-turbo-preview',
  'gpt-4',
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-16k',
  // Gemini 系列
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  // 其他模型
  'llama-3.1-405b',
  'llama-3.1-70b',
  'llama-3.1-8b',
  'mistral-large',
  'mistral-medium',
  'mistral-small'
])

// 表单数据
const formData = ref({
  name: '',
  description: '',
  isDefault: false,
  rates: {},
  customModels: []
})

// 批量设置倍率
const batchRates = ref({
  input: 1,
  output: 1,
  cacheCreate: 1,
  cacheRead: 1
})

// 搜索查询
const searchQuery = ref('')
const newCustomModel = ref('')

// 计算属性
const isEdit = computed(() => !!props.template)

// 过滤后的模型列表
const filteredModels = computed(() => {
  const allModels = [...defaultModels.value, ...formData.value.customModels]
  if (!searchQuery.value) {
    return allModels
  }
  return allModels.filter((model) => model.toLowerCase().includes(searchQuery.value.toLowerCase()))
})

// 初始化表单数据
const initFormData = () => {
  if (props.template) {
    // 编辑模式
    formData.value = {
      name: props.template.name,
      description: props.template.description || '',
      isDefault: props.template.isDefault || false,
      rates: { ...props.template.rates },
      customModels: props.template.customModels || []
    }

    // 确保所有当前默认模型都有倍率设置
    for (const model of defaultModels.value) {
      if (!formData.value.rates[model]) {
        formData.value.rates[model] = {
          input: 1,
          output: 1,
          cacheCreate: 1,
          cacheRead: 1
        }
      }
    }
  } else {
    // 创建模式 - 初始化所有模型的默认倍率
    const rates = {}
    for (const model of defaultModels.value) {
      rates[model] = {
        input: 1,
        output: 1,
        cacheCreate: 1,
        cacheRead: 1
      }
    }
    formData.value = {
      name: '',
      description: '',
      isDefault: false,
      rates,
      customModels: []
    }
  }
}

// 安全获取模型倍率
const getModelRate = (model, column) => {
  if (!formData.value.rates[model]) {
    // 如果模型倍率不存在，初始化它
    formData.value.rates[model] = {
      input: 1,
      output: 1,
      cacheCreate: 1,
      cacheRead: 1
    }
  }
  return formData.value.rates[model][column] || 1
}

// 更新模型倍率
const updateModelRate = (model, column, value) => {
  // 确保模型的倍率对象存在
  if (!formData.value.rates[model]) {
    formData.value.rates[model] = {
      input: 1,
      output: 1,
      cacheCreate: 1,
      cacheRead: 1
    }
  }

  // 更新指定列的倍率
  formData.value.rates[model][column] = parseFloat(value) || 1
}

// 批量应用倍率
const applyBatchRate = (column) => {
  const rate = batchRates.value[column]
  if (rate === undefined || rate === null) {
    showToast('请输入有效的倍率值', 'error')
    return
  }

  const allModels = [...defaultModels.value, ...formData.value.customModels]
  for (const model of allModels) {
    if (!formData.value.rates[model]) {
      formData.value.rates[model] = {
        input: 1,
        output: 1,
        cacheCreate: 1,
        cacheRead: 1
      }
    }
    formData.value.rates[model][column] = rate
  }
  showToast(`已将所有模型的${column}倍率设置为${rate}`, 'success')
}

// 添加自定义模型
const addCustomModel = () => {
  const modelName = newCustomModel.value.trim()
  if (!modelName) {
    showToast('请输入模型名称', 'error')
    return
  }

  if (defaultModels.value.includes(modelName) || formData.value.customModels.includes(modelName)) {
    showToast('该模型已存在', 'error')
    return
  }

  formData.value.customModels.push(modelName)
  // 初始化新模型的倍率
  formData.value.rates[modelName] = {
    input: 1,
    output: 1,
    cacheCreate: 1,
    cacheRead: 1
  }
  newCustomModel.value = ''
  showToast(`已添加自定义模型: ${modelName}`, 'success')
}

// 移除自定义模型
const removeCustomModel = (index) => {
  const model = formData.value.customModels[index]
  formData.value.customModels.splice(index, 1)
  delete formData.value.rates[model]
  showToast(`已移除自定义模型: ${model}`, 'info')
}

// 处理保存
const handleSave = () => {
  if (!formData.value.name) {
    showToast('请输入模板名称', 'error')
    return
  }

  emit('save', formData.value)
}

// 处理关闭
const handleClose = () => {
  emit('close')
}

// 监听属性变化
watch(
  () => props.template,
  () => {
    initFormData()
  },
  { immediate: true }
)

// 生命周期
onMounted(() => {
  initFormData()
})
</script>
