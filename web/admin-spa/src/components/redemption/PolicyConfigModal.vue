<template>
  <div v-if="show" class="modal-overlay">
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">
          {{ modalTitle }}
        </h3>
        <button class="modal-close-btn" @click="closeModal">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div class="modal-body">
        <form @submit.prevent="savePolicy">
          <!-- 策略基本信息 -->
          <div class="form-section">
            <h4 class="section-title">基本配置</h4>

            <div class="form-group">
              <label class="form-label">启用策略</label>
              <div class="switch-wrapper">
                <input
                  id="policy-enabled"
                  v-model="policyData.enabled"
                  class="switch-input"
                  type="checkbox"
                />
                <label class="switch-label" for="policy-enabled">
                  <span class="switch-text">{{ policyData.enabled ? '启用' : '禁用' }}</span>
                </label>
              </div>
            </div>

            <!-- 继承设置（类型和个别兑换码策略） -->
            <div v-if="policyType !== 'global'" class="form-group">
              <label class="form-label">继承上级策略</label>
              <div class="switch-wrapper">
                <input
                  id="inherit-enabled"
                  v-model="inheritEnabled"
                  class="switch-input"
                  type="checkbox"
                />
                <label class="switch-label" for="inherit-enabled">
                  <span class="switch-text">{{ inheritEnabled ? '继承' : '独立配置' }}</span>
                </label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">初始计费模板</label>
              <select
                v-model="policyData.initialRateTemplate"
                class="form-select"
                :disabled="!policyData.enabled"
              >
                <option value="">选择模板</option>
                <option v-for="template in rateTemplates" :key="template.id" :value="template.id">
                  {{ template.name }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">初始账户组</label>
              <select
                v-model="policyData.initialAccountGroup"
                class="form-select"
                :disabled="!policyData.enabled"
              >
                <option value="">选择账户组</option>
                <option v-for="group in accountGroups" :key="group.id" :value="group.id">
                  {{ group.name }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">监控间隔（分钟）</label>
              <input
                v-model.number="policyData.monitorInterval"
                class="form-input"
                :disabled="!policyData.enabled"
                max="60"
                min="1"
                type="number"
              />
            </div>

            <div v-if="policyType !== 'code'" class="form-group">
              <label class="form-label">重置时间（小时）</label>
              <input
                v-model.number="policyData.resetHour"
                class="form-input"
                :disabled="!policyData.enabled"
                max="23"
                min="0"
                type="number"
              />
            </div>

            <div v-if="policyType !== 'global'" class="form-group">
              <label class="form-label">描述</label>
              <textarea
                v-model="policyData.description"
                class="form-textarea"
                :disabled="!policyData.enabled"
                placeholder="策略描述..."
              ></textarea>
            </div>
          </div>

          <!-- 阈值配置 -->
          <div class="form-section">
            <div class="section-header">
              <h4 class="section-title">阈值规则</h4>
              <button
                class="btn btn-sm btn-primary"
                :disabled="!policyData.enabled"
                type="button"
                @click="addThreshold"
              >
                <i class="fas fa-plus"></i>
                添加阈值
              </button>
            </div>

            <div v-if="thresholds.length === 0" class="empty-state">
              <p class="text-gray-500">暂无阈值规则，点击"添加阈值"创建规则</p>
            </div>

            <div v-else class="thresholds-list">
              <div v-for="(threshold, index) in thresholds" :key="index" class="threshold-item">
                <div class="threshold-content">
                  <div class="form-row">
                    <div class="form-group">
                      <label class="form-label">使用量百分比</label>
                      <div class="input-with-suffix">
                        <input
                          v-model.number="threshold.percentage"
                          class="form-input"
                          :disabled="!policyData.enabled"
                          max="100"
                          min="1"
                          type="number"
                        />
                        <span class="input-suffix">%</span>
                      </div>
                    </div>

                    <div class="form-group">
                      <label class="form-label">切换到模板</label>
                      <select
                        v-model="threshold.templateId"
                        class="form-select"
                        :disabled="!policyData.enabled"
                      >
                        <option value="">选择模板</option>
                        <option
                          v-for="template in rateTemplates"
                          :key="template.id"
                          :value="template.id"
                        >
                          {{ template.name }}
                        </option>
                      </select>
                    </div>

                    <div class="form-group">
                      <label class="form-label">优先级</label>
                      <input
                        v-model.number="threshold.priority"
                        class="form-input"
                        :disabled="!policyData.enabled"
                        min="1"
                        type="number"
                      />
                    </div>
                  </div>

                  <div class="form-group">
                    <label class="form-label">描述</label>
                    <input
                      v-model="threshold.description"
                      class="form-input"
                      :disabled="!policyData.enabled"
                      placeholder="阈值描述..."
                      type="text"
                    />
                  </div>
                </div>

                <button
                  class="threshold-remove-btn"
                  :disabled="!policyData.enabled"
                  type="button"
                  @click="removeThreshold(index)"
                >
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" type="button" @click="closeModal">取消</button>
        <button class="btn btn-primary" :disabled="loading" type="button" @click="savePolicy">
          <i v-if="loading" class="fas fa-spinner fa-spin mr-2"></i>
          保存策略
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted } from 'vue'
import { showToast } from '@/utils/toast'
import { apiClient } from '@/config/api'

export default {
  name: 'PolicyConfigModal',
  props: {
    show: {
      type: Boolean,
      default: false
    },
    policyType: {
      type: String,
      required: true, // 'global' | 'type' | 'code'
      validator: (value) => ['global', 'type', 'code'].includes(value)
    },
    targetId: {
      type: String,
      default: null // 类型策略的type或个别兑换码的codeId
    },
    initialData: {
      type: Object,
      default: () => ({})
    }
  },
  emits: ['close', 'saved'],
  setup(props, { emit }) {
    const loading = ref(false)
    const rateTemplates = ref([])
    const accountGroups = ref([])

    // 策略数据
    const policyData = ref({
      enabled: true,
      initialRateTemplate: '',
      initialAccountGroup: '',
      monitorInterval: 5,
      resetHour: 0,
      description: ''
    })

    // 阈值列表
    const thresholds = ref([])

    // 继承设置
    const inheritEnabled = ref(true)

    // 计算属性
    const modalTitle = computed(() => {
      switch (props.policyType) {
        case 'global':
          return '全局策略配置'
        case 'type':
          return `${props.targetId} 类型策略配置`
        case 'code':
          return `兑换码 ${props.targetId} 策略配置`
        default:
          return '策略配置'
      }
    })

    // 方法
    const loadRateTemplates = async () => {
      try {
        const result = await apiClient.get('/admin/rate-templates')
        if (result.success) {
          rateTemplates.value = result.data || []
        }
      } catch (error) {
        console.error('Failed to load rate templates:', error)
      }
    }

    const loadAccountGroups = async () => {
      try {
        const result = await apiClient.get('/admin/account-groups')
        if (result.success) {
          accountGroups.value = result.data || []
        }
      } catch (error) {
        console.error('Failed to load account groups:', error)
      }
    }

    const loadPolicy = async () => {
      if (!props.show) return

      try {
        loading.value = true
        let result

        switch (props.policyType) {
          case 'global':
            result = await apiClient.get('/admin/redemption-policies/global')
            break
          case 'type':
            result = await apiClient.get(`/admin/redemption-policies/type/${props.targetId}`)
            break
          case 'code':
            result = await apiClient.get(`/admin/redemption-policies/code/${props.targetId}`)
            break
        }

        if (result.success && result.data) {
          const data = result.data

          // 基本数据
          policyData.value = {
            enabled: data.enabled === 'true',
            initialRateTemplate: data.initialRateTemplate || '',
            initialAccountGroup: data.initialAccountGroup || '',
            monitorInterval: parseInt(data.monitorInterval) || 5,
            resetHour: parseInt(data.resetHour) || 0,
            description: data.description || ''
          }

          // 继承设置
          if (props.policyType === 'type') {
            inheritEnabled.value = data.inheritGlobal !== 'false'
          } else if (props.policyType === 'code') {
            inheritEnabled.value = data.inheritType !== 'false'
            if (data.customPolicy) {
              const customPolicy = data.customPolicy
              policyData.value = { ...policyData.value, ...customPolicy }
            }
          }

          // 阈值数据
          thresholds.value = data.thresholds || []
        }
      } catch (error) {
        console.error('Failed to load policy:', error)
        showToast('加载策略配置失败', 'error')
      } finally {
        loading.value = false
      }
    }

    const addThreshold = () => {
      thresholds.value.push({
        percentage: 50,
        templateId: '',
        priority: thresholds.value.length + 1,
        description: ''
      })
    }

    const removeThreshold = (index) => {
      thresholds.value.splice(index, 1)
      // 重新计算优先级
      thresholds.value.forEach((threshold, i) => {
        threshold.priority = i + 1
      })
    }

    const savePolicy = async () => {
      try {
        loading.value = true

        // 构建提交数据
        const submitData = {
          ...policyData.value,
          thresholds: thresholds.value
        }

        // 处理继承设置
        if (props.policyType === 'type') {
          submitData.inheritGlobal = inheritEnabled.value
        } else if (props.policyType === 'code') {
          submitData.inheritType = inheritEnabled.value
          if (!inheritEnabled.value) {
            submitData.customPolicy = {
              initialRateTemplate: submitData.initialRateTemplate,
              initialAccountGroup: submitData.initialAccountGroup,
              thresholds: submitData.thresholds,
              description: submitData.description
            }
          }
        }

        let result
        switch (props.policyType) {
          case 'global':
            result = await apiClient.post('/admin/redemption-policies/global', submitData)
            break
          case 'type':
            result = await apiClient.post(
              `/admin/redemption-policies/type/${props.targetId}`,
              submitData
            )
            break
          case 'code':
            result = await apiClient.post(
              `/admin/redemption-policies/code/${props.targetId}`,
              submitData
            )
            break
        }

        if (result.success) {
          showToast('策略配置保存成功', 'success')
          emit('saved', submitData)
          closeModal()
        } else {
          showToast(result.message || '保存失败', 'error')
        }
      } catch (error) {
        console.error('Failed to save policy:', error)
        showToast('保存策略配置失败', 'error')
      } finally {
        loading.value = false
      }
    }

    const closeModal = () => {
      emit('close')
    }

    // 监听器
    watch(
      () => props.show,
      (newVal) => {
        if (newVal) {
          loadPolicy()
        }
      }
    )

    // 生命周期
    onMounted(() => {
      loadRateTemplates()
      loadAccountGroups()
    })

    return {
      loading,
      rateTemplates,
      accountGroups,
      policyData,
      thresholds,
      inheritEnabled,
      modalTitle,
      addThreshold,
      removeThreshold,
      savePolicy,
      closeModal
    }
  }
}
</script>

<style scoped>
.modal-overlay {
  @apply fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50;
}

.modal-content {
  @apply max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-xl;
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

.modal-footer {
  @apply flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4;
}

.form-section {
  @apply mb-6 last:mb-0;
}

.section-title {
  @apply mb-4 text-base font-semibold text-gray-900;
}

.section-header {
  @apply mb-4 flex items-center justify-between;
}

.form-group {
  @apply mb-4 last:mb-0;
}

.form-label {
  @apply mb-2 block text-sm font-medium text-gray-700;
}

.form-input {
  @apply w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500;
}

.form-select {
  @apply w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500;
}

.form-textarea {
  @apply w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500;
  min-height: 80px;
}

.form-row {
  @apply grid grid-cols-1 gap-4 sm:grid-cols-3;
}

.switch-wrapper {
  @apply flex items-center gap-2;
}

.switch-input {
  @apply sr-only;
}

.switch-label {
  @apply relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full bg-gray-200 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2;
}

.switch-input:checked + .switch-label {
  @apply bg-blue-600;
}

.switch-label::before {
  @apply absolute left-0.5 top-0.5 h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ease-in-out;
  content: '';
}

.switch-input:checked + .switch-label::before {
  @apply translate-x-5;
}

.switch-text {
  @apply ml-12 text-sm text-gray-700;
}

.input-with-suffix {
  @apply relative;
}

.input-suffix {
  @apply absolute right-3 top-1/2 -translate-y-1/2 transform text-sm text-gray-500;
}

.empty-state {
  @apply py-8 text-center;
}

.thresholds-list {
  @apply space-y-4;
}

.threshold-item {
  @apply relative rounded-lg border border-gray-200 bg-gray-50 p-4;
}

.threshold-content {
  @apply pr-12;
}

.threshold-remove-btn {
  @apply absolute right-4 top-4 rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700;
}

.btn {
  @apply rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50;
}

.btn-primary {
  @apply bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500;
}

.btn-secondary {
  @apply bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-500;
}

.btn-sm {
  @apply px-3 py-1.5 text-xs;
}
</style>
