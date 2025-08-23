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
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">迁移结果验证</h2>
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

        <!-- 验证结果 -->
        <div v-if="loading" class="py-12 text-center">
          <div class="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <svg class="h-5 w-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
            验证中...
          </div>
        </div>

        <div v-else-if="validationResult" class="space-y-6">
          <!-- 迁移状态 -->
          <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
            <h3 class="mb-3 text-lg font-medium text-gray-900 dark:text-white">迁移状态</h3>
            <div class="flex items-center gap-2">
              <div
                class="h-3 w-3 rounded-full"
                :class="{
                  'bg-green-500': validationResult.migrationStatus.isCompleted,
                  'bg-red-500': !validationResult.migrationStatus.isCompleted
                }"
              ></div>
              <span class="text-sm font-medium">
                {{ validationResult.migrationStatus.isCompleted ? '已完成' : '未完成' }}
              </span>
            </div>
            <div
              v-if="validationResult.migrationStatus.endTime"
              class="mt-2 text-sm text-gray-600 dark:text-gray-400"
            >
              完成时间: {{ formatDate(validationResult.migrationStatus.endTime) }}
            </div>
          </div>

          <!-- 内置类型验证 -->
          <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
            <h3 class="mb-3 text-lg font-medium text-gray-900 dark:text-white">内置卡类型验证</h3>
            <div class="grid gap-3 md:grid-cols-2">
              <!-- 日卡验证 -->
              <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                <div class="flex items-center justify-between">
                  <span class="font-medium">内置日卡</span>
                  <div class="flex items-center gap-2">
                    <div
                      class="h-2 w-2 rounded-full"
                      :class="{
                        'bg-green-500': validationResult.builtinTypes.daily.exists,
                        'bg-red-500': !validationResult.builtinTypes.daily.exists
                      }"
                    ></div>
                    <span class="text-sm">
                      {{ validationResult.builtinTypes.daily.exists ? '存在' : '不存在' }}
                    </span>
                  </div>
                </div>
                <div class="mt-2 flex items-center justify-between">
                  <span class="text-sm text-gray-600 dark:text-gray-400">配置正确</span>
                  <div class="flex items-center gap-2">
                    <div
                      class="h-2 w-2 rounded-full"
                      :class="{
                        'bg-green-500': validationResult.builtinTypes.daily.valid,
                        'bg-red-500': !validationResult.builtinTypes.daily.valid
                      }"
                    ></div>
                    <span class="text-sm">
                      {{ validationResult.builtinTypes.daily.valid ? '是' : '否' }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- 月卡验证 -->
              <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                <div class="flex items-center justify-between">
                  <span class="font-medium">内置月卡</span>
                  <div class="flex items-center gap-2">
                    <div
                      class="h-2 w-2 rounded-full"
                      :class="{
                        'bg-green-500': validationResult.builtinTypes.monthly.exists,
                        'bg-red-500': !validationResult.builtinTypes.monthly.exists
                      }"
                    ></div>
                    <span class="text-sm">
                      {{ validationResult.builtinTypes.monthly.exists ? '存在' : '不存在' }}
                    </span>
                  </div>
                </div>
                <div class="mt-2 flex items-center justify-between">
                  <span class="text-sm text-gray-600 dark:text-gray-400">配置正确</span>
                  <div class="flex items-center gap-2">
                    <div
                      class="h-2 w-2 rounded-full"
                      :class="{
                        'bg-green-500': validationResult.builtinTypes.monthly.valid,
                        'bg-red-500': !validationResult.builtinTypes.monthly.valid
                      }"
                    ></div>
                    <span class="text-sm">
                      {{ validationResult.builtinTypes.monthly.valid ? '是' : '否' }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 数据一致性检查 -->
          <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
            <h3 class="mb-3 text-lg font-medium text-gray-900 dark:text-white">数据一致性检查</h3>
            <div class="grid gap-4 md:grid-cols-2">
              <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                <h4 class="font-medium">API Keys</h4>
                <div class="mt-2 space-y-1 text-sm">
                  <div class="flex justify-between">
                    <span>总数:</span>
                    <span class="font-medium">
                      {{ validationResult.dataConsistency.apiKeys.total }}
                    </span>
                  </div>
                  <div class="flex justify-between">
                    <span>需迁移:</span>
                    <span
                      class="font-medium"
                      :class="{
                        'text-green-600':
                          validationResult.dataConsistency.apiKeys.needsMigration === 0,
                        'text-orange-600':
                          validationResult.dataConsistency.apiKeys.needsMigration > 0
                      }"
                    >
                      {{ validationResult.dataConsistency.apiKeys.needsMigration }}
                    </span>
                  </div>
                  <div class="flex justify-between">
                    <span>日卡:</span>
                    <span class="font-medium text-blue-600">
                      {{ validationResult.dataConsistency.apiKeys.dailyCards }}
                    </span>
                  </div>
                  <div class="flex justify-between">
                    <span>月卡:</span>
                    <span class="font-medium text-green-600">
                      {{ validationResult.dataConsistency.apiKeys.monthlyCards }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                <h4 class="font-medium">兑换码</h4>
                <div class="mt-2 space-y-1 text-sm">
                  <div class="flex justify-between">
                    <span>总数:</span>
                    <span class="font-medium">
                      {{ validationResult.dataConsistency.redemptionCodes.total }}
                    </span>
                  </div>
                  <div class="flex justify-between">
                    <span>日卡:</span>
                    <span class="font-medium text-blue-600">
                      {{ validationResult.dataConsistency.redemptionCodes.daily }}
                    </span>
                  </div>
                  <div class="flex justify-between">
                    <span>月卡:</span>
                    <span class="font-medium text-green-600">
                      {{ validationResult.dataConsistency.redemptionCodes.monthly }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 建议 -->
          <div
            v-if="validationResult.recommendations && validationResult.recommendations.length > 0"
            class="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20"
          >
            <h3
              class="mb-3 flex items-center gap-2 text-lg font-medium text-yellow-800 dark:text-yellow-200"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.081 16.5c-.77.833.192 2.5 1.732 2.5z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                />
              </svg>
              建议
            </h3>
            <ul class="space-y-1 text-sm text-yellow-700 dark:text-yellow-300">
              <li
                v-for="(recommendation, index) in validationResult.recommendations"
                :key="index"
                class="flex items-start gap-2"
              >
                <span class="text-yellow-600">•</span>
                <span>{{ recommendation }}</span>
              </li>
            </ul>
          </div>

          <!-- 验证通过 -->
          <div
            v-else-if="
              validationResult.migrationStatus.isCompleted &&
              validationResult.builtinTypes.daily.valid &&
              validationResult.builtinTypes.monthly.valid &&
              validationResult.dataConsistency.apiKeys.needsMigration === 0
            "
            class="rounded-lg bg-green-50 p-4 dark:bg-green-900/20"
          >
            <div class="flex items-center gap-3">
              <svg
                class="h-6 w-6 text-green-500"
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
                <h3 class="text-lg font-medium text-green-800 dark:text-green-200">验证通过</h3>
                <p class="mt-1 text-sm text-green-700 dark:text-green-300">
                  迁移已成功完成，所有数据验证通过，系统运行正常。
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- 按钮栏 -->
        <div class="mt-8 flex justify-between border-t border-gray-200 pt-6 dark:border-gray-600">
          <button
            class="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            :disabled="loading"
            @click="validateMigration"
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
            {{ loading ? '验证中...' : '重新验证' }}
          </button>
          <button
            class="rounded-lg bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600"
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
import { ref, watch } from 'vue'
import { useToast } from '@/utils/toast'

const props = defineProps({
  visible: Boolean
})

defineEmits(['close'])

const toast = useToast()

// 响应式数据
const loading = ref(false)
const validationResult = ref(null)

// 监听器
watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible && !validationResult.value) {
      validateMigration()
    }
  }
)

// 方法
async function validateMigration() {
  try {
    loading.value = true
    const response = await fetch('/admin/card-types/migration/validate', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('adminToken')}`
      }
    })

    if (!response.ok) throw new Error('验证失败')

    const result = await response.json()
    validationResult.value = result.data
  } catch (error) {
    console.error('验证失败:', error)
    toast.error('验证失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

// 工具函数
function formatDate(dateString) {
  if (!dateString) return ''
  return new Date(dateString).toLocaleString('zh-CN')
}
</script>
