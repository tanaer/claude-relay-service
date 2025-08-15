import { apiClient } from '@/config/api'
import { showToast } from '@/utils/toast'

/**
 * 通用API调用组合式函数
 */
export function useApi() {
  // 通用GET请求
  const get = async (url, options = {}) => {
    try {
      const result = await apiClient.get(url, options)
      return { success: true, data: result.data || result }
    } catch (error) {
      console.error(`API GET Error [${url}]:`, error)
      if (options.showError !== false) {
        showToast(error.message || '请求失败', 'error')
      }
      return { success: false, error: error.message }
    }
  }

  // 通用POST请求
  const post = async (url, data = null, options = {}) => {
    try {
      const result = await apiClient.post(url, data, options)
      return { success: true, data: result.data || result }
    } catch (error) {
      console.error(`API POST Error [${url}]:`, error)
      if (options.showError !== false) {
        showToast(error.message || '请求失败', 'error')
      }
      return { success: false, error: error.message }
    }
  }

  // 通用PUT请求
  const put = async (url, data = null, options = {}) => {
    try {
      const result = await apiClient.put(url, data, options)
      return { success: true, data: result.data || result }
    } catch (error) {
      console.error(`API PUT Error [${url}]:`, error)
      if (options.showError !== false) {
        showToast(error.message || '请求失败', 'error')
      }
      return { success: false, error: error.message }
    }
  }

  // 通用DELETE请求
  const del = async (url, options = {}) => {
    try {
      const result = await apiClient.delete(url, options)
      return { success: true, data: result.data || result }
    } catch (error) {
      console.error(`API DELETE Error [${url}]:`, error)
      if (options.showError !== false) {
        showToast(error.message || '请求失败', 'error')
      }
      return { success: false, error: error.message }
    }
  }

  return {
    get,
    post,
    put,
    delete: del
  }
}

/**
 * 兑换码策略相关API
 */
export function useRedemptionPolicyApi() {
  const api = useApi()

  // 获取全局策略
  const getGlobalPolicy = () => api.get('/admin/redemption-policies/global')

  // 设置全局策略
  const setGlobalPolicy = (policyData) => api.post('/admin/redemption-policies/global', policyData)

  // 获取类型策略
  const getTypePolicy = (type) => api.get(`/admin/redemption-policies/type/${type}`)

  // 设置类型策略
  const setTypePolicy = (type, policyData) =>
    api.post(`/admin/redemption-policies/type/${type}`, policyData)

  // 获取兑换码策略
  const getCodePolicy = (codeId) => api.get(`/admin/redemption-policies/code/${codeId}`)

  // 设置兑换码策略
  const setCodePolicy = (codeId, policyData) =>
    api.post(`/admin/redemption-policies/code/${codeId}`, policyData)

  // 获取有效策略
  const getEffectivePolicy = (codeId, codeType) =>
    api.get(`/admin/redemption-policies/effective/${codeId}/${codeType}`)

  // 获取API Key策略绑定
  const getApiKeyPolicy = (apiKeyId) => api.get(`/admin/redemption-policies/api-key/${apiKeyId}`)

  // 获取使用量监控数据
  const getUsageMonitor = (apiKeyId, date) =>
    api.get(`/admin/redemption-policies/usage/${apiKeyId}${date ? `?date=${date}` : ''}`)

  // 获取模板切换历史
  const getSwitchHistory = (apiKeyId, limit = 10) =>
    api.get(`/admin/redemption-policies/switch-history/${apiKeyId}?limit=${limit}`)

  // 获取策略引擎状态
  const getEngineStatus = () => api.get('/admin/redemption-policies/engine-status')

  // 获取调度器状态
  const getSchedulerStatus = () => api.get('/admin/redemption-policies/scheduler-status')

  // 获取活跃策略列表
  const getActivePolicies = () => api.get('/admin/redemption-policies/active')

  // 获取重置历史
  const getResetHistory = (days = 7) =>
    api.get(`/admin/redemption-policies/reset-history?days=${days}`)

  // 触发每日重置
  const triggerDailyReset = () => api.post('/admin/redemption-policies/trigger-daily-reset')

  // 触发数据清理
  const triggerCleanup = () => api.post('/admin/redemption-policies/trigger-cleanup')

  // 切换策略引擎
  const togglePolicyEngine = (enabled) =>
    api.post('/admin/redemption-policies/toggle-engine', { enabled })

  // 切换调度器
  const toggleScheduler = (enabled) =>
    api.post('/admin/redemption-policies/toggle-scheduler', { enabled })

  return {
    getGlobalPolicy,
    setGlobalPolicy,
    getTypePolicy,
    setTypePolicy,
    getCodePolicy,
    setCodePolicy,
    getEffectivePolicy,
    getApiKeyPolicy,
    getUsageMonitor,
    getSwitchHistory,
    getEngineStatus,
    getSchedulerStatus,
    getActivePolicies,
    getResetHistory,
    triggerDailyReset,
    triggerCleanup,
    togglePolicyEngine,
    toggleScheduler
  }
}

/**
 * 计费模板相关API
 */
export function useRateTemplateApi() {
  const api = useApi()

  // 获取计费模板列表
  const getTemplates = () => api.get('/admin/rate-templates')

  // 创建计费模板
  const createTemplate = (templateData) => api.post('/admin/rate-templates', templateData)

  // 更新计费模板
  const updateTemplate = (templateId, templateData) =>
    api.put(`/admin/rate-templates/${templateId}`, templateData)

  // 删除计费模板
  const deleteTemplate = (templateId) => api.delete(`/admin/rate-templates/${templateId}`)

  // 获取模板详情
  const getTemplate = (templateId) => api.get(`/admin/rate-templates/${templateId}`)

  return {
    getTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplate
  }
}
