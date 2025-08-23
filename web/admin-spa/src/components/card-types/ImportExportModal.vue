<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
  >
    <div
      class="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800"
    >
      <div class="p-6">
        <!-- 标题栏 -->
        <div class="mb-6 flex items-center justify-between">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">卡类型导入导出</h2>
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

        <!-- 标签页 -->
        <div class="mb-6">
          <div class="flex space-x-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-700">
            <button
              :class="[
                'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                activeTab === 'export'
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-800 dark:text-blue-400'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              ]"
              @click="activeTab = 'export'"
            >
              导出配置
            </button>
            <button
              :class="[
                'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                activeTab === 'import'
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-800 dark:text-blue-400'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              ]"
              @click="activeTab = 'import'"
            >
              导入配置
            </button>
          </div>
        </div>

        <!-- 导出标签页 -->
        <div v-if="activeTab === 'export'" class="space-y-6">
          <!-- 导出选项 -->
          <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
            <h3 class="mb-4 text-lg font-medium text-gray-900 dark:text-white">导出选项</h3>

            <!-- 导出范围 -->
            <div class="mb-4">
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                导出范围
              </label>
              <div class="space-y-2">
                <label class="flex items-center">
                  <input v-model="exportOptions.scope" class="mr-2" type="radio" value="all" />
                  <span class="text-sm text-gray-700 dark:text-gray-300">导出所有卡类型</span>
                </label>
                <label class="flex items-center">
                  <input v-model="exportOptions.scope" class="mr-2" type="radio" value="active" />
                  <span class="text-sm text-gray-700 dark:text-gray-300">仅导出启用的卡类型</span>
                </label>
                <label class="flex items-center">
                  <input v-model="exportOptions.scope" class="mr-2" type="radio" value="custom" />
                  <span class="text-sm text-gray-700 dark:text-gray-300">仅导出自定义卡类型</span>
                </label>
                <label class="flex items-center">
                  <input v-model="exportOptions.scope" class="mr-2" type="radio" value="selected" />
                  <span class="text-sm text-gray-700 dark:text-gray-300"
                    >导出选中的卡类型 ({{ selectedCardTypes.length }})</span
                  >
                </label>
              </div>
            </div>

            <!-- 导出格式 -->
            <div class="mb-4">
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                导出格式
              </label>
              <select
                v-model="exportOptions.format"
                class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="json">JSON格式</option>
                <option value="csv">CSV格式</option>
                <option value="yaml">YAML格式</option>
              </select>
            </div>

            <!-- 包含字段 -->
            <div class="mb-4">
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                包含字段
              </label>
              <div class="grid grid-cols-2 gap-2 md:grid-cols-3">
                <label v-for="field in exportFields" :key="field.key" class="flex items-center">
                  <input
                    v-model="exportOptions.fields"
                    class="mr-2"
                    type="checkbox"
                    :value="field.key"
                  />
                  <span class="text-sm text-gray-700 dark:text-gray-300">{{ field.label }}</span>
                </label>
              </div>
            </div>

            <!-- 导出按钮 -->
            <div class="flex gap-3">
              <button
                class="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600 disabled:bg-blue-300"
                :disabled="exporting || exportOptions.fields.length === 0"
                @click="exportCardTypes"
              >
                <svg
                  v-if="exporting"
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
                <svg v-else class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                  />
                </svg>
                {{ exporting ? '导出中...' : '导出' }}
              </button>

              <button
                class="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                :disabled="exporting || exportOptions.fields.length === 0"
                @click="previewExport"
              >
                预览
              </button>
            </div>
          </div>

          <!-- 预览区域 -->
          <div
            v-if="previewData"
            class="rounded-lg border border-gray-200 p-4 dark:border-gray-600"
          >
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">导出预览</h3>
              <span class="text-sm text-gray-500 dark:text-gray-400">
                {{ exportOptions.format.toUpperCase() }} 格式，{{
                  previewData.split('\n').length - 1
                }}
                条记录
              </span>
            </div>
            <pre
              class="max-h-64 overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300"
              >{{ previewData }}</pre
            >
          </div>
        </div>

        <!-- 导入标签页 -->
        <div v-if="activeTab === 'import'" class="space-y-6">
          <!-- 文件上传 -->
          <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
            <h3 class="mb-4 text-lg font-medium text-gray-900 dark:text-white">选择导入文件</h3>

            <div class="space-y-4">
              <!-- 拖拽上传区域 -->
              <div
                :class="[
                  'rounded-lg border-2 border-dashed p-6 text-center transition-colors',
                  isDragging
                    ? 'border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600'
                ]"
                @dragenter.prevent
                @dragover.prevent
                @drop.prevent="handleFileDrop"
              >
                <svg
                  class="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                  />
                </svg>
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  拖拽文件到此处或
                  <button
                    class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    @click="$refs.fileInput.click()"
                  >
                    点击选择文件
                  </button>
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400">支持 JSON、CSV、YAML 格式</p>
                <input
                  ref="fileInput"
                  accept=".json,.csv,.yaml,.yml"
                  class="hidden"
                  type="file"
                  @change="handleFileSelect"
                />
              </div>

              <!-- 选中的文件信息 -->
              <div v-if="importFile" class="rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="font-medium text-gray-900 dark:text-white">{{ importFile.name }}</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      {{ formatFileSize(importFile.size) }} • {{ getFileFormat(importFile.name) }}
                    </p>
                  </div>
                  <button
                    class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                    @click="clearImportFile"
                  >
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

          <!-- 导入选项 -->
          <div v-if="importFile" class="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
            <h3 class="mb-4 text-lg font-medium text-gray-900 dark:text-white">导入选项</h3>

            <div class="space-y-4">
              <!-- 导入模式 -->
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  导入模式
                </label>
                <div class="space-y-2">
                  <label class="flex items-center">
                    <input v-model="importOptions.mode" class="mr-2" type="radio" value="create" />
                    <span class="text-sm text-gray-700 dark:text-gray-300">仅创建新卡类型</span>
                  </label>
                  <label class="flex items-center">
                    <input v-model="importOptions.mode" class="mr-2" type="radio" value="update" />
                    <span class="text-sm text-gray-700 dark:text-gray-300">更新现有卡类型</span>
                  </label>
                  <label class="flex items-center">
                    <input v-model="importOptions.mode" class="mr-2" type="radio" value="upsert" />
                    <span class="text-sm text-gray-700 dark:text-gray-300">创建或更新（推荐）</span>
                  </label>
                </div>
              </div>

              <!-- 冲突处理 -->
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  名称冲突处理
                </label>
                <select
                  v-model="importOptions.conflictResolution"
                  class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="skip">跳过冲突项</option>
                  <option value="rename">自动重命名</option>
                  <option value="overwrite">覆盖现有项</option>
                </select>
              </div>

              <!-- 验证选项 -->
              <div class="flex items-center">
                <input
                  id="validateOnly"
                  v-model="importOptions.validateOnly"
                  class="mr-2"
                  type="checkbox"
                />
                <label class="text-sm text-gray-700 dark:text-gray-300" for="validateOnly">
                  仅验证不导入（预览模式）
                </label>
              </div>
            </div>

            <!-- 导入按钮 -->
            <div class="mt-4 flex gap-3">
              <button
                class="flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-white transition-colors hover:bg-green-600 disabled:bg-green-300"
                :disabled="importing"
                @click="importCardTypes"
              >
                <svg
                  v-if="importing"
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
                <svg v-else class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 12l2 2 4-4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                  />
                </svg>
                {{ importing ? '导入中...' : importOptions.validateOnly ? '验证文件' : '开始导入' }}
              </button>
            </div>
          </div>

          <!-- 导入结果 -->
          <div
            v-if="importResult"
            class="rounded-lg border p-4"
            :class="[
              importResult.success
                ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
            ]"
          >
            <h3
              class="mb-3 text-lg font-medium"
              :class="[
                importResult.success
                  ? 'text-green-900 dark:text-green-100'
                  : 'text-red-900 dark:text-red-100'
              ]"
            >
              {{ importResult.success ? '导入成功' : '导入失败' }}
            </h3>

            <div
              class="text-sm"
              :class="[
                importResult.success
                  ? 'text-green-800 dark:text-green-200'
                  : 'text-red-800 dark:text-red-200'
              ]"
            >
              <div v-if="importResult.stats" class="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div>总计: {{ importResult.stats.total }}</div>
                <div>成功: {{ importResult.stats.success }}</div>
                <div>跳过: {{ importResult.stats.skipped }}</div>
                <div>错误: {{ importResult.stats.errors }}</div>
              </div>

              <div v-if="importResult.errors?.length" class="mt-3">
                <p class="font-medium">错误详情:</p>
                <ul class="mt-1 list-inside list-disc space-y-1">
                  <li v-for="error in importResult.errors.slice(0, 5)" :key="error">
                    {{ error }}
                  </li>
                  <li v-if="importResult.errors.length > 5" class="text-xs opacity-75">
                    还有 {{ importResult.errors.length - 5 }} 个错误...
                  </li>
                </ul>
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
            关闭
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useToast } from '@/utils/toast'

const props = defineProps({
  visible: Boolean,
  selectedCardTypes: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close', 'success'])

const toast = useToast()

// 响应式数据
const activeTab = ref('export')
const exporting = ref(false)
const importing = ref(false)
const isDragging = ref(false)
const importFile = ref(null)
const previewData = ref('')
const importResult = ref(null)

const exportOptions = reactive({
  scope: 'all',
  format: 'json',
  fields: [
    'name',
    'description',
    'category',
    'duration',
    'totalTokens',
    'dailyTokens',
    'priceUsd',
    'active'
  ]
})

const importOptions = reactive({
  mode: 'upsert',
  conflictResolution: 'rename',
  validateOnly: false
})

const exportFields = [
  { key: 'name', label: '名称' },
  { key: 'description', label: '描述' },
  { key: 'category', label: '分类' },
  { key: 'duration', label: '有效期' },
  { key: 'totalTokens', label: '总Token' },
  { key: 'dailyTokens', label: '每日Token' },
  { key: 'priceUsd', label: '价格' },
  { key: 'active', label: '状态' },
  { key: 'defaultTags', label: '默认标签' },
  { key: 'notes', label: '备注' },
  { key: 'createdAt', label: '创建时间' },
  { key: 'updatedAt', label: '更新时间' }
]

// 方法
async function exportCardTypes() {
  try {
    exporting.value = true

    const params = new URLSearchParams({
      scope: exportOptions.scope,
      format: exportOptions.format,
      fields: exportOptions.fields.join(',')
    })

    if (exportOptions.scope === 'selected') {
      params.append('ids', props.selectedCardTypes.map((ct) => ct.id).join(','))
    }

    const response = await fetch(`/admin/card-types/export?${params}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      }
    })

    if (!response.ok) throw new Error('导出失败')

    // 下载文件
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `card-types-${Date.now()}.${exportOptions.format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)

    toast.success('导出成功')
  } catch (error) {
    console.error('导出失败:', error)
    toast.error('导出失败: ' + error.message)
  } finally {
    exporting.value = false
  }
}

async function previewExport() {
  try {
    const params = new URLSearchParams({
      scope: exportOptions.scope,
      format: exportOptions.format,
      fields: exportOptions.fields.join(','),
      preview: 'true',
      limit: '5'
    })

    if (exportOptions.scope === 'selected') {
      params.append('ids', props.selectedCardTypes.map((ct) => ct.id).join(','))
    }

    const response = await fetch(`/admin/card-types/export?${params}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      }
    })

    if (!response.ok) throw new Error('预览失败')

    previewData.value = await response.text()
  } catch (error) {
    console.error('预览失败:', error)
    toast.error('预览失败: ' + error.message)
  }
}

function handleFileDrop(event) {
  isDragging.value = false
  const files = event.dataTransfer.files
  if (files.length > 0) {
    importFile.value = files[0]
    importResult.value = null
  }
}

function handleFileSelect(event) {
  const files = event.target.files
  if (files.length > 0) {
    importFile.value = files[0]
    importResult.value = null
  }
}

function clearImportFile() {
  importFile.value = null
  importResult.value = null
}

async function importCardTypes() {
  if (!importFile.value) return

  try {
    importing.value = true

    const formData = new FormData()
    formData.append('file', importFile.value)
    formData.append('mode', importOptions.mode)
    formData.append('conflictResolution', importOptions.conflictResolution)
    formData.append('validateOnly', importOptions.validateOnly.toString())

    const response = await fetch('/admin/card-types/import', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      },
      body: formData
    })

    if (!response.ok) throw new Error('导入失败')

    const result = await response.json()
    importResult.value = result

    if (result.success) {
      toast.success(importOptions.validateOnly ? '文件验证成功' : '导入成功')
      if (!importOptions.validateOnly) {
        emit('success')
      }
    } else {
      toast.error('导入失败: ' + (result.message || '未知错误'))
    }
  } catch (error) {
    console.error('导入失败:', error)
    toast.error('导入失败: ' + error.message)
    importResult.value = {
      success: false,
      message: error.message
    }
  } finally {
    importing.value = false
  }
}

// 工具函数
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function getFileFormat(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  return ext.toUpperCase()
}

// 生命周期
onMounted(() => {
  // 重置状态
  previewData.value = ''
  importResult.value = null
})
</script>
