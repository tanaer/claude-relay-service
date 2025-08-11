<template>
  <div class="p-6">
    <div class="mx-auto max-w-7xl">
      <!-- 页面标题 -->
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-gray-900">计费倍率管理</h1>
        <p class="mt-2 text-sm text-gray-600">管理不同模型的计费倍率模板，用于灵活定价</p>
      </div>

      <!-- 操作栏 -->
      <div class="mb-6 flex items-center justify-between">
        <div class="flex gap-3">
          <button
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            @click="showCreateDialog = true"
          >
            <i class="fas fa-plus mr-2"></i>
            创建模板
          </button>
          <button
            class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            @click="refreshTemplates"
          >
            <i class="fas fa-sync-alt mr-2"></i>
            刷新
          </button>
        </div>
      </div>

      <!-- 模板列表 -->
      <div class="rounded-lg bg-white shadow">
        <div v-if="loading" class="p-12 text-center">
          <i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
          <p class="mt-4 text-gray-500">加载中...</p>
        </div>

        <div v-else-if="templates.length === 0" class="p-12 text-center">
          <i class="fas fa-file-invoice text-4xl text-gray-300"></i>
          <p class="mt-4 text-gray-500">暂无倍率模板</p>
          <button
            class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            @click="showCreateDialog = true"
          >
            创建第一个模板
          </button>
        </div>

        <div v-else class="overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  模板名称
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  描述
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  状态
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  创建时间
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  操作
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white">
              <tr v-for="template in templates" :key="template.id">
                <td class="whitespace-nowrap px-6 py-4">
                  <div class="flex items-center">
                    <div>
                      <div class="text-sm font-medium text-gray-900">{{ template.name }}</div>
                      <div class="text-xs text-gray-500">ID: {{ template.id.slice(0, 8) }}...</div>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <div class="text-sm text-gray-900">{{ template.description || '-' }}</div>
                </td>
                <td class="whitespace-nowrap px-6 py-4">
                  <span
                    v-if="template.isDefault"
                    class="inline-flex rounded-full bg-green-100 px-2 text-xs font-semibold leading-5 text-green-800"
                  >
                    默认模板
                  </span>
                  <span
                    v-else
                    class="inline-flex rounded-full bg-gray-100 px-2 text-xs font-semibold leading-5 text-gray-800"
                  >
                    普通模板
                  </span>
                </td>
                <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {{ formatDate(template.createdAt) }}
                </td>
                <td class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                  <button class="text-blue-600 hover:text-blue-900" @click="editTemplate(template)">
                    编辑
                  </button>
                  <button
                    v-if="!template.isDefault"
                    class="ml-3 text-green-600 hover:text-green-900"
                    @click="setAsDefault(template)"
                  >
                    设为默认
                  </button>
                  <button
                    v-if="!template.isDefault"
                    class="ml-3 text-red-600 hover:text-red-900"
                    @click="deleteTemplate(template)"
                  >
                    删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 创建/编辑模板对话框 -->
    <RateTemplateDialog
      v-if="showCreateDialog || editingTemplate"
      :template="editingTemplate"
      @close="closeDialog"
      @save="handleSave"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { showToast } from '@/utils/toast'
import { apiClient } from '@/config/api'
import RateTemplateDialog from '@/components/rate-templates/RateTemplateDialog.vue'

// 响应式数据
const loading = ref(false)
const templates = ref([])
const showCreateDialog = ref(false)
const editingTemplate = ref(null)

// 获取模板列表
const fetchTemplates = async () => {
  loading.value = true
  try {
    const response = await apiClient.get('/admin/rate-templates')
    console.log('fetchTemplates response:', response)
    if (response.success) {
      templates.value = response.data
      console.log('Templates loaded:', templates.value)
    } else {
      showToast('获取倍率模板失败', 'error')
    }
  } catch (error) {
    showToast('获取倍率模板失败', 'error')
    console.error('Failed to fetch templates:', error)
  } finally {
    loading.value = false
  }
}

// 刷新列表
const refreshTemplates = () => {
  fetchTemplates()
  showToast('刷新成功', 'success')
}

// 编辑模板
const editTemplate = (template) => {
  console.log('editTemplate called with:', template)
  editingTemplate.value = template
  showCreateDialog.value = false // 确保创建对话框关闭
  console.log('editingTemplate.value:', editingTemplate.value)
}

// 设为默认模板
const setAsDefault = async (template) => {
  if (!confirm(`确定要将"${template.name}"设为默认模板吗？`)) {
    return
  }

  try {
    const response = await apiClient.post(`/admin/rate-templates/${template.id}/set-default`)
    if (response.success) {
      showToast('设置默认模板成功', 'success')
      fetchTemplates()
    } else {
      showToast(response.error || '设置默认模板失败', 'error')
    }
  } catch (error) {
    showToast('设置默认模板失败', 'error')
    console.error('Failed to set default template:', error)
  }
}

// 删除模板
const deleteTemplate = async (template) => {
  if (!confirm(`确定要删除模板"${template.name}"吗？此操作不可恢复。`)) {
    return
  }

  try {
    const response = await apiClient.delete(`/admin/rate-templates/${template.id}`)
    if (response.success) {
      showToast('删除成功', 'success')
      fetchTemplates()
    } else {
      showToast(response.error || '删除失败', 'error')
    }
  } catch (error) {
    showToast('删除失败', 'error')
    console.error('Failed to delete template:', error)
  }
}

// 关闭对话框
const closeDialog = () => {
  showCreateDialog.value = false
  editingTemplate.value = null
  console.log('Dialog closed, editingTemplate reset to:', editingTemplate.value)
}

// 保存模板
const handleSave = async (data) => {
  try {
    if (editingTemplate.value) {
      // 更新模板
      const response = await apiClient.put(
        `/admin/rate-templates/${editingTemplate.value.id}`,
        data
      )
      if (response.success) {
        showToast('更新成功', 'success')
        closeDialog()
        fetchTemplates()
      } else {
        showToast(response.error || '更新失败', 'error')
      }
    } else {
      // 创建模板
      const response = await apiClient.post('/admin/rate-templates', data)
      if (response.success) {
        showToast('创建成功', 'success')
        closeDialog()
        fetchTemplates()
      } else {
        showToast(response.error || '创建失败', 'error')
      }
    }
  } catch (error) {
    showToast('操作失败', 'error')
    console.error('Failed to save template:', error)
  }
}

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai'
  })
}

// 生命周期
onMounted(() => {
  fetchTemplates()
})

// 监听 editingTemplate 变化
watch(editingTemplate, (newValue) => {
  console.log('editingTemplate changed:', newValue)
  console.log('Should show dialog:', !!(showCreateDialog.value || editingTemplate.value))
})

// 监听 showCreateDialog 变化
watch(showCreateDialog, (newValue) => {
  console.log('showCreateDialog changed:', newValue)
  console.log('Should show dialog:', !!(showCreateDialog.value || editingTemplate.value))
})
</script>
