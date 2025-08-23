<template>
  <div class="p-6">
    <!-- 页面标�� -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">卡类型管理</h1>
        <p class="mt-1 text-gray-600 dark:text-gray-400">
          管理系统中的所有卡类型，包括内置类型和自定义类型
        </p>
      </div>
      <div class="flex gap-3">
        <!-- 高级功能下拉菜单 -->
        <div ref="advancedMenuRef" class="relative">
          <button
            class="flex items-center gap-2 rounded-lg bg-gray-500 px-4 py-2 text-white transition-colors hover:bg-gray-600"
            @click="showAdvancedMenu = !showAdvancedMenu"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
              <path
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
            高级功能
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M19 9l-7 7-7-7"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
          </button>

          <!-- 下拉菜单 -->
          <div
            v-if="showAdvancedMenu"
            class="absolute right-0 top-full z-10 mt-2 w-56 rounded-lg border border-gray-200 bg-white py-2 shadow-lg dark:border-gray-600 dark:bg-gray-800"
          >
            <button
              class="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
              :disabled="selectedCardTypes.length === 0"
              @click="openBatchEdit"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
              批量编辑 ({{ selectedCardTypes.length }})
            </button>

            <button
              class="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
              @click="showImportExportModal = true"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
              导入导出
            </button>

            <button
              class="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
              @click="showTemplateAssociationModal = true"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
              模版关联管理
            </button>

            <div class="my-1 h-px bg-gray-200 dark:bg-gray-600"></div>

            <button
              class="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
              @click="selectAllCardTypes"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
              全选/取消全选
            </button>
          </div>
        </div>

        <button
          class="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600"
          @click="showCreateModal = true"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
          创建卡类型
        </button>
      </div>
    </div>

    <!-- 筛选和搜索栏 -->
    <div
      class="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div class="flex flex-wrap gap-4">
        <!-- 分类筛选 -->
        <div class="flex items-center gap-2">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300">分类:</label>
          <select
            v-model="filters.category"
            class="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            @change="loadCardTypes"
          >
            <option value="">全部</option>
            <option value="daily">每日卡</option>
            <option value="monthly">月卡</option>
            <option value="unlimited">不限时</option>
          </select>
        </div>

        <!-- 状态筛选 -->
        <div class="flex items-center gap-2">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300">状态:</label>
          <select
            v-model="filters.status"
            class="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            @change="loadCardTypes"
          >
            <option value="">全部</option>
            <option value="active">启用</option>
            <option value="inactive">停用</option>
          </select>
        </div>

        <!-- 显示停用项目 -->
        <label class="flex items-center gap-2 text-sm">
          <input
            v-model="filters.includeInactive"
            class="rounded"
            type="checkbox"
            @change="loadCardTypes"
          />
          <span class="text-gray-700 dark:text-gray-300">显示已停用</span>
        </label>

        <!-- 刷新按钮 -->
        <button
          class="flex items-center gap-1 rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          :disabled="loading"
          @click="loadCardTypes"
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
          刷新
        </button>
      </div>
    </div>

    <!-- 卡类型列表 -->
    <div v-if="loading" class="py-8 text-center">
      <div class="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400">
        <svg class="h-5 w-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

    <div
      v-else-if="cardTypes.length === 0"
      class="py-8 text-center text-gray-500 dark:text-gray-400"
    >
      <svg
        class="mx-auto mb-4 h-12 w-12 opacity-50"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          d="M20 7l-8-4-8 4m16 0l-8 4.01L4 7m16 0v10l-8 4-8-4V7"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        />
      </svg>
      暂无卡类型数据
    </div>

    <div v-else class="grid gap-4">
      <div
        v-for="cardType in cardTypes"
        :key="cardType.id"
        class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
      >
        <div class="flex items-start justify-between">
          <div class="flex items-start gap-3">
            <!-- 选择框 -->
            <input
              v-model="selectedCardTypes"
              class="mt-1 rounded"
              type="checkbox"
              :value="cardType"
            />
            <div class="flex-1">
              <div class="mb-2 flex items-center gap-3">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                  {{ cardType.name }}
                </h3>
                <!-- 状态标签 -->
                <span
                  class="rounded-full px-2 py-1 text-xs font-medium"
                  :class="{
                    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300':
                      cardType.active,
                    'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300':
                      !cardType.active
                  }"
                >
                  {{ cardType.active ? '启用' : '停用' }}
                </span>
                <!-- 类型标签 -->
                <span
                  class="rounded-full px-2 py-1 text-xs font-medium"
                  :class="getCategoryBadgeClass(cardType.category)"
                >
                  {{ getCategoryName(cardType.category) }}
                </span>
                <!-- 内置标签 -->
                <span
                  v-if="cardType.builtin"
                  class="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-300"
                >
                  内置
                </span>
              </div>

              <p v-if="cardType.description" class="mb-3 text-gray-600 dark:text-gray-400">
                {{ cardType.description }}
              </p>

              <!-- 卡类型详细信息 -->
              <div class="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                <div>
                  <span class="text-gray-500 dark:text-gray-400">总Token:</span>
                  <span class="ml-2 font-medium text-gray-900 dark:text-white">
                    {{ formatNumber(cardType.totalTokens) }}
                  </span>
                </div>
                <div>
                  <span class="text-gray-500 dark:text-gray-400">每日Token:</span>
                  <span class="ml-2 font-medium text-gray-900 dark:text-white">
                    {{ formatNumber(cardType.dailyTokens) }}
                  </span>
                </div>
                <div>
                  <span class="text-gray-500 dark:text-gray-400">有效期:</span>
                  <span class="ml-2 font-medium text-gray-900 dark:text-white">
                    {{ cardType.duration === -1 ? '不限时' : `${cardType.duration}天` }}
                  </span>
                </div>
                <div>
                  <span class="text-gray-500 dark:text-gray-400">价格:</span>
                  <span class="ml-2 font-medium text-green-600 dark:text-green-400">
                    ${{ cardType.priceUsd }}
                  </span>
                </div>
              </div>

              <!-- 关联的计费模版 -->
              <div v-if="cardType.associatedTemplates?.length" class="mt-3">
                <span class="text-sm text-gray-500 dark:text-gray-400">关联模版:</span>
                <div class="mt-1 flex flex-wrap gap-1">
                  <span
                    v-for="template in cardType.associatedTemplates"
                    :key="template.id"
                    class="rounded-full bg-purple-100 px-2 py-1 text-xs text-purple-800 dark:bg-purple-900 dark:text-purple-300"
                  >
                    {{ template.name }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="ml-4 flex items-center gap-2">
            <button
              class="rounded-lg p-2 text-purple-600 transition-colors hover:bg-purple-50 hover:text-purple-800 dark:text-purple-400 dark:hover:bg-purple-900/20 dark:hover:text-purple-300"
              title="查看统计"
              @click="viewCardTypeStats(cardType)"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
            </button>

            <button
              class="rounded-lg p-2 text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/20 dark:hover:text-blue-300"
              title="编辑"
              @click="editCardType(cardType)"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
            </button>

            <button
              v-if="!cardType.builtin"
              class="rounded-lg p-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
              :class="{
                'text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300':
                  !cardType.active,
                'text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300':
                  cardType.active
              }"
              :title="cardType.active ? '停用' : '启用'"
              @click="toggleCardTypeStatus(cardType)"
            >
              <svg
                v-if="cardType.active"
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M10 9V6a4 4 0 118 0v3M5 9h14l-1 10a2 2 0 01-2 2H8a2 2 0 01-2-2L5 9z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
              <svg v-else class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
            </button>

            <button
              v-if="!cardType.builtin"
              class="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50 hover:text-red-800 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
              title="删除"
              @click="deleteCardType(cardType)"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
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

    <!-- 创建/编辑模态框 -->
    <CardTypeFormModal
      v-if="showCreateModal || showEditModal"
      :card-type="editingCardType"
      :visible="showCreateModal || showEditModal"
      @close="closeModal"
      @success="handleModalSuccess"
    />

    <!-- 统计模态框 -->
    <CardTypeStatsModal
      :card-type="statsCardType"
      :visible="showStatsModal"
      @close="closeStatsModal"
    />

    <!-- 删除确认模态框 -->
    <ConfirmModal
      confirm-class="bg-red-500 hover:bg-red-600"
      confirm-text="删除"
      :message="`确定要删除卡类型 「${deletingCardType?.name}」 吗？此操作不可撤销。`"
      title="删除卡类型"
      :visible="showDeleteModal"
      @cancel="showDeleteModal = false"
      @confirm="confirmDelete"
    />

    <!-- 批量编辑模态框 -->
    <BatchEditModal
      :selected-card-types="selectedCardTypes"
      :visible="showBatchEditModal"
      @close="showBatchEditModal = false"
      @remove-from-selection="removeFromSelection"
      @success="handleModalSuccess"
    />

    <!-- 导入导出模态框 -->
    <ImportExportModal
      :selected-card-types="selectedCardTypes"
      :visible="showImportExportModal"
      @close="showImportExportModal = false"
      @success="handleModalSuccess"
    />

    <!-- 模板关联模态框 -->
    <TemplateAssociationModal
      :visible="showTemplateAssociationModal"
      @close="showTemplateAssociationModal = false"
      @success="handleModalSuccess"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useToast } from '@/utils/toast'
import CardTypeFormModal from '@/components/card-types/CardTypeFormModal.vue'
import CardTypeStatsModal from '@/components/card-types/CardTypeStatsModal.vue'
import BatchEditModal from '@/components/card-types/BatchEditModal.vue'
import ImportExportModal from '@/components/card-types/ImportExportModal.vue'
import TemplateAssociationModal from '@/components/card-types/TemplateAssociationModal.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

const toast = useToast()

// 响应式数据
const loading = ref(false)
const cardTypes = ref([])
const showCreateModal = ref(false)
const showEditModal = ref(false)
const showDeleteModal = ref(false)
const showStatsModal = ref(false)
const showBatchEditModal = ref(false)
const showImportExportModal = ref(false)
const showTemplateAssociationModal = ref(false)
const showAdvancedMenu = ref(false)
const editingCardType = ref(null)
const deletingCardType = ref(null)
const statsCardType = ref(null)
const selectedCardTypes = ref([])
const advancedMenuRef = ref(null)

// 筛选条件
const filters = reactive({
  category: '',
  status: '',
  includeInactive: false
})

// 生命周期
onMounted(() => {
  loadCardTypes()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// 方法
async function loadCardTypes() {
  try {
    loading.value = true
    const params = new URLSearchParams()

    if (filters.category) params.append('category', filters.category)
    if (filters.status) params.append('status', filters.status)
    if (filters.includeInactive) params.append('includeInactive', 'true')

    const response = await fetch(`/admin/card-types?${params}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      }
    })

    if (!response.ok) throw new Error('获取卡类型列表失败')

    const result = await response.json()
    cardTypes.value = result.data || []
  } catch (error) {
    console.error('加载卡类型失败:', error)
    toast.error('加载卡类型失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

function viewCardTypeStats(cardType) {
  statsCardType.value = cardType
  showStatsModal.value = true
}

function editCardType(cardType) {
  editingCardType.value = { ...cardType }
  showEditModal.value = true
}

async function toggleCardTypeStatus(cardType) {
  try {
    const action = cardType.active ? 'deactivate' : 'activate'
    const response = await fetch(`/admin/card-types/${cardType.id}/${action}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      }
    })

    if (!response.ok) throw new Error(`${action === 'activate' ? '启用' : '停用'}失败`)

    toast.success(`卡类型 "${cardType.name}" ${action === 'activate' ? '启用' : '停用'}成功`)
    loadCardTypes()
  } catch (error) {
    console.error('状态切换失败:', error)
    toast.error('操作失败: ' + error.message)
  }
}

function deleteCardType(cardType) {
  deletingCardType.value = cardType
  showDeleteModal.value = true
}

async function confirmDelete() {
  try {
    const response = await fetch(`/admin/card-types/${deletingCardType.value.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      }
    })

    if (!response.ok) throw new Error('删除失败')

    toast.success(`卡类型 "${deletingCardType.value.name}" 删除成功`)
    showDeleteModal.value = false
    deletingCardType.value = null
    loadCardTypes()
  } catch (error) {
    console.error('删除失败:', error)
    toast.error('删除失败: ' + error.message)
  }
}

function closeModal() {
  showCreateModal.value = false
  showEditModal.value = false
  editingCardType.value = null
}

function closeStatsModal() {
  showStatsModal.value = false
  statsCardType.value = null
}

function handleModalSuccess() {
  closeModal()
  loadCardTypes()
}

// 高级功能处理
function openBatchEdit() {
  if (selectedCardTypes.value.length === 0) {
    toast.warning('请先选择要批量编辑的卡类型')
    return
  }
  showBatchEditModal.value = true
  showAdvancedMenu.value = false
}

function selectAllCardTypes() {
  if (selectedCardTypes.value.length === cardTypes.value.length) {
    selectedCardTypes.value = []
  } else {
    selectedCardTypes.value = [...cardTypes.value]
  }
  showAdvancedMenu.value = false
}

function removeFromSelection(cardTypeId) {
  const index = selectedCardTypes.value.findIndex((ct) => ct.id === cardTypeId)
  if (index > -1) {
    selectedCardTypes.value.splice(index, 1)
  }
}

function handleClickOutside(event) {
  if (advancedMenuRef.value && !advancedMenuRef.value.contains(event.target)) {
    showAdvancedMenu.value = false
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

function getCategoryBadgeClass(category) {
  const classes = {
    daily: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    monthly: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    unlimited: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300'
  }
  return classes[category] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
}

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}
</script>
