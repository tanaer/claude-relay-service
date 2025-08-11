<template>
  <div class="space-y-6">
    <!-- 操作栏 -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-medium text-gray-900">实体关联管理</h2>
        <p class="mt-1 text-sm text-gray-600">为分组、专属账户和共享账户配置倍率模板</p>
      </div>
      <button
        class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        @click="refreshData"
      >
        <i class="fas fa-sync-alt mr-2"></i>
        刷新数据
      </button>
    </div>

    <!-- 分组标签页 -->
    <div>
      <nav aria-label="Entity Types" class="flex space-x-8">
        <button
          v-for="entityType in entityTypes"
          :key="entityType.key"
          :class="[
            'whitespace-nowrap border-b-2 px-1 py-2 text-sm font-medium',
            activeEntityType === entityType.key
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
          ]"
          @click="activeEntityType = entityType.key"
        >
          {{ entityType.name }}
          <span class="ml-2 text-xs"> ({{ getEntityCount(entityType.key) }}) </span>
        </button>
      </nav>
    </div>

    <!-- 实体列表 -->
    <div class="rounded-lg bg-white shadow">
      <div v-if="loading" class="p-8 text-center">
        <i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
        <p class="mt-4 text-gray-500">加载中...</p>
      </div>

      <div v-else-if="getCurrentEntities().length === 0" class="p-8 text-center">
        <i class="fas fa-folder-open text-3xl text-gray-300"></i>
        <p class="mt-4 text-gray-500">暂无{{ getCurrentEntityTypeName() }}</p>
      </div>

      <div v-else class="overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th
                class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                名称
              </th>
              <th
                class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                类型/平台
              </th>
              <th
                class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                当前倍率模板
              </th>
              <th
                class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                操作
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 bg-white">
            <tr v-for="entity in getCurrentEntities()" :key="entity.id">
              <td class="whitespace-nowrap px-6 py-4">
                <div class="flex items-center">
                  <div>
                    <div class="text-sm font-medium text-gray-900">{{ entity.name }}</div>
                    <div class="text-xs text-gray-500">ID: {{ entity.id.slice(0, 8) }}...</div>
                  </div>
                </div>
              </td>
              <td class="px-6 py-4">
                <div class="text-sm text-gray-900">
                  <span v-if="entity.platform">{{ entity.platform }}</span>
                  <span v-else-if="entity.accountType">{{
                    getAccountTypeText(entity.accountType)
                  }}</span>
                  <span v-else>-</span>
                </div>
              </td>
              <td class="px-6 py-4">
                <div
                  v-if="entity.rateTemplateId && getRateTemplateName(entity.rateTemplateId)"
                  class="text-sm text-gray-900"
                >
                  {{ getRateTemplateName(entity.rateTemplateId) }}
                </div>
                <div v-else class="text-sm text-gray-500">使用默认倍率</div>
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                <button class="text-blue-600 hover:text-blue-900" @click="editAssociation(entity)">
                  配置模板
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 关联配置对话框 -->
    <AssociationDialog
      v-if="showAssociationDialog"
      :entity="editingEntity"
      :entity-type="activeEntityType"
      :templates="rateTemplates"
      @close="closeAssociationDialog"
      @save="handleAssociationSave"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showToast } from '@/utils/toast'
import { apiClient } from '@/config/api'
import AssociationDialog from './AssociationDialog.vue'

// 响应式数据
const loading = ref(false)
const activeEntityType = ref('groups')
const showAssociationDialog = ref(false)
const editingEntity = ref(null)

// 数据存储
const groups = ref([])
const sharedAccounts = ref([])
const dedicatedAccounts = ref([])
const rateTemplates = ref([])

// 实体类型配置
const entityTypes = [
  { key: 'groups', name: '账户分组' },
  { key: 'shared', name: '共享账户' },
  { key: 'dedicated', name: '专属账户' }
]

// 计算属性
const getCurrentEntities = () => {
  switch (activeEntityType.value) {
    case 'groups':
      return groups.value
    case 'shared':
      return sharedAccounts.value
    case 'dedicated':
      return dedicatedAccounts.value
    default:
      return []
  }
}

const getCurrentEntityTypeName = () => {
  const entityType = entityTypes.find((t) => t.key === activeEntityType.value)
  return entityType ? entityType.name : '实体'
}

const getEntityCount = (entityType) => {
  switch (entityType) {
    case 'groups':
      return groups.value.length
    case 'shared':
      return sharedAccounts.value.length
    case 'dedicated':
      return dedicatedAccounts.value.length
    default:
      return 0
  }
}

const getRateTemplateName = (templateId) => {
  if (!templateId) return null
  const template = rateTemplates.value.find((t) => t.id === templateId)
  return template ? template.name : null
}

const getAccountTypeText = (accountType) => {
  const typeMap = {
    shared: '共享账户',
    dedicated: '专属账户',
    group: '分组账户'
  }
  return typeMap[accountType] || accountType
}

// 获取所有数据
const fetchAllData = async () => {
  loading.value = true
  try {
    // 并行获取所有数据
    const [groupsRes, accountsRes, templatesRes] = await Promise.all([
      apiClient.get('/admin/account-groups'),
      apiClient.get('/admin/accounts'),
      apiClient.get('/admin/rate-templates')
    ])

    // 处理分组数据
    if (groupsRes.success) {
      groups.value = groupsRes.data || []
    }

    // 处理账户数据并分类
    if (accountsRes.success) {
      const accounts = accountsRes.data || []
      sharedAccounts.value = accounts.filter((acc) => acc.accountType === 'shared')
      dedicatedAccounts.value = accounts.filter((acc) => acc.accountType === 'dedicated')
    }

    // 处理倍率模板数据
    if (templatesRes.success) {
      rateTemplates.value = templatesRes.data || []
    }
  } catch (error) {
    showToast('获取数据失败', 'error')
    console.error('Failed to fetch data:', error)
  } finally {
    loading.value = false
  }
}

// 刷新数据
const refreshData = async () => {
  await fetchAllData()
  showToast('数据刷新成功', 'success')
}

// 编辑关联
const editAssociation = (entity) => {
  editingEntity.value = entity
  showAssociationDialog.value = true
}

// 关闭关联对话框
const closeAssociationDialog = () => {
  showAssociationDialog.value = false
  editingEntity.value = null
}

// 保存关联
const handleAssociationSave = async (data) => {
  try {
    const { templateId } = data
    const entity = editingEntity.value
    const entityType = activeEntityType.value

    // 根据实体类型调用不同的API
    let endpoint = ''
    let payload = { rateTemplateId: templateId || null }

    switch (entityType) {
      case 'groups':
        endpoint = `/admin/account-groups/${entity.id}`
        break
      case 'shared':
      case 'dedicated':
        if (entity.platform === 'claude' || entity.platform === 'claude-console') {
          endpoint = `/admin/claude-accounts/${entity.id}`
        } else if (entity.platform === 'gemini') {
          endpoint = `/admin/gemini-accounts/${entity.id}`
        } else {
          throw new Error('不支持的账户平台')
        }
        break
      default:
        throw new Error('不支持的实体类型')
    }

    const response = await apiClient.put(endpoint, payload)

    if (response.success) {
      showToast('倍率模板配置成功', 'success')
      closeAssociationDialog()
      await fetchAllData() // 重新获取数据以更新显示
    } else {
      showToast(response.error || '配置失败', 'error')
    }
  } catch (error) {
    showToast('配置失败', 'error')
    console.error('Failed to save association:', error)
  }
}

// 生命周期
onMounted(() => {
  fetchAllData()
})
</script>
