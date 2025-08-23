<template>
  <div class="p-6">
    <!-- 页面标题 -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">卡类型系统迁移</h1>
      <p class="mt-1 text-gray-600 dark:text-gray-400">
        从硬编码的日卡/月卡系统迁移到灵活的动态卡类型管理系统
      </p>
    </div>

    <!-- 迁移状态卡片 -->
    <div class="mb-6 rounded-lg bg-white p-6 shadow-sm dark:bg-gray-800">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">迁移状态</h2>
          <div class="mt-2 flex items-center gap-2">
            <div
              class="h-3 w-3 rounded-full"
              :class="{
                'bg-green-500': migrationStatus.isCompleted,
                'bg-yellow-500': migrationStatus.inProgress,
                'bg-gray-400': !migrationStatus.isCompleted && !migrationStatus.inProgress
              }"
            ></div>
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
              {{
                migrationStatus.isCompleted
                  ? '已完成'
                  : migrationStatus.inProgress
                    ? '进行中'
                    : '未开始'
              }}
            </span>
          </div>
        </div>
        <button
          class="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:bg-blue-300"
          :disabled="loading"
          @click="refreshStatus"
        >
          <svg
            v-if="loading"
            class="mr-2 h-4 w-4 animate-spin"
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
          刷新状态
        </button>
      </div>

      <div v-if="migrationStatus.isCompleted" class="mt-4">
        <div class="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
          <div class="flex items-start gap-3">
            <svg
              class="h-5 w-5 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
            <div>
              <h3 class="text-sm font-medium text-green-800 dark:text-green-200">迁移已完成</h3>
              <div
                v-if="migrationStatus.endTime"
                class="mt-1 text-sm text-green-700 dark:text-green-300"
              >
                完成时间: {{ formatDate(migrationStatus.endTime) }}
              </div>
              <div
                v-if="migrationStatus.duration"
                class="text-sm text-green-700 dark:text-green-300"
              >
                耗时: {{ formatDuration(migrationStatus.duration) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 操作面板 -->
    <div class="grid gap-6 lg:grid-cols-2">
      <!-- 数据分析 -->
      <div class="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-800">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">数据分析</h3>
          <button
            class="rounded-lg border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            :disabled="analyzing"
            @click="analyzeData"
          >
            <svg
              v-if="analyzing"
              class="mr-1 h-4 w-4 animate-spin"
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
            {{ analyzing ? '分析中...' : '分析数据' }}
          </button>
        </div>

        <div v-if="analysisResult" class="space-y-4">
          <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
            <h4 class="text-sm font-medium text-gray-900 dark:text-white">API Keys</h4>
            <div class="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>
                <span class="text-gray-500 dark:text-gray-400">总数:</span>
                <span class="ml-2 font-medium">{{ analysisResult.apiKeys.total }}</span>
              </div>
              <div>
                <span class="text-gray-500 dark:text-gray-400">需迁移:</span>
                <span class="ml-2 font-medium text-orange-600">{{
                  analysisResult.apiKeys.needsMigration
                }}</span>
              </div>
              <div>
                <span class="text-gray-500 dark:text-gray-400">日卡:</span>
                <span class="ml-2 font-medium text-blue-600">{{
                  analysisResult.apiKeys.dailyCards
                }}</span>
              </div>
              <div>
                <span class="text-gray-500 dark:text-gray-400">月卡:</span>
                <span class="ml-2 font-medium text-green-600">{{
                  analysisResult.apiKeys.monthlyCards
                }}</span>
              </div>
            </div>
          </div>

          <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
            <h4 class="text-sm font-medium text-gray-900 dark:text-white">兑换码</h4>
            <div class="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>
                <span class="text-gray-500 dark:text-gray-400">总数:</span>
                <span class="ml-2 font-medium">{{ analysisResult.redemptionCodes.total }}</span>
              </div>
              <div>
                <span class="text-gray-500 dark:text-gray-400">日卡:</span>
                <span class="ml-2 font-medium text-blue-600">{{
                  analysisResult.redemptionCodes.daily
                }}</span>
              </div>
              <div>
                <span class="text-gray-500 dark:text-gray-400">月卡:</span>
                <span class="ml-2 font-medium text-green-600">{{
                  analysisResult.redemptionCodes.monthly
                }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="flex h-32 items-center justify-center text-gray-500 dark:text-gray-400">
          <div class="text-center">
            <svg class="mx-auto mb-2 h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
            <p class="text-sm">点击"分析数据"查看现有数据统计</p>
          </div>
        </div>
      </div>

      <!-- 迁移操作 -->
      <div class="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-800">
        <h3 class="mb-4 text-lg font-medium text-gray-900 dark:text-white">迁移操作</h3>

        <div class="space-y-4">
          <!-- 预览迁移 -->
          <div>
            <button
              class="flex w-full items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
              :disabled="previewing || migrating"
              @click="previewMigration"
            >
              <svg
                v-if="previewing"
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
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
                <path
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
              {{ previewing ? '预览中...' : '预览迁移' }}
            </button>
          </div>

          <!-- 执行迁移 -->
          <div>
            <button
              class="flex w-full items-center gap-2 rounded-lg bg-green-500 px-4 py-3 text-white hover:bg-green-600 disabled:bg-green-300"
              :disabled="migrating || migrationStatus.isCompleted"
              @click="confirmMigration"
            >
              <svg
                v-if="migrating"
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
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
              {{
                migrating ? '迁移中...' : migrationStatus.isCompleted ? '已完成迁移' : '执行迁移'
              }}
            </button>
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              执行前建议先预览迁移影响。此操作会修改现有数据，请谨慎操作。
            </p>
          </div>

          <!-- 创建内置类型 -->
          <div class="border-t border-gray-200 pt-4 dark:border-gray-600">
            <button
              class="flex w-full items-center gap-2 rounded-lg border border-gray-300 px-4 py-3 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              :disabled="creatingBuiltin"
              @click="createBuiltinTypes"
            >
              <svg
                v-if="creatingBuiltin"
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
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
              {{ creatingBuiltin ? '创建中...' : '仅创建内置类型' }}
            </button>
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              仅创建内置的日卡和月卡类型，不迁移现有数据。
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- 迁移预览结果 -->
    <div v-if="previewResult" class="mt-6 rounded-lg bg-white p-6 shadow-sm dark:bg-gray-800">
      <h3 class="mb-4 text-lg font-medium text-gray-900 dark:text-white">迁移预览</h3>

      <div class="grid gap-4 md:grid-cols-3">
        <div class="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
          <h4 class="text-sm font-medium text-blue-800 dark:text-blue-200">内置类型</h4>
          <div class="mt-2 space-y-1 text-sm">
            <div class="flex justify-between">
              <span>日卡:</span>
              <span
                :class="
                  previewResult.builtinTypes.daily === '将创建'
                    ? 'text-orange-600'
                    : 'text-green-600'
                "
              >
                {{ previewResult.builtinTypes.daily }}
              </span>
            </div>
            <div class="flex justify-between">
              <span>月卡:</span>
              <span
                :class="
                  previewResult.builtinTypes.monthly === '将创建'
                    ? 'text-orange-600'
                    : 'text-green-600'
                "
              >
                {{ previewResult.builtinTypes.monthly }}
              </span>
            </div>
          </div>
        </div>

        <div class="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20">
          <h4 class="text-sm font-medium text-yellow-800 dark:text-yellow-200">预计变更</h4>
          <div class="mt-2 space-y-1 text-sm">
            <div class="flex justify-between">
              <span>API Keys:</span>
              <span class="font-medium">{{ previewResult.estimatedChanges.apiKeys }}</span>
            </div>
            <div class="flex justify-between">
              <span>兑换码:</span>
              <span class="font-medium">{{ previewResult.estimatedChanges.redemptionCodes }}</span>
            </div>
          </div>
        </div>

        <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
          <h4 class="text-sm font-medium text-gray-800 dark:text-gray-200">数据分析</h4>
          <div class="mt-2 space-y-1 text-sm">
            <div class="flex justify-between">
              <span>总API Keys:</span>
              <span class="font-medium">{{ previewResult.analysis.apiKeys.total }}</span>
            </div>
            <div class="flex justify-between">
              <span>需迁移:</span>
              <span class="font-medium text-orange-600">{{
                previewResult.analysis.apiKeys.needsMigration
              }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 迁移结果 -->
    <div v-if="migrationResult" class="mt-6 rounded-lg bg-white p-6 shadow-sm dark:bg-gray-800">
      <h3 class="mb-4 text-lg font-medium text-gray-900 dark:text-white">迁移结果</h3>

      <div v-if="migrationResult.success" class="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
        <div class="flex items-start gap-3">
          <svg class="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
          <div>
            <h4 class="text-sm font-medium text-green-800 dark:text-green-200">迁移成功完成！</h4>
            <div class="mt-2 text-sm text-green-700 dark:text-green-300">
              <p>迁移ID: {{ migrationResult.migrationId }}</p>
              <p>耗时: {{ formatDuration(migrationResult.duration) }}</p>
            </div>
          </div>
        </div>

        <div v-if="migrationResult.results" class="mt-4 grid gap-2 md:grid-cols-2">
          <div class="text-sm">
            <span class="font-medium">API Keys:</span>
            已迁移 {{ migrationResult.results.apiKeys?.migrated || 0 }} 个
          </div>
          <div class="text-sm">
            <span class="font-medium">兑换码:</span>
            已迁移 {{ migrationResult.results.redemption?.migrated || 0 }} 个
          </div>
        </div>
      </div>

      <div v-else class="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
        <div class="flex items-start gap-3">
          <svg class="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.081 16.5c-.77.833.192 2.5 1.732 2.5z"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
          <div>
            <h4 class="text-sm font-medium text-red-800 dark:text-red-200">迁移失败</h4>
            <p class="mt-1 text-sm text-red-700 dark:text-red-300">{{ migrationResult.error }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 验证迁移结果 -->
    <div
      v-if="migrationStatus.isCompleted"
      class="mt-6 rounded-lg bg-white p-6 shadow-sm dark:bg-gray-800"
    >
      <h3 class="mb-4 text-lg font-medium text-gray-900 dark:text-white">迁移验证</h3>
      <p class="mb-4 text-sm text-gray-600 dark:text-gray-400">
        验证迁移结果的完整性和正确性，确保所有数据都已正确迁移。
      </p>
      <button
        class="rounded-lg bg-purple-500 px-4 py-2 text-white hover:bg-purple-600"
        @click="showValidationModal = true"
      >
        <svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
          />
        </svg>
        验证迁移结果
      </button>
    </div>

    <!-- 危险操作区域 -->
    <div v-if="migrationStatus.isCompleted" class="mt-8">
      <div
        class="rounded-lg border-2 border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20"
      >
        <h3 class="text-lg font-medium text-red-800 dark:text-red-200">危险操作</h3>
        <p class="mt-2 text-sm text-red-700 dark:text-red-300">
          以下操作仅在紧急情况下使用，会对系统数据造成不可逆影响。
        </p>

        <div class="mt-4">
          <button
            class="rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600 disabled:bg-red-300"
            :disabled="rolling"
            @click="confirmRollback"
          >
            <svg
              v-if="rolling"
              class="mr-2 h-4 w-4 animate-spin"
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
            {{ rolling ? '回滚中...' : '回滚迁移' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 确认模态框 -->
    <ConfirmModal
      confirm-class="bg-green-500 hover:bg-green-600"
      confirm-text="确认执行"
      :message="
        confirmAction === 'migrate'
          ? '确定要执行卡类型系统迁移吗？此操作会修改现有的API Key和兑换码数据，建议先进行数据备份。'
          : '确定要回滚迁移吗？此操作会撤销所有迁移变更，恢复到硬编码系统，且无法撤销！'
      "
      :title="confirmAction === 'migrate' ? '确认迁移' : '确认回滚'"
      :visible="showConfirm"
      @cancel="showConfirm = false"
      @confirm="executeConfirmedAction"
    />

    <!-- 验证模态框 -->
    <MigrationValidationModal :visible="showValidationModal" @close="showValidationModal = false" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useToast } from '@/utils/toast'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import MigrationValidationModal from '@/components/migration/MigrationValidationModal.vue'

const toast = useToast()

// 响应式数据
const loading = ref(false)
const analyzing = ref(false)
const previewing = ref(false)
const migrating = ref(false)
const creatingBuiltin = ref(false)
const rolling = ref(false)
const showConfirm = ref(false)
const confirmAction = ref('')
const showValidationModal = ref(false)

const migrationStatus = reactive({
  isCompleted: false,
  inProgress: false,
  startTime: null,
  endTime: null,
  duration: null,
  migrationId: null
})

const analysisResult = ref(null)
const previewResult = ref(null)
const migrationResult = ref(null)

// 生命周期
onMounted(() => {
  refreshStatus()
})

// 方法
async function refreshStatus() {
  try {
    loading.value = true
    const response = await fetch('/admin/card-types/migration/status', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      }
    })

    if (!response.ok) throw new Error('获取迁移状态失败')

    const result = await response.json()
    Object.assign(migrationStatus, result.data)
  } catch (error) {
    console.error('获取迁移状态失败:', error)
    toast.error('获取迁移状态失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

async function analyzeData() {
  try {
    analyzing.value = true
    const response = await fetch('/admin/card-types/migration/analyze', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      }
    })

    if (!response.ok) throw new Error('数据分析失败')

    const result = await response.json()
    analysisResult.value = result.data
    toast.success('数据分析完成')
  } catch (error) {
    console.error('数据分析失败:', error)
    toast.error('数据分析失败: ' + error.message)
  } finally {
    analyzing.value = false
  }
}

async function previewMigration() {
  try {
    previewing.value = true
    const response = await fetch('/admin/card-types/migration/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      },
      body: JSON.stringify({ dryRun: true })
    })

    if (!response.ok) throw new Error('预览失败')

    const result = await response.json()
    previewResult.value = result.data
    toast.success('迁移预览完成')
  } catch (error) {
    console.error('预览失败:', error)
    toast.error('预览失败: ' + error.message)
  } finally {
    previewing.value = false
  }
}

function confirmMigration() {
  confirmAction.value = 'migrate'
  showConfirm.value = true
}

function confirmRollback() {
  confirmAction.value = 'rollback'
  showConfirm.value = true
}

async function executeConfirmedAction() {
  showConfirm.value = false

  if (confirmAction.value === 'migrate') {
    await executeMigration()
  } else if (confirmAction.value === 'rollback') {
    await rollbackMigration()
  }
}

async function executeMigration() {
  try {
    migrating.value = true
    migrationStatus.inProgress = true

    const response = await fetch('/admin/card-types/migration/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      },
      body: JSON.stringify({ dryRun: false })
    })

    const result = await response.json()

    if (result.success) {
      migrationResult.value = result.data
      toast.success(result.message)
      await refreshStatus()
    } else {
      migrationResult.value = result
      toast.error('迁移执行失败: ' + result.error)
    }
  } catch (error) {
    console.error('迁移执行失败:', error)
    toast.error('迁移执行失败: ' + error.message)
  } finally {
    migrating.value = false
    migrationStatus.inProgress = false
  }
}

async function createBuiltinTypes() {
  try {
    creatingBuiltin.value = true
    const response = await fetch('/admin/card-types/migration/create-builtin', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      }
    })

    if (!response.ok) throw new Error('创建内置类型失败')

    const result = await response.json()
    if (result.success) {
      toast.success('内置卡类型创建成功')
    } else {
      toast.error('创建失败: ' + result.error)
    }
  } catch (error) {
    console.error('创建内置类型失败:', error)
    toast.error('创建内置类型失败: ' + error.message)
  } finally {
    creatingBuiltin.value = false
  }
}

async function rollbackMigration() {
  try {
    rolling.value = true
    const response = await fetch('/admin/card-types/migration/rollback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      },
      body: JSON.stringify({ confirm: 'CONFIRM_ROLLBACK' })
    })

    const result = await response.json()

    if (result.success) {
      toast.success('迁移回滚成功')
      await refreshStatus()
      migrationResult.value = null
    } else {
      toast.error('回滚失败: ' + result.error)
    }
  } catch (error) {
    console.error('回滚失败:', error)
    toast.error('回滚失败: ' + error.message)
  } finally {
    rolling.value = false
  }
}

// 工具函数
function formatDate(dateString) {
  if (!dateString) return ''
  return new Date(dateString).toLocaleString('zh-CN')
}

function formatDuration(duration) {
  if (!duration) return ''
  if (duration < 1000) return `${duration}ms`
  return `${(duration / 1000).toFixed(1)}秒`
}
</script>
