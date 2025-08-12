<template>
  <div class="space-y-6">
    <!-- 操作栏 -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-medium text-gray-900">账户分组倍率模板关联</h2>
        <p class="mt-1 text-sm text-gray-600">为每个账户分组配置倍率模板，用于分组级计费</p>
      </div>
      <button
        class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        @click="refreshData"
      >
        <i class="fas fa-sync-alt mr-2"></i>
        刷新数据
      </button>
    </div>

    <!-- 分组类型说明 -->
    <div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div class="flex">
        <i class="fas fa-info-circle mr-3 mt-0.5 text-blue-400"></i>
        <div class="text-sm">
          <h3 class="mb-1 font-medium text-blue-800">关于账户分组</h3>
          <p class="text-blue-700">
            系统中的账户按分组进行组织。每个分组可以关联一个倍率模板，用于该分组的计费计算。
            包括显式分组（用户创建的分组）和隐式分组（系统默认的共享/专属账户类型）。
          </p>
        </div>
      </div>
    </div>

    <!-- 账户分组列表 -->
    <div class="rounded-lg bg-white shadow">
      <div v-if="loading" class="p-8 text-center">
        <i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
        <p class="mt-4 text-gray-500">加载中...</p>
      </div>

      <div v-else-if="allGroups.length === 0" class="p-8 text-center">
        <i class="fas fa-layer-group text-3xl text-gray-300"></i>
        <p class="mt-4 text-gray-500">暂无账户分组</p>
        <p class="mt-2 text-xs text-gray-400">请先在账户管理页面创建分组</p>
      </div>

      <div v-else class="overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th
                class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                分组名称
              </th>
              <th
                class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                分组类型
              </th>
              <th
                class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                平台
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
            <tr v-for="group in allGroups" :key="group.id">
              <td class="whitespace-nowrap px-6 py-4">
                <div class="flex items-center">
                  <div class="flex-shrink-0">
                    <i class="text-lg" :class="getGroupIcon(group)"></i>
                  </div>
                  <div class="ml-3">
                    <div class="text-sm font-medium text-gray-900">{{ group.name }}</div>
                    <div v-if="!group.isSystemGroup" class="text-xs text-gray-500">
                      ID: {{ group.id.slice(0, 8) }}...
                    </div>
                  </div>
                </div>
              </td>
              <td class="px-6 py-4">
                <span :class="getGroupTypeBadge(group)">
                  {{ getGroupTypeText(group) }}
                </span>
              </td>
              <td class="px-6 py-4">
                <div class="text-sm text-gray-900">
                  {{ group.platform || '全平台' }}
                </div>
              </td>
              <td class="px-6 py-4">
                <div
                  v-if="group.rateTemplateId && getRateTemplateName(group.rateTemplateId)"
                  class="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800"
                >
                  <i class="fas fa-check-circle mr-1"></i>
                  {{ getRateTemplateName(group.rateTemplateId) }}
                </div>
                <div
                  v-else
                  class="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800"
                >
                  <i class="fas fa-minus-circle mr-1"></i>
                  使用默认倍率
                </div>
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                <button
                  class="text-blue-600 transition-colors hover:text-blue-900"
                  :disabled="group.isSystemGroup && group.readonly"
                  @click="editAssociation(group)"
                >
                  {{ group.isSystemGroup && group.readonly ? '系统分组' : '配置模板' }}
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
      :entity-type="'account-group'"
      :templates="rateTemplates"
      @close="closeAssociationDialog"
      @save="handleAssociationSave"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { showToast } from '@/utils/toast'
import { apiClient } from '@/config/api'
import AssociationDialog from './AssociationDialog.vue'

// 响应式数据
const loading = ref(false)
const showAssociationDialog = ref(false)
const editingEntity = ref(null)

// 数据存储
const accountGroups = ref([])
const rateTemplates = ref([])

// 系统默认分组（虚拟分组，代表账户类型）
const systemGroups = ref([
  {
    id: 'shared-accounts',
    name: '共享账户池',
    isSystemGroup: true,
    accountType: 'shared',
    platform: '全平台',
    description: '所有共享类型的账户',
    rateTemplateId: null, // 可以关联倍率模板
    readonly: false // 可以配置倍率模板
  },
  {
    id: 'dedicated-accounts',
    name: '专属账户池',
    isSystemGroup: true,
    accountType: 'dedicated',
    platform: '全平台',
    description: '所有专属类型的账户',
    rateTemplateId: null, // 可以关联倍率模板
    readonly: false // 可以配置倍率模板
  }
])

// 计算属性 - 合并真实分组和系统分组
const allGroups = computed(() => {
  return [
    ...systemGroups.value.map((group) => ({
      ...group,
      rateTemplateId: group.rateTemplateId // 系统分组也可以有倍率模板
    })),
    ...accountGroups.value.map((group) => ({
      ...group,
      isSystemGroup: false
    }))
  ]
})

const getRateTemplateName = (templateId) => {
  if (!templateId) return null
  const template = rateTemplates.value.find((t) => t.id === templateId)
  return template ? template.name : null
}

// 获取分组图标
const getGroupIcon = (group) => {
  if (group.isSystemGroup) {
    return group.accountType === 'shared'
      ? 'fas fa-users text-blue-500'
      : 'fas fa-user-tag text-green-500'
  }
  return `fas fa-layer-group text-purple-500`
}

// 获取分组类型文本
const getGroupTypeText = (group) => {
  if (group.isSystemGroup) {
    return group.accountType === 'shared' ? '系统分组 (共享)' : '系统分组 (专属)'
  }
  return '用户分组'
}

// 获取分组类型样式
const getGroupTypeBadge = (group) => {
  if (group.isSystemGroup) {
    const baseClass = 'inline-flex rounded-full px-2 text-xs font-semibold leading-5'
    return group.accountType === 'shared'
      ? `${baseClass} bg-blue-100 text-blue-800`
      : `${baseClass} bg-green-100 text-green-800`
  }
  return 'inline-flex rounded-full bg-purple-100 px-2 text-xs font-semibold leading-5 text-purple-800'
}

// 获取所有数据
const fetchAllData = async () => {
  loading.value = true
  try {
    // 并行获取数据 (移除不存在的 /admin/accounts 路由)
    const [groupsRes, templatesRes] = await Promise.all([
      apiClient.get('/admin/account-groups'),
      apiClient.get('/admin/rate-templates')
    ])

    // 处理分组数据
    if (groupsRes.success) {
      accountGroups.value = (groupsRes.data || []).map((group) => ({
        ...group,
        isSystemGroup: false
      }))
    }

    // 处理倍率模板数据
    if (templatesRes.success) {
      rateTemplates.value = templatesRes.data || []
    }

    // 从localStorage或其他地方恢复系统分组的倍率模板配置
    await loadSystemGroupsConfig()
  } catch (error) {
    showToast('获取数据失败', 'error')
    console.error('Failed to fetch data:', error)
  } finally {
    loading.value = false
  }
}

// 加载系统分组配置
const loadSystemGroupsConfig = async () => {
  try {
    // 从服务端获取系统分组的倍率模板配置
    for (const group of systemGroups.value) {
      try {
        const response = await apiClient.get(
          `/admin/system-groups/${group.accountType}/rate-template`
        )
        if (response.success && response.data.templateId) {
          group.rateTemplateId = response.data.templateId
        }
      } catch (error) {
        console.warn(`Failed to load rate template for ${group.accountType}:`, error)

        // 如果服务端获取失败，尝试从localStorage获取（兼容旧数据）
        const savedConfig = localStorage.getItem('systemGroupsRateConfig')
        if (savedConfig) {
          const config = JSON.parse(savedConfig)
          if (config[group.id]) {
            group.rateTemplateId = config[group.id]
          }
        }
      }
    }
  } catch (error) {
    console.warn('Failed to load system groups config:', error)
  }
}

// 刷新数据
const refreshData = async () => {
  await fetchAllData()
  showToast('数据刷新成功', 'success')
}

// 编辑关联
const editAssociation = (group) => {
  editingEntity.value = group
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
    const group = editingEntity.value

    if (group.isSystemGroup) {
      // 系统分组：调用API保存到服务器
      const endpoint = `/admin/system-groups/${group.accountType}/rate-template`
      const payload = { templateId: templateId || null }

      const response = await apiClient.put(endpoint, payload)

      if (response.success) {
        showToast('系统分组倍率模板配置成功', 'success')
        // 更新本地数据
        const targetGroup = systemGroups.value.find((g) => g.id === group.id)
        if (targetGroup) {
          targetGroup.rateTemplateId = templateId || null
        }
      } else {
        showToast(response.error || '配置失败', 'error')
        return
      }
    } else {
      // 用户分组：调用API保存
      const endpoint = `/admin/account-groups/${group.id}`
      const payload = { rateTemplateId: templateId || null }

      const response = await apiClient.put(endpoint, payload)

      if (response.success) {
        showToast('分组倍率模板配置成功', 'success')
        // 更新本地数据
        const localGroup = accountGroups.value.find((g) => g.id === group.id)
        if (localGroup) {
          localGroup.rateTemplateId = templateId || null
        }
      } else {
        showToast(response.error || '配置失败', 'error')
        return
      }
    }

    closeAssociationDialog()
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
