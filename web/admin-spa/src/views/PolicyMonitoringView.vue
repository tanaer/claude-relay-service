<template>
  <div class="tab-content">
    <div class="card p-4 sm:p-6">
      <div class="mb-4 flex flex-col gap-4 sm:mb-6">
        <div>
          <h3 class="mb-1 text-lg font-bold text-gray-900 sm:mb-2 sm:text-xl">策略监控仪表板</h3>
          <p class="text-sm text-gray-600 sm:text-base">监控兑换码动态计费策略的运行状态</p>
        </div>

        <!-- 系统状态概览 -->
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-lg bg-blue-50 p-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm text-blue-600">策略引擎</div>
                <div
                  class="text-xl font-bold"
                  :class="engineStatus?.isRunning ? 'text-green-900' : 'text-red-900'"
                >
                  {{ engineStatus?.isRunning ? '运行中' : '已停止' }}
                </div>
              </div>
              <div class="flex flex-col items-end gap-2">
                <div
                  class="text-2xl"
                  :class="engineStatus?.isRunning ? 'text-green-500' : 'text-red-500'"
                >
                  <i
                    :class="engineStatus?.isRunning ? 'fas fa-play-circle' : 'fas fa-stop-circle'"
                  ></i>
                </div>
                <button
                  class="rounded px-2 py-1 text-xs font-medium transition-colors"
                  :class="
                    engineStatus?.isRunning
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  "
                  :disabled="toggleEngineLoading"
                  @click="togglePolicyEngine"
                >
                  <i
                    :class="[
                      'fas',
                      {
                        'fa-spin fa-spinner': toggleEngineLoading,
                        'fa-power-off': !toggleEngineLoading
                      }
                    ]"
                  />
                  {{ engineStatus?.isRunning ? '停止' : '启动' }}
                </button>
              </div>
            </div>
          </div>

          <div class="rounded-lg bg-green-50 p-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm text-green-600">调度服务</div>
                <div
                  class="text-xl font-bold"
                  :class="schedulerStatus?.isRunning ? 'text-green-900' : 'text-red-900'"
                >
                  {{ schedulerStatus?.isRunning ? '运行中' : '已停止' }}
                </div>
              </div>
              <div class="flex flex-col items-end gap-2">
                <div
                  class="text-2xl"
                  :class="schedulerStatus?.isRunning ? 'text-green-500' : 'text-red-500'"
                >
                  <i
                    :class="schedulerStatus?.isRunning ? 'fas fa-clock' : 'fas fa-times-circle'"
                  ></i>
                </div>
                <button
                  class="rounded px-2 py-1 text-xs font-medium transition-colors"
                  :class="
                    schedulerStatus?.isRunning
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  "
                  :disabled="toggleSchedulerLoading"
                  @click="toggleScheduler"
                >
                  <i
                    :class="[
                      'fas',
                      {
                        'fa-spin fa-spinner': toggleSchedulerLoading,
                        'fa-power-off': !toggleSchedulerLoading
                      }
                    ]"
                  />
                  {{ schedulerStatus?.isRunning ? '停止' : '启动' }}
                </button>
              </div>
            </div>
          </div>

          <div class="rounded-lg bg-purple-50 p-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm text-purple-600">活跃策略</div>
                <div class="text-xl font-bold text-purple-900">{{ activePoliciesCount }}</div>
              </div>
              <div class="text-2xl text-purple-500">
                <i class="fas fa-cogs"></i>
              </div>
            </div>
          </div>

          <div class="rounded-lg bg-orange-50 p-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm text-orange-600">今日重置</div>
                <div class="text-xl font-bold text-orange-900">{{ todayResetCount }}</div>
              </div>
              <div class="text-2xl text-orange-500">
                <i class="fas fa-redo"></i>
              </div>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex flex-wrap gap-2">
          <button
            class="btn btn-primary flex items-center gap-2"
            :disabled="loading"
            @click="refreshData"
          >
            <i :class="['fas fa-sync-alt', { 'fa-spin': loading }]"></i>
            刷新数据
          </button>
          <button
            class="btn btn-success flex items-center gap-2"
            :disabled="triggeringReset"
            @click="triggerDailyReset"
          >
            <i :class="['fas fa-redo', { 'fa-spin': triggeringReset }]"></i>
            手动重置
          </button>
          <button
            class="btn btn-warning flex items-center gap-2"
            :disabled="triggeringCleanup"
            @click="triggerCleanup"
          >
            <i :class="['fas fa-broom', { 'fa-spin': triggeringCleanup }]"></i>
            清理数据
          </button>
          <!-- 🎯 新增：批量应用策略按钮 -->
          <button
            class="btn btn-info flex items-center gap-2"
            :disabled="applyingPolicies"
            @click="applyPoliciesByTags"
          >
            <i :class="['fas fa-tags', { 'fa-spin': applyingPolicies }]"></i>
            批量应用策略
          </button>
          <!-- 🎯 新增：数据清理按钮 -->
          <button
            class="btn btn-danger flex items-center gap-2"
            :disabled="cleaningData"
            @click="cleanupPolicyData"
          >
            <i :class="['fas fa-database', { 'fa-spin': cleaningData }]"></i>
            清理策略数据
          </button>
        </div>
      </div>

      <!-- 标签切换 -->
      <div class="mb-6">
        <nav class="flex space-x-8">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            :class="[
              'border-b-2 px-1 py-2 text-sm font-medium',
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            ]"
            @click="activeTab = tab.id"
          >
            {{ tab.name }}
          </button>
        </nav>
      </div>

      <!-- 标签内容 -->
      <div class="tab-content">
        <!-- 活跃策略标签 -->
        <div v-if="activeTab === 'active'" class="space-y-6">
          <div class="flex items-center justify-between">
            <h4 class="text-lg font-semibold text-gray-900">活跃策略列表</h4>
            <div class="flex items-center gap-2">
              <input
                v-model="searchQuery"
                class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                placeholder="搜索API Key..."
                type="text"
              />
            </div>
          </div>

          <div v-if="loading" class="py-8 text-center">
            <i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
            <p class="mt-2 text-gray-500">加载中...</p>
          </div>

          <div v-else-if="filteredActivePolicies.length === 0" class="py-8 text-center">
            <i class="fas fa-inbox text-2xl text-gray-300"></i>
            <p class="mt-2 text-gray-500">暂无活跃策略</p>
          </div>

          <div v-else class="grid gap-4">
            <div
              v-for="policy in filteredActivePolicies"
              :key="policy.apiKeyId"
              class="rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="mb-2 flex items-center gap-2">
                    <code class="rounded bg-gray-100 px-2 py-1 font-mono text-sm">{{
                      policy.apiKeyId
                    }}</code>
                    <span
                      :class="[
                        'rounded-full px-2 py-1 text-xs font-medium',
                        policy.isActive === 'true'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      ]"
                    >
                      {{ policy.isActive === 'true' ? '活跃' : '非活跃' }}
                    </span>
                  </div>

                  <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span class="text-gray-500">来源类型：</span>
                      <span class="text-gray-900">{{ getSourceTypeName(policy.sourceType) }}</span>
                    </div>
                    <div>
                      <span class="text-gray-500">当前模板：</span>
                      <span class="text-blue-600">{{
                        getCurrentTemplateName(policy.currentTemplate)
                      }}</span>
                    </div>
                    <div>
                      <span class="text-gray-500">兑换码类型：</span>
                      <span class="text-gray-900">{{
                        getCodeTypeName(policy.metadata?.codeType)
                      }}</span>
                    </div>
                    <div>
                      <span class="text-gray-500">最后检查：</span>
                      <span class="text-gray-900">{{ formatTime(policy.lastCheck) }}</span>
                    </div>
                  </div>

                  <!-- 已触发阈值 -->
                  <div
                    v-if="policy.appliedThresholds && policy.appliedThresholds.length > 0"
                    class="mt-3"
                  >
                    <div class="mb-1 text-xs text-gray-500">已触发阈值：</div>
                    <div class="flex flex-wrap gap-1">
                      <span
                        v-for="threshold in policy.appliedThresholds"
                        :key="threshold.percentage"
                        class="rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-800"
                      >
                        {{ threshold.percentage }}%
                      </span>
                    </div>
                  </div>
                </div>

                <div class="ml-4 flex items-center gap-2">
                  <button
                    class="text-sm text-blue-600 hover:text-blue-900"
                    @click="viewPolicyDetails(policy.apiKeyId)"
                  >
                    <i class="fas fa-eye"></i>
                    详情
                  </button>
                  <button
                    class="text-sm text-green-600 hover:text-green-900"
                    @click="configurePolicy(policy)"
                  >
                    <i class="fas fa-cog"></i>
                    配置
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 重置历史标签 -->
        <div v-if="activeTab === 'history'" class="space-y-6">
          <h4 class="text-lg font-semibold text-gray-900">重置历史（近7天）</h4>

          <div v-if="loading" class="py-8 text-center">
            <i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
            <p class="mt-2 text-gray-500">加载中...</p>
          </div>

          <div v-else class="space-y-4">
            <div
              v-for="record in resetHistory"
              :key="record.date"
              class="rounded-lg border border-gray-200 p-4"
            >
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium text-gray-900">{{ formatDate(record.date) }}</div>
                  <div class="text-sm text-gray-500">
                    重置了 {{ record.apiKeyCount }} 个API Key的策略状态
                  </div>
                </div>
                <div class="text-right">
                  <span
                    :class="[
                      'rounded-full px-3 py-1 text-sm font-medium',
                      record.completed ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    ]"
                  >
                    {{ record.completed ? '已完成' : '未执行' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 系统统计标签 -->
        <div v-if="activeTab === 'stats'" class="space-y-6">
          <h4 class="text-lg font-semibold text-gray-900">系统统计信息</h4>

          <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <!-- 策略引擎状态 -->
            <div class="rounded-lg border border-gray-200 p-4">
              <h5 class="mb-3 text-base font-medium text-gray-900">策略引擎状态</h5>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-500">运行状态：</span>
                  <span :class="engineStatus?.isRunning ? 'text-green-600' : 'text-red-600'">
                    {{ engineStatus?.isRunning ? '运行中' : '已停止' }}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">检查间隔：</span>
                  <span class="text-gray-900">{{
                    engineStatus?.hasInterval ? '正常' : '异常'
                  }}</span>
                </div>
              </div>
            </div>

            <!-- 调度服务状态 -->
            <div class="rounded-lg border border-gray-200 p-4">
              <h5 class="mb-3 text-base font-medium text-gray-900">调度服务状态</h5>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-500">运行状态：</span>
                  <span :class="schedulerStatus?.isRunning ? 'text-green-600' : 'text-red-600'">
                    {{ schedulerStatus?.isRunning ? '运行中' : '已停止' }}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">活跃任务：</span>
                  <span class="text-gray-900">{{ schedulerStatus?.taskCount || 0 }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">任务列表：</span>
                  <span class="text-gray-900">{{
                    schedulerStatus?.activeTasks?.join(', ') || '无'
                  }}</span>
                </div>
              </div>
            </div>

            <!-- 🎯 新增：策略应用统计 -->
            <div class="rounded-lg border border-gray-200 p-4">
              <h5 class="mb-3 text-base font-medium text-gray-900">策略应用统计</h5>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-500">日卡覆盖率：</span>
                  <span class="text-blue-600">{{ applicationStats?.coverage?.daily || '0' }}%</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">月卡覆盖率：</span>
                  <span class="text-purple-600"
                    >{{ applicationStats?.coverage?.monthly || '0' }}%</span
                  >
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">待绑定数量：</span>
                  <span class="text-orange-600">{{ applicationStats?.unbound?.total || 0 }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 🎯 新增：详细统计信息 -->
          <div v-if="applicationStats" class="rounded-lg border border-gray-200 p-4">
            <h5 class="mb-3 text-base font-medium text-gray-900">策略绑定详情</h5>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h6 class="mb-2 text-sm font-medium text-gray-700">日卡策略</h6>
                <div class="space-y-1 text-sm">
                  <div class="flex justify-between">
                    <span class="text-gray-500">带标签API Key：</span>
                    <span class="text-gray-900">{{
                      applicationStats.taggedApiKeys?.dailyCard || 0
                    }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">已绑定策略：</span>
                    <span class="text-blue-600">{{
                      applicationStats.activePolicies?.daily || 0
                    }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">待绑定：</span>
                    <span class="text-orange-600">{{ applicationStats.unbound?.daily || 0 }}</span>
                  </div>
                </div>
              </div>
              <div>
                <h6 class="mb-2 text-sm font-medium text-gray-700">月卡策略</h6>
                <div class="space-y-1 text-sm">
                  <div class="flex justify-between">
                    <span class="text-gray-500">带标签API Key：</span>
                    <span class="text-gray-900">{{
                      applicationStats.taggedApiKeys?.monthlyCard || 0
                    }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">已绑定策略：</span>
                    <span class="text-purple-600">{{
                      applicationStats.activePolicies?.monthly || 0
                    }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">待绑定：</span>
                    <span class="text-orange-600">{{
                      applicationStats.unbound?.monthly || 0
                    }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 策略详情弹窗 -->
    <div v-if="detailModal.show" class="modal-overlay" @click="closeDetailModal">
      <div class="modal-content policy-detail-modal" @click.stop>
        <div class="modal-header">
          <h3 class="modal-title">策略详情</h3>
          <button class="modal-close-btn" @click="closeDetailModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <PolicyStatusMonitor
            :api-key-id="detailModal.apiKeyId"
            @configure="handleConfigureFromDetail"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { showToast } from '@/utils/toast'
import { useRedemptionPolicyApi, useRateTemplateApi } from '@/composables/useApi'
import PolicyStatusMonitor from '@/components/redemption/PolicyStatusMonitor.vue'

export default {
  name: 'PolicyMonitoringView',
  components: {
    PolicyStatusMonitor
  },
  setup() {
    // API 组合式函数
    const policyApi = useRedemptionPolicyApi()
    const templateApi = useRateTemplateApi()
    const loading = ref(false)
    const triggeringReset = ref(false)
    const triggeringCleanup = ref(false)
    const toggleEngineLoading = ref(false)
    const toggleSchedulerLoading = ref(false)
    const applyingPolicies = ref(false) // 🎯 新增：批量应用策略状态
    const cleaningData = ref(false) // 🎯 新增：数据清理状态
    const activeTab = ref('active')
    const searchQuery = ref('')

    // 系统状态
    const engineStatus = ref(null)
    const schedulerStatus = ref(null)
    const activePolicies = ref([])
    const resetHistory = ref([])
    const rateTemplates = ref([])
    const applicationStats = ref(null) // 🎯 新增：策略应用统计

    let refreshTimer = null

    // 弹窗状态
    const detailModal = reactive({
      show: false,
      apiKeyId: null
    })

    // 标签配置
    const tabs = [
      { id: 'active', name: '活跃策略' },
      { id: 'history', name: '重置历史' },
      { id: 'stats', name: '系统统计' }
    ]

    // 计算属性
    const activePoliciesCount = computed(() => {
      return activePolicies.value.filter((p) => p.isActive === 'true').length
    })

    const todayResetCount = computed(() => {
      const today = new Date().toISOString().split('T')[0]
      const todayRecord = resetHistory.value.find((r) => r.date === today)
      return todayRecord?.apiKeyCount || 0
    })

    const filteredActivePolicies = computed(() => {
      if (!searchQuery.value) return activePolicies.value

      const query = searchQuery.value.toLowerCase()
      return activePolicies.value.filter(
        (policy) =>
          policy.apiKeyId.toLowerCase().includes(query) ||
          policy.sourceId?.toLowerCase().includes(query)
      )
    })

    // 方法
    const loadEngineStatus = async () => {
      try {
        const result = await policyApi.getEngineStatus()
        if (result.success) {
          engineStatus.value = result.data
        }
      } catch (error) {
        console.error('Failed to load engine status:', error)
      }
    }

    const loadSchedulerStatus = async () => {
      try {
        const result = await policyApi.getSchedulerStatus()
        if (result.success) {
          schedulerStatus.value = result.data
        }
      } catch (error) {
        console.error('Failed to load scheduler status:', error)
      }
    }

    const loadActivePolicies = async () => {
      try {
        const result = await policyApi.getActivePolicies()
        if (result.success) {
          activePolicies.value = result.data || []
        }
      } catch (error) {
        console.error('Failed to load active policies:', error)
        activePolicies.value = []
      }
    }

    const loadResetHistory = async () => {
      try {
        const result = await policyApi.getResetHistory(7)
        if (result.success) {
          resetHistory.value = result.data || []
        }
      } catch (error) {
        console.error('Failed to load reset history:', error)
        resetHistory.value = []
      }
    }

    const loadRateTemplates = async () => {
      try {
        const result = await templateApi.getTemplates()
        if (result.success) {
          rateTemplates.value = result.data || []
        }
      } catch (error) {
        console.error('Failed to load rate templates:', error)
      }
    }

    // 🎯 新增：加载策略应用统计
    const loadApplicationStats = async () => {
      try {
        const result = await policyApi.getApplicationStats()
        if (result.success) {
          applicationStats.value = result.data
        }
      } catch (error) {
        console.error('Failed to load application stats:', error)
        applicationStats.value = null
      }
    }

    const refreshData = async () => {
      loading.value = true
      try {
        await Promise.all([
          loadEngineStatus(),
          loadSchedulerStatus(),
          loadActivePolicies(),
          loadResetHistory(),
          loadApplicationStats() // 🎯 新增：加载策略应用统计
        ])
      } finally {
        loading.value = false
      }
    }

    const triggerDailyReset = async () => {
      try {
        triggeringReset.value = true
        const result = await policyApi.triggerDailyReset()
        if (result.success) {
          showToast('每日重置触发成功', 'success')
          await refreshData()
        } else {
          showToast(result.error || '触发失败', 'error')
        }
      } catch (error) {
        console.error('Failed to trigger daily reset:', error)
        showToast('触发每日重置失败', 'error')
      } finally {
        triggeringReset.value = false
      }
    }

    const triggerCleanup = async () => {
      try {
        triggeringCleanup.value = true
        const result = await policyApi.triggerCleanup()
        if (result.success) {
          showToast('数据清理触发成功', 'success')
          await refreshData()
        } else {
          showToast(result.error || '触发失败', 'error')
        }
      } catch (error) {
        console.error('Failed to trigger cleanup:', error)
        showToast('触发数据清理失败', 'error')
      } finally {
        triggeringCleanup.value = false
      }
    }

    const togglePolicyEngine = async () => {
      try {
        toggleEngineLoading.value = true
        const newState = !engineStatus.value?.isRunning
        const result = await policyApi.togglePolicyEngine(newState)

        if (result.success) {
          showToast(`策略引擎已${newState ? '启动' : '停止'}`, 'success')
          await loadEngineStatus()
        } else {
          showToast(result.error || '操作失败', 'error')
        }
      } catch (error) {
        console.error('Failed to toggle policy engine:', error)
        showToast('切换策略引擎状态失败', 'error')
      } finally {
        toggleEngineLoading.value = false
      }
    }

    const toggleScheduler = async () => {
      try {
        toggleSchedulerLoading.value = true
        const newState = !schedulerStatus.value?.isRunning
        const result = await policyApi.toggleScheduler(newState)

        if (result.success) {
          showToast(`调度服务已${newState ? '启动' : '停止'}`, 'success')
          await loadSchedulerStatus()
        } else {
          showToast(result.error || '操作失败', 'error')
        }
      } catch (error) {
        console.error('Failed to toggle scheduler:', error)
        showToast('切换调度服务状态失败', 'error')
      } finally {
        toggleSchedulerLoading.value = false
      }
    }

    // 🎯 新增：批量应用策略
    const applyPoliciesByTags = async () => {
      try {
        applyingPolicies.value = true
        const result = await policyApi.applyPoliciesByTags()

        if (result.success) {
          showToast(result.message || '批量策略应用成功', 'success')
          // 刷新数据以显示最新状态
          await Promise.all([loadActivePolicies(), loadApplicationStats()])
        } else {
          showToast(result.error || '批量策略应用失败', 'error')
        }
      } catch (error) {
        console.error('Failed to apply policies by tags:', error)
        showToast('批量应用策略失败', 'error')
      } finally {
        applyingPolicies.value = false
      }
    }

    // 🎯 新增：清理策略数据
    const cleanupPolicyData = async () => {
      try {
        // 确认对话框
        if (
          !confirm('确定要清理策略数据吗？这将清除无效的策略绑定和重建索引。建议在低峰时段执行。')
        ) {
          return
        }

        cleaningData.value = true
        const result = await policyApi.cleanupPolicyData()

        if (result.success) {
          showToast(result.message || '策略数据清理成功', 'success')
          // 刷新所有数据以显示最新状态
          await refreshData()
        } else {
          showToast(result.error || '策略数据清理失败', 'error')
        }
      } catch (error) {
        console.error('Failed to cleanup policy data:', error)
        showToast('策略数据清理失败', 'error')
      } finally {
        cleaningData.value = false
      }
    }

    const viewPolicyDetails = (apiKeyId) => {
      detailModal.show = true
      detailModal.apiKeyId = apiKeyId
    }

    const closeDetailModal = () => {
      detailModal.show = false
      detailModal.apiKeyId = null
    }

    const configurePolicy = (policy) => {
      // 跳转到兑换码管理页面的策略配置
      const metadata = policy.metadata
      if (metadata?.originalCode) {
        // 这里可以通过路由跳转到兑换码管理页面并打开策略配置
        showToast('请在兑换码管理页面进行策略配置', 'info')
      }
    }

    const handleConfigureFromDetail = (config) => {
      closeDetailModal()
      configurePolicy({ metadata: config })
    }

    const startAutoRefresh = () => {
      refreshTimer = setInterval(refreshData, 30000) // 30秒刷新一次
    }

    const stopAutoRefresh = () => {
      if (refreshTimer) {
        clearInterval(refreshTimer)
        refreshTimer = null
      }
    }

    // 格式化方法
    const formatTime = (timestamp) => {
      if (!timestamp) return '-'
      const date = new Date(timestamp)
      return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    }

    const formatDate = (dateString) => {
      const date = new Date(dateString)
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    }

    const getSourceTypeName = (type) => {
      const typeMap = {
        redemption: '兑换码',
        manual: '手动绑定',
        system: '系统'
      }
      return typeMap[type] || type
    }

    const getCurrentTemplateName = (templateId) => {
      if (!templateId) return '未设置'
      const template = rateTemplates.value.find((t) => t.id === templateId)
      return template?.name || templateId
    }

    const getCodeTypeName = (type) => {
      const typeMap = {
        daily: '日卡',
        monthly: '月卡'
      }
      return typeMap[type] || type
    }

    // 生命周期
    onMounted(async () => {
      await loadRateTemplates()
      await refreshData()
      startAutoRefresh()
    })

    onUnmounted(() => {
      stopAutoRefresh()
    })

    return {
      loading,
      triggeringReset,
      triggeringCleanup,
      toggleEngineLoading,
      toggleSchedulerLoading,
      applyingPolicies, // 🎯 新增
      cleaningData, // 🎯 新增
      activeTab,
      searchQuery,
      engineStatus,
      schedulerStatus,
      activePolicies,
      resetHistory,
      applicationStats, // 🎯 新增
      detailModal,
      tabs,
      activePoliciesCount,
      todayResetCount,
      filteredActivePolicies,
      refreshData,
      triggerDailyReset,
      triggerCleanup,
      togglePolicyEngine,
      toggleScheduler,
      applyPoliciesByTags, // 🎯 新增
      cleanupPolicyData, // 🎯 新增
      viewPolicyDetails,
      closeDetailModal,
      configurePolicy,
      handleConfigureFromDetail,
      formatTime,
      formatDate,
      getSourceTypeName,
      getCurrentTemplateName,
      getCodeTypeName
    }
  }
}
</script>

<style scoped>
.btn {
  @apply rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50;
}

.btn-primary {
  @apply bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500;
}

.btn-success {
  @apply bg-green-600 text-white hover:bg-green-700 focus:ring-green-500;
}

.btn-warning {
  @apply bg-yellow-600 text-white hover:bg-yellow-700 focus:ring-yellow-500;
}

.btn-info {
  @apply bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-400;
}

.btn-danger {
  @apply bg-red-600 text-white hover:bg-red-700 focus:ring-red-500;
}

.card {
  @apply rounded-lg border border-gray-200 bg-white shadow-sm;
}

.modal-overlay {
  @apply fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50;
}

.modal-content {
  @apply max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-xl;
}

.policy-detail-modal {
  @apply max-w-2xl;
}

.modal-header {
  @apply flex items-center justify-between border-b border-gray-200 px-6 py-4;
}

.modal-title {
  @apply text-lg font-semibold text-gray-900;
}

.modal-close-btn {
  @apply rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600;
}

.modal-body {
  @apply max-h-[calc(90vh-8rem)] overflow-y-auto px-6 py-4;
}
</style>
