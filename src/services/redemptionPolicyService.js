const redisClient = require('../models/redis')
const logger = require('../utils/logger')
const keyLogsService = require('./keyLogsService')

class RedemptionPolicyService {
  constructor() {
    this.GLOBAL_POLICY_KEY = 'redemption_policy:global:default'
    this.TYPE_POLICY_PREFIX = 'redemption_policy:type:'
    this.CODE_POLICY_PREFIX = 'redemption_policy:code:'
    this.API_KEY_POLICY_PREFIX = 'api_key_policy:'
    this.USAGE_MONITOR_PREFIX = 'usage_monitor:'
    this.POLICY_CHECK_QUEUE = 'policy_check_queue'
    this.DAILY_RESET_QUEUE_PREFIX = 'daily_reset_queue:'
    this.ACTIVE_POLICIES_INDEX = 'active_policies:redemption'
    this.TYPE_INDEX_PREFIX = 'policy_type_index:'
    this.SWITCH_HISTORY_PREFIX = 'template_switch_history:'
  }

  // 获取 Redis 客户端
  _getRedis() {
    return redisClient.getClientSafe()
  }

  // ==================== 策略配置管理 ====================

  /**
   * 获取全局默认策略
   */
  async getGlobalPolicy() {
    try {
      const policy = await this._getRedis().hgetall(this.GLOBAL_POLICY_KEY)
      if (!policy || Object.keys(policy).length === 0) {
        return this._getDefaultGlobalPolicy()
      }

      // 解析JSON字段
      if (policy.thresholds) {
        policy.thresholds = JSON.parse(policy.thresholds)
      }

      return policy
    } catch (error) {
      logger.error(`[策略服务] 获取全局策略失败: ${error.message}`)
      return this._getDefaultGlobalPolicy()
    }
  }

  /**
   * 设置全局默认策略
   */
  async setGlobalPolicy(policyData) {
    try {
      const policy = {
        enabled: policyData.enabled !== undefined ? policyData.enabled.toString() : 'true',
        initialRateTemplate: policyData.initialRateTemplate || '',
        initialAccountGroup: policyData.initialAccountGroup || '',
        thresholds: JSON.stringify(policyData.thresholds || []),
        resetHour: policyData.resetHour?.toString() || '0',
        monitorInterval: policyData.monitorInterval?.toString() || '5',
        updatedAt: new Date().toISOString()
      }

      // 如果是首次创建，添加创建时间
      const existing = await this._getRedis().hgetall(this.GLOBAL_POLICY_KEY)
      if (!existing || Object.keys(existing).length === 0) {
        policy.createdAt = new Date().toISOString()
      }

      await this._getRedis().hset(this.GLOBAL_POLICY_KEY, policy)

      // 记录日志
      await keyLogsService.logSystemEvent('全局兑换码策略配置已更新', 'info', {
        policyType: 'global',
        ...policy
      })

      logger.info(`[策略服务] 全局策略已更新`)
      return true
    } catch (error) {
      logger.error(`[策略服务] 设置全局策略失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 获取类型策略
   */
  async getTypePolicy(type) {
    try {
      const policy = await this._getRedis().hgetall(`${this.TYPE_POLICY_PREFIX}${type}`)
      if (!policy || Object.keys(policy).length === 0) {
        return null
      }

      // 解析JSON字段
      if (policy.thresholds) {
        policy.thresholds = JSON.parse(policy.thresholds)
      }

      return { ...policy, type }
    } catch (error) {
      logger.error(`[策略服务] 获取类型策略失败: ${error.message}`)
      return null
    }
  }

  /**
   * 设置类型策略
   */
  async setTypePolicy(type, policyData) {
    try {
      const policy = {
        enabled: policyData.enabled !== undefined ? policyData.enabled.toString() : 'true',
        inheritGlobal:
          policyData.inheritGlobal !== undefined ? policyData.inheritGlobal.toString() : 'true',
        initialRateTemplate: policyData.initialRateTemplate || '',
        initialAccountGroup: policyData.initialAccountGroup || '',
        thresholds: JSON.stringify(policyData.thresholds || []),
        resetHour: policyData.resetHour?.toString() || '0',
        description: policyData.description || '',
        updatedAt: new Date().toISOString()
      }

      // 如果是首次创建，添加创建时间
      const existing = await this._getRedis().hgetall(`${this.TYPE_POLICY_PREFIX}${type}`)
      if (!existing || Object.keys(existing).length === 0) {
        policy.createdAt = new Date().toISOString()
      }

      await this._getRedis().hset(`${this.TYPE_POLICY_PREFIX}${type}`, policy)

      // 记录日志
      await keyLogsService.logSystemEvent(`${type}类型兑换码策略配置已更新`, 'info', {
        policyType: 'type',
        type,
        ...policy
      })

      logger.info(`[策略服务] ${type} 类型策略已更新`)
      return true
    } catch (error) {
      logger.error(`[策略服务] 设置类型策略失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 获取个别兑换码策略
   */
  async getCodePolicy(codeId) {
    try {
      const policy = await this._getRedis().hgetall(`${this.CODE_POLICY_PREFIX}${codeId}`)
      if (!policy || Object.keys(policy).length === 0) {
        return null
      }

      // 解析JSON字段
      if (policy.customPolicy) {
        policy.customPolicy = JSON.parse(policy.customPolicy)
      }

      return { ...policy, codeId }
    } catch (error) {
      logger.error(`[策略服务] 获取兑换码策略失败: ${error.message}`)
      return null
    }
  }

  /**
   * 设置个别兑换码策略
   */
  async setCodePolicy(codeId, policyData) {
    try {
      const policy = {
        enabled: policyData.enabled !== undefined ? policyData.enabled.toString() : 'true',
        inheritType:
          policyData.inheritType !== undefined ? policyData.inheritType.toString() : 'true',
        customPolicy: JSON.stringify(policyData.customPolicy || {}),
        updatedAt: new Date().toISOString()
      }

      // 如果是首次创建，添加创建时间
      const existing = await this._getRedis().hgetall(`${this.CODE_POLICY_PREFIX}${codeId}`)
      if (!existing || Object.keys(existing).length === 0) {
        policy.createdAt = new Date().toISOString()
      }

      await this._getRedis().hset(`${this.CODE_POLICY_PREFIX}${codeId}`, policy)

      // 记录日志
      await keyLogsService.logSystemEvent(`兑换码 ${codeId} 策略配置已更新`, 'info', {
        policyType: 'code',
        codeId,
        ...policy
      })

      logger.info(`[策略服务] 兑换码 ${codeId} 策略已更新`)
      return true
    } catch (error) {
      logger.error(`[策略服务] 设置兑换码策略失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 获取有效策略（考虑继承关系）
   */
  async getEffectivePolicy(codeId, codeType) {
    try {
      // 获取各层级策略
      const globalPolicy = await this.getGlobalPolicy()
      const typePolicy = await this.getTypePolicy(codeType)
      const codePolicy = await this.getCodePolicy(codeId)

      // 构建有效策略（优先级：个别 > 类型 > 全局）
      let effectivePolicy = { ...globalPolicy }

      // 应用类型策略
      if (typePolicy && typePolicy.enabled === 'true') {
        if (typePolicy.inheritGlobal === 'false') {
          // 不继承全局策略，完全覆盖
          effectivePolicy = { ...typePolicy }
        } else {
          // 继承全局策略，部分覆盖
          effectivePolicy = {
            ...effectivePolicy,
            ...typePolicy,
            thresholds: typePolicy.thresholds || effectivePolicy.thresholds
          }
        }
      }

      // 应用个别兑换码策略
      if (codePolicy && codePolicy.enabled === 'true') {
        if (codePolicy.inheritType === 'false') {
          // 不继承类型策略，使用自定义策略
          if (codePolicy.customPolicy) {
            effectivePolicy = {
              ...effectivePolicy,
              ...codePolicy.customPolicy
            }
          }
        } else {
          // 继承类型策略，部分覆盖
          if (codePolicy.customPolicy) {
            effectivePolicy = {
              ...effectivePolicy,
              ...codePolicy.customPolicy,
              thresholds: codePolicy.customPolicy.thresholds || effectivePolicy.thresholds
            }
          }
        }
      }

      return effectivePolicy
    } catch (error) {
      logger.error(`[策略服务] 获取有效策略失败: ${error.message}`)
      return await this.getGlobalPolicy()
    }
  }

  // ==================== API Key 策略绑定 ====================

  /**
   * 绑定API Key到策略
   */
  async bindApiKeyPolicy(apiKeyId, redemptionData) {
    try {
      const { codeId, codeType, templateId, groupId } = redemptionData

      // 获取有效策略
      const effectivePolicy = await this.getEffectivePolicy(codeId, codeType)

      const binding = {
        sourceType: 'redemption',
        sourceId: codeId || codeType,
        currentTemplate: templateId || effectivePolicy.initialRateTemplate || '',
        initialTemplate: templateId || effectivePolicy.initialRateTemplate || '',
        appliedThresholds: JSON.stringify([]),
        lastCheck: new Date().toISOString(),
        lastReset: new Date().toISOString(),
        isActive: 'true',
        metadata: JSON.stringify({
          redemptionDate: new Date().toISOString(),
          codeType,
          originalCode: codeId,
          initialGroup: groupId || effectivePolicy.initialAccountGroup || ''
        })
      }

      await this._getRedis().hset(`${this.API_KEY_POLICY_PREFIX}${apiKeyId}`, binding)
      await this._getRedis().sadd(this.ACTIVE_POLICIES_INDEX, apiKeyId)
      await this._getRedis().sadd(`${this.TYPE_INDEX_PREFIX}${codeType}`, apiKeyId)

      // 初始化使用量监控
      await this._initUsageMonitor(apiKeyId, effectivePolicy)

      // 添加到策略检查队列
      const nextCheck = Date.now() + (parseInt(effectivePolicy.monitorInterval) || 5) * 60 * 1000
      await this._getRedis().zadd(this.POLICY_CHECK_QUEUE, nextCheck, apiKeyId)

      // 记录日志
      await keyLogsService.logRedemption(codeId, apiKeyId, codeType, true, {
        policyBound: true,
        template: binding.currentTemplate
      })

      logger.info(`[策略服务] API Key ${apiKeyId} 已绑定策略`)
      return true
    } catch (error) {
      logger.error(`[策略服务] 绑定API Key策略失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 获取API Key策略绑定信息
   */
  async getApiKeyPolicy(apiKeyId) {
    try {
      const binding = await this._getRedis().hgetall(`${this.API_KEY_POLICY_PREFIX}${apiKeyId}`)
      if (!binding || Object.keys(binding).length === 0) {
        return null
      }

      // 解析JSON字段
      if (binding.appliedThresholds) {
        binding.appliedThresholds = JSON.parse(binding.appliedThresholds)
      }
      if (binding.metadata) {
        binding.metadata = JSON.parse(binding.metadata)
      }

      return binding
    } catch (error) {
      logger.error(`[策略服务] 获取API Key策略失败: ${error.message}`)
      return null
    }
  }

  // ==================== 使用量监控 ====================

  /**
   * 初始化使用量监控
   */
  async _initUsageMonitor(apiKeyId, _policy) {
    try {
      const today = this._getTodayString()
      const monitorKey = `${this.USAGE_MONITOR_PREFIX}${apiKeyId}:${today}`

      const monitorData = {
        totalTokens: '0',
        inputTokens: '0',
        outputTokens: '0',
        cacheReadTokens: '0',
        cacheCreateTokens: '0',
        requestCount: '0',
        lastUpdate: new Date().toISOString(),
        dailyLimit: '1000000', // 默认100万Token限额
        currentPercentage: '0.0',
        thresholdHistory: JSON.stringify([])
      }

      await this._getRedis().hset(monitorKey, monitorData)

      // 设置过期时间（31天）
      await this._getRedis().expire(monitorKey, 31 * 24 * 60 * 60)

      logger.debug(`[策略服务] 已初始化 ${apiKeyId} 的使用量监控`)
    } catch (error) {
      logger.error(`[策略服务] 初始化使用量监控失败: ${error.message}`)
    }
  }

  /**
   * 更新使用量监控数据
   */
  async updateUsageMonitor(apiKeyId, usageData) {
    try {
      const today = this._getTodayString()
      const monitorKey = `${this.USAGE_MONITOR_PREFIX}${apiKeyId}:${today}`

      // 获取当前数据
      const current = await this._getRedis().hgetall(monitorKey)
      if (!current || Object.keys(current).length === 0) {
        await this._initUsageMonitor(apiKeyId, {})
        return await this.updateUsageMonitor(apiKeyId, usageData)
      }

      // 累加使用量
      const updated = {
        totalTokens: (parseInt(current.totalTokens) + (usageData.totalTokens || 0)).toString(),
        inputTokens: (parseInt(current.inputTokens) + (usageData.inputTokens || 0)).toString(),
        outputTokens: (parseInt(current.outputTokens) + (usageData.outputTokens || 0)).toString(),
        cacheReadTokens: (
          parseInt(current.cacheReadTokens) + (usageData.cacheReadTokens || 0)
        ).toString(),
        cacheCreateTokens: (
          parseInt(current.cacheCreateTokens) + (usageData.cacheCreateTokens || 0)
        ).toString(),
        requestCount: (parseInt(current.requestCount) + 1).toString(),
        lastUpdate: new Date().toISOString()
      }

      // 计算使用百分比
      const dailyLimit = parseInt(current.dailyLimit) || 1000000
      const percentage = (parseInt(updated.totalTokens) / dailyLimit) * 100
      updated.currentPercentage = percentage.toFixed(2)

      await this._getRedis().hset(monitorKey, updated)

      logger.debug(`[策略服务] 已更新 ${apiKeyId} 使用量: ${updated.currentPercentage}%`)
      return percentage
    } catch (error) {
      logger.error(`[策略服务] 更新使用量监控失败: ${error.message}`)
      return 0
    }
  }

  /**
   * 获取使用量监控数据
   */
  async getUsageMonitor(apiKeyId, date = null) {
    try {
      const targetDate = date || this._getTodayString()
      const monitorKey = `${this.USAGE_MONITOR_PREFIX}${apiKeyId}:${targetDate}`

      const data = await this._getRedis().hgetall(monitorKey)
      if (!data || Object.keys(data).length === 0) {
        return null
      }

      // 解析JSON字段
      if (data.thresholdHistory) {
        data.thresholdHistory = JSON.parse(data.thresholdHistory)
      }

      return data
    } catch (error) {
      logger.error(`[策略服务] 获取使用量监控失败: ${error.message}`)
      return null
    }
  }

  // ==================== 工具方法 ====================

  /**
   * 获取默认全局策略
   */
  _getDefaultGlobalPolicy() {
    return {
      enabled: 'true',
      initialRateTemplate: '',
      initialAccountGroup: '',
      thresholds: [],
      resetHour: '0',
      monitorInterval: '5',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }

  /**
   * 获取今天的日期字符串 (YYYY-MM-DD)
   */
  _getTodayString() {
    return new Date().toISOString().split('T')[0]
  }

  /**
   * 清理过期的使用量监控数据
   */
  async cleanupExpiredUsageData() {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - 30)
      const cutoffString = cutoffDate.toISOString().split('T')[0]

      // 这里可以实现清理逻辑
      // 由于Redis的expire机制会自动清理，这里主要用于手动清理

      logger.info(`[策略服务] 已清理 ${cutoffString} 之前的使用量数据`)
    } catch (error) {
      logger.error(`[策略服务] 清理使用量数据失败: ${error.message}`)
    }
  }
}

module.exports = new RedemptionPolicyService()
