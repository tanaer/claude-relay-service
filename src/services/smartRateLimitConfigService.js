const redis = require('../models/redis')
const logger = require('../utils/logger')

/**
 * 智能限流配置管理服务
 * 管理限流规则的动态配置
 */
class SmartRateLimitConfigService {
  constructor() {
    this.configKey = 'smart_rate_limit:config'
    this.defaultConfig = {
      enabled: true,

      // 立即限流规则
      instantRules: [
        {
          id: 'rate_limit_1',
          name: '速率限制',
          keywords: ['rate_limit_exceeded', 'too_many_requests', '429'],
          description: '检测到速率限制错误时立即限流',
          enabled: true,
          limitDuration: 30 * 60 // 30分钟
        },
        {
          id: 'quota_1',
          name: '配额超限',
          keywords: [
            'quota_exceeded',
            'insufficient_quota',
            'billing_hard_limit_reached',
            'usage_limit'
          ],
          description: '检测到配额超限错误时立即限流',
          enabled: true,
          limitDuration: 60 * 60 // 60分钟
        }
      ],

      // 累计触发限流规则
      cumulativeRules: [
        {
          id: 'auth_1',
          name: '认证失败',
          keywords: [
            'unauthorized',
            '401',
            'invalid_api_key',
            'authentication_failed',
            'session_expired'
          ],
          description: '认证失败错误累计触发限流',
          enabled: true,
          threshold: 5, // 触发次数
          window: 5 * 60, // 时间窗口（秒）
          limitDuration: 30 * 60 // 限流时长（秒）
        },
        {
          id: 'forbidden_1',
          name: '权限拒绝',
          keywords: ['forbidden', '403', 'permission_denied', 'access_denied'],
          description: '权限拒绝错误累计触发限流',
          enabled: true,
          threshold: 3,
          window: 5 * 60,
          limitDuration: 15 * 60
        }
      ],

      // 全局配置
      globalSettings: {
        defaultLimitDuration: 30 * 60, // 默认限流时长（秒）
        recoveryCheckInterval: 5 * 60, // 恢复检查间隔（秒）
        recoveryCheckBatchSize: 10, // 每次检查的账户数量
        matchMode: 'contains', // 匹配模式: contains/exact/regex
        caseSensitive: false // 是否区分大小写
      }
    }
  }

  /**
   * 获取配置
   */
  async getConfig() {
    try {
      const client = redis.getClientSafe()
      const configStr = await client.get(this.configKey)

      if (configStr) {
        const config = JSON.parse(configStr)
        return { success: true, data: config }
      } else {
        // 如果没有配置，使用默认配置
        await this.saveConfig(this.defaultConfig)
        return { success: true, data: this.defaultConfig }
      }
    } catch (error) {
      logger.error('获取智能限流配置失败:', error)
      return { success: false, error: error.message, data: this.defaultConfig }
    }
  }

  /**
   * 保存配置
   */
  async saveConfig(config) {
    try {
      const client = redis.getClientSafe()

      // 验证配置
      if (!this.validateConfig(config)) {
        throw new Error('配置格式无效')
      }

      // 保存到 Redis
      await client.set(this.configKey, JSON.stringify(config))

      // 发布配置更新事件（通知 smartRateLimitService 重新加载）
      await client.publish(
        'smart_rate_limit:config_updated',
        JSON.stringify({
          timestamp: new Date().toISOString(),
          updatedBy: 'admin'
        })
      )

      logger.info('✅ 智能限流配置已更新')

      return { success: true, message: '配置保存成功' }
    } catch (error) {
      logger.error('保存智能限流配置失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 添加立即限流规则
   */
  async addInstantRule(rule) {
    try {
      const config = (await this.getConfig()).data

      // 生成唯一ID
      rule.id = `instant_${Date.now()}`

      // 设置默认值
      rule.enabled = rule.enabled !== false
      rule.limitDuration = rule.limitDuration || config.globalSettings.defaultLimitDuration

      config.instantRules.push(rule)

      const result = await this.saveConfig(config)
      if (result.success) {
        return { success: true, data: rule, message: '立即限流规则添加成功' }
      }
      return result
    } catch (error) {
      logger.error('添加立即限流规则失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 添加累计触发限流规则
   */
  async addCumulativeRule(rule) {
    try {
      const config = (await this.getConfig()).data

      // 生成唯一ID
      rule.id = `cumulative_${Date.now()}`

      // 设置默认值
      rule.enabled = rule.enabled !== false
      rule.threshold = rule.threshold || 5
      rule.window = rule.window || 5 * 60
      rule.limitDuration = rule.limitDuration || config.globalSettings.defaultLimitDuration

      config.cumulativeRules.push(rule)

      const result = await this.saveConfig(config)
      if (result.success) {
        return { success: true, data: rule, message: '累计触发限流规则添加成功' }
      }
      return result
    } catch (error) {
      logger.error('添加累计触发限流规则失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 更新规则
   */
  async updateRule(ruleId, updates, ruleType) {
    try {
      const config = (await this.getConfig()).data

      const rules = ruleType === 'instant' ? config.instantRules : config.cumulativeRules
      const ruleIndex = rules.findIndex((r) => r.id === ruleId)

      if (ruleIndex === -1) {
        return { success: false, error: '规则不存在' }
      }

      // 更新规则
      rules[ruleIndex] = { ...rules[ruleIndex], ...updates }

      const result = await this.saveConfig(config)
      if (result.success) {
        return { success: true, data: rules[ruleIndex], message: '规则更新成功' }
      }
      return result
    } catch (error) {
      logger.error('更新规则失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 删除规则
   */
  async deleteRule(ruleId, ruleType) {
    try {
      const config = (await this.getConfig()).data

      if (ruleType === 'instant') {
        config.instantRules = config.instantRules.filter((r) => r.id !== ruleId)
      } else {
        config.cumulativeRules = config.cumulativeRules.filter((r) => r.id !== ruleId)
      }

      const result = await this.saveConfig(config)
      if (result.success) {
        return { success: true, message: '规则删除成功' }
      }
      return result
    } catch (error) {
      logger.error('删除规则失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 更新全局设置
   */
  async updateGlobalSettings(settings) {
    try {
      const config = (await this.getConfig()).data

      config.globalSettings = { ...config.globalSettings, ...settings }

      const result = await this.saveConfig(config)
      if (result.success) {
        return { success: true, data: config.globalSettings, message: '全局设置更新成功' }
      }
      return result
    } catch (error) {
      logger.error('更新全局设置失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 验证配置格式
   */
  validateConfig(config) {
    try {
      // 验证基本结构
      if (!config || typeof config !== 'object') {
        return false
      }

      // 验证必需字段
      if (!Array.isArray(config.instantRules) || !Array.isArray(config.cumulativeRules)) {
        return false
      }

      // 验证规则格式
      for (const rule of config.instantRules) {
        if (!rule.id || !rule.name || !Array.isArray(rule.keywords) || rule.keywords.length === 0) {
          return false
        }
      }

      for (const rule of config.cumulativeRules) {
        if (!rule.id || !rule.name || !Array.isArray(rule.keywords) || rule.keywords.length === 0) {
          return false
        }
        if (typeof rule.threshold !== 'number' || typeof rule.window !== 'number') {
          return false
        }
      }

      return true
    } catch (error) {
      logger.error('配置验证失败:', error)
      return false
    }
  }

  /**
   * 获取限流统计
   */
  async getStatistics() {
    try {
      const client = redis.getClientSafe()

      // 获取当前被限流的账户数
      const limitedAccounts = await client.smembers('smart_rate_limit:limited_accounts')

      // 获取今日触发的限流次数
      const today = new Date().toISOString().split('T')[0]
      const todayKey = `smart_rate_limit:stats:${today}`
      const todayStats = await client.hgetall(todayKey)

      // 统计各规则触发次数
      const ruleStats = {}
      for (const [key, value] of Object.entries(todayStats || {})) {
        if (key.startsWith('rule:')) {
          const ruleId = key.replace('rule:', '')
          ruleStats[ruleId] = parseInt(value) || 0
        }
      }

      return {
        success: true,
        data: {
          currentLimitedAccounts: limitedAccounts.length,
          todayTotalTriggers: parseInt(todayStats?.total || 0),
          ruleStatistics: ruleStats,
          limitedAccountIds: limitedAccounts
        }
      }
    } catch (error) {
      logger.error('获取限流统计失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 清除所有限流
   */
  async clearAllRateLimits() {
    try {
      const client = redis.getClientSafe()

      // 获取所有被限流的账户
      const limitedAccounts = await client.smembers('smart_rate_limit:limited_accounts')

      // 清除每个账户的限流
      for (const accountId of limitedAccounts) {
        await client.del(`smart_rate_limit:limited:${accountId}`)
      }

      // 清空限流账户集合
      await client.del('smart_rate_limit:limited_accounts')

      logger.info(`✅ 清除了 ${limitedAccounts.length} 个账户的限流状态`)

      return {
        success: true,
        message: `成功清除 ${limitedAccounts.length} 个账户的限流状态`
      }
    } catch (error) {
      logger.error('清除所有限流失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 导出配置
   */
  async exportConfig() {
    try {
      const config = (await this.getConfig()).data
      return {
        success: true,
        data: {
          config,
          exportTime: new Date().toISOString(),
          version: '1.0.0'
        }
      }
    } catch (error) {
      logger.error('导出配置失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 导入配置
   */
  async importConfig(configData) {
    try {
      if (!configData || !configData.config) {
        throw new Error('无效的配置数据')
      }

      const { config } = configData

      // 验证配置
      if (!this.validateConfig(config)) {
        throw new Error('配置格式无效')
      }

      // 保存配置
      const result = await this.saveConfig(config)

      if (result.success) {
        return { success: true, message: '配置导入成功' }
      }
      return result
    } catch (error) {
      logger.error('导入配置失败:', error)
      return { success: false, error: error.message }
    }
  }
}

module.exports = new SmartRateLimitConfigService()
