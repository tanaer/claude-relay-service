const logger = require('../utils/logger')
const redisClient = require('../models/redis')
const keyLogger = require('../services/keyLogger')
const smartRateLimitConfigService = require('./smartRateLimitConfigService')

/**
 * 智能限流服务
 * 功能：
 * 1. 立即限流：遇到特定错误立即限流
 * 2. 累计触发限流：在X分钟内累计触发N次错误后限流
 * 3. 自动恢复检查：定期检查被限流的账户是否已恢复
 * 4. 支持动态配置：从Redis读取配置，支持实时更新
 */
class SmartRateLimitService {
  constructor() {
    // 动态配置
    this.config = null
    this.configSubscriber = null

    // 初始化
    this.initialize()
  }

  /**
   * 初始化服务
   */
  async initialize() {
    try {
      // 加载配置
      await this.loadConfig()

      // 订阅配置更新
      this.subscribeConfigUpdates()

      // 启动恢复检查器
      if (this.config && this.config.enabled) {
        this.startRecoveryChecker()
      }
    } catch (error) {
      logger.error('智能限流服务初始化失败:', error)
    }
  }

  /**
   * 加载配置
   */
  async loadConfig() {
    try {
      const result = await smartRateLimitConfigService.getConfig()
      if (result.success) {
        this.config = result.data
        logger.info('🚦 Smart Rate Limit Service loaded config:', {
          enabled: this.config.enabled,
          instantRules: this.config.instantRules.length,
          cumulativeRules: this.config.cumulativeRules.length,
          globalSettings: this.config.globalSettings
        })
      } else {
        logger.error('加载智能限流配置失败:', result.error)
      }
    } catch (error) {
      logger.error('加载配置异常:', error)
    }
  }

  /**
   * 订阅配置更新
   */
  subscribeConfigUpdates() {
    try {
      const client = redisClient.getClientSafe()

      // 创建订阅客户端
      this.configSubscriber = client.duplicate()

      this.configSubscriber.on('message', async (channel, _message) => {
        if (channel === 'smart_rate_limit:config_updated') {
          logger.info('📡 收到配置更新通知，重新加载配置')
          await this.loadConfig()

          // 重启恢复检查器
          if (this.recoveryCheckInterval) {
            clearInterval(this.recoveryCheckInterval)
          }
          if (this.config && this.config.enabled) {
            this.startRecoveryChecker()
          }
        }
      })

      this.configSubscriber.subscribe('smart_rate_limit:config_updated')
      logger.info('📡 已订阅配置更新通知')
    } catch (error) {
      logger.error('订阅配置更新失败:', error)
    }
  }

  /**
   * 处理上游API错误
   * @param {Object} params
   * @param {string} params.accountId - 账户ID
   * @param {string} params.accountName - 账户名称
   * @param {string} params.accountType - 账户类型 (claude/openai)
   * @param {number} params.statusCode - HTTP状态码
   * @param {string} params.errorMessage - 错误消息
   * @param {Object} params.errorBody - 错误响应体
   * @param {string} params.apiKeyId - API Key ID
   * @param {string} params.apiKeyName - API Key名称
   * @returns {Promise<{shouldLimit: boolean, reason: string, ruleId?: string, ruleName?: string}>}
   */
  async handleUpstreamError({
    accountId,
    accountName = 'unknown',
    accountType = 'claude',
    statusCode,
    errorMessage = '',
    errorBody = {},
    apiKeyId,
    apiKeyName = 'unknown'
  }) {
    if (!this.config || !this.config.enabled) {
      return { shouldLimit: false, reason: 'disabled' }
    }

    // 组合错误信息用于匹配
    const errorText = `${statusCode} ${errorMessage} ${JSON.stringify(errorBody)}`

    // 1. 检查立即限流规则
    for (const rule of this.config.instantRules) {
      if (!rule.enabled) {
        continue
      }

      const matchedKeyword = this.matchRuleKeywords(
        errorText,
        rule.keywords,
        this.config.globalSettings
      )
      if (matchedKeyword) {
        await this.applyRateLimit({
          accountId,
          accountName,
          accountType,
          reason: `${rule.name}: ${matchedKeyword}`,
          duration: rule.limitDuration || this.config.globalSettings.defaultLimitDuration,
          apiKeyId,
          apiKeyName,
          ruleId: rule.id,
          ruleName: rule.name
        })

        // 记录规则触发统计
        await this.recordRuleTrigger(rule.id)

        return {
          shouldLimit: true,
          reason: `instant_limit:${matchedKeyword}`,
          ruleId: rule.id,
          ruleName: rule.name
        }
      }
    }

    // 2. 检查累计触发限流规则
    for (const rule of this.config.cumulativeRules) {
      if (!rule.enabled) {
        continue
      }

      const matchedKeyword = this.matchRuleKeywords(
        errorText,
        rule.keywords,
        this.config.globalSettings
      )
      if (matchedKeyword) {
        const shouldLimit = await this.checkCumulativeErrors({
          accountId,
          accountName,
          accountType,
          errorType: matchedKeyword,
          threshold: rule.threshold,
          window: rule.window,
          limitDuration: rule.limitDuration || this.config.globalSettings.defaultLimitDuration,
          apiKeyId,
          apiKeyName,
          ruleId: rule.id,
          ruleName: rule.name
        })

        if (shouldLimit) {
          // 记录规则触发统计
          await this.recordRuleTrigger(rule.id)

          return {
            shouldLimit: true,
            reason: `cumulative_limit:${matchedKeyword}`,
            ruleId: rule.id,
            ruleName: rule.name
          }
        }
      }
    }

    return { shouldLimit: false, reason: 'no_match' }
  }

  /**
   * 匹配规则关键词
   * @param {string} text - 要匹配的文本
   * @param {Array} keywords - 关键词数组
   * @param {Object} settings - 全局设置
   * @returns {string|null} 匹配到的关键词
   */
  matchRuleKeywords(text, keywords, settings = {}) {
    const { matchMode = 'contains', caseSensitive = false } = settings

    const processedText = caseSensitive ? text : text.toLowerCase()

    for (const keyword of keywords) {
      const processedKeyword = caseSensitive ? keyword : keyword.toLowerCase()

      switch (matchMode) {
        case 'exact':
          if (processedText === processedKeyword) {
            return keyword
          }
          break

        case 'regex':
          try {
            const regex = new RegExp(processedKeyword, caseSensitive ? 'g' : 'gi')
            if (regex.test(processedText)) {
              return keyword
            }
          } catch (e) {
            // 如果正则表达式无效，退回到contains模式
            if (processedText.includes(processedKeyword)) {
              return keyword
            }
          }
          break

        case 'contains':
        default:
          if (processedText.includes(processedKeyword)) {
            return keyword
          }
          break
      }
    }

    return null
  }

  /**
   * 记录规则触发统计
   * @param {string} ruleId - 规则ID
   */
  async recordRuleTrigger(ruleId) {
    try {
      const client = redisClient.getClientSafe()
      const today = new Date().toISOString().split('T')[0]
      const statsKey = `smart_rate_limit:stats:${today}`

      // 增加总计数
      await client.hincrby(statsKey, 'total', 1)

      // 增加规则的触发次数
      await client.hincrby(statsKey, `rule:${ruleId}`, 1)

      // 设置过期时间（7天）
      await client.expire(statsKey, 7 * 24 * 60 * 60)
    } catch (error) {
      logger.error(`记录规则触发统计失败 [${ruleId}]:`, error)
    }
  }

  /**
   * 检查累计错误并决定是否限流
   */
  async checkCumulativeErrors({
    accountId,
    accountName,
    accountType,
    errorType,
    threshold,
    window,
    limitDuration,
    apiKeyId,
    apiKeyName,
    ruleId,
    ruleName
  }) {
    const key = `smart_rate_limit:cumulative:${accountId}:${ruleId}`
    const now = Date.now()
    const windowStart = now - window * 1000

    try {
      // 添加当前错误到有序集合（使用时间戳作为分数）
      await redisClient.zadd(key, now, `${now}:${errorType}`)

      // 删除窗口外的旧错误
      await redisClient.zremrangebyscore(key, '-inf', windowStart)

      // 统计窗口内的错误数量
      const errorCount = await redisClient.zcard(key)

      // 设置过期时间
      await redisClient.expire(key, window)

      logger.debug(
        `📊 [${ruleName}] Cumulative errors for ${accountName}: ${errorCount}/${threshold} in ${window}s window`
      )

      // 检查是否超过阈值
      if (errorCount >= threshold) {
        // 应用限流
        await this.applyRateLimit({
          accountId,
          accountName,
          accountType,
          reason: `${ruleName}: ${errorCount} ${errorType} errors in ${window}s`,
          duration: limitDuration,
          apiKeyId,
          apiKeyName,
          ruleId,
          ruleName
        })

        // 清空累计错误（避免重复触发）
        await redisClient.del(key)

        return true
      }

      return false
    } catch (error) {
      logger.error('❌ Error checking cumulative errors:', error)
      return false
    }
  }

  /**
   * 应用限流
   */
  async applyRateLimit({
    accountId,
    accountName,
    accountType,
    reason,
    duration,
    apiKeyId,
    apiKeyName
  }) {
    const limitKey = `smart_rate_limit:limited:${accountId}`
    const limitInfo = {
      accountId,
      accountName,
      accountType,
      reason,
      startTime: new Date().toISOString(),
      duration,
      apiKeyId,
      apiKeyName
    }

    try {
      // 设置限流信息
      await redisClient.hset(limitKey, limitInfo)
      await redisClient.expire(limitKey, duration)

      // 添加到限流账户集合（用于恢复检查）
      await redisClient.sadd('smart_rate_limit:limited_accounts', accountId)

      // 记录关键日志
      const logMessage = `🚫 Rate limit applied to ${accountType} account: ${accountName} (${accountId}) for ${duration}s. Reason: ${reason}`
      logger.warn(logMessage)

      // 记录到关键日志
      await keyLogger.log({
        type: 'RATE_LIMIT_APPLIED',
        level: 'warning',
        message: logMessage,
        accountId,
        accountName,
        accountType,
        apiKeyId,
        apiKeyName,
        reason,
        duration
      })
    } catch (error) {
      logger.error('❌ Error applying rate limit:', error)
    }
  }

  /**
   * 检查账户是否被限流
   */
  async isRateLimited(accountId) {
    if (!this.config.enabled) {
      return false
    }

    const limitKey = `smart_rate_limit:limited:${accountId}`
    const exists = await redisClient.exists(limitKey)
    return exists > 0
  }

  /**
   * 获取限流信息
   */
  async getRateLimitInfo(accountId) {
    const limitKey = `smart_rate_limit:limited:${accountId}`
    const info = await redisClient.hgetall(limitKey)

    if (info && Object.keys(info).length > 0) {
      const ttl = await redisClient.ttl(limitKey)
      return {
        ...info,
        remainingSeconds: ttl > 0 ? ttl : 0
      }
    }

    return null
  }

  /**
   * 手动解除限流
   */
  async removeRateLimit(accountId) {
    const limitKey = `smart_rate_limit:limited:${accountId}`
    const info = await this.getRateLimitInfo(accountId)

    if (info) {
      await redisClient.del(limitKey)
      await redisClient.srem('smart_rate_limit:limited_accounts', accountId)

      const logMessage = `✅ Rate limit manually removed from account: ${info.accountName} (${accountId})`
      logger.info(logMessage)

      await keyLogger.log({
        type: 'RATE_LIMIT_REMOVED',
        level: 'info',
        message: logMessage,
        accountId,
        accountName: info.accountName,
        accountType: info.accountType
      })

      return true
    }

    return false
  }

  /**
   * 启动恢复检查器
   */
  startRecoveryChecker() {
    const interval = this.config.globalSettings.recoveryCheckInterval

    // 使用立即执行的定时器
    const runCheck = async () => {
      try {
        await this.checkRecovery()
      } catch (error) {
        logger.error('❌ Error in recovery checker:', error)
      }
    }

    // 首次延迟执行
    setTimeout(runCheck, interval * 1000)

    // 定期执行
    this.recoveryCheckInterval = setInterval(runCheck, interval * 1000)

    logger.info(`🔄 Smart rate limit recovery checker started (interval: ${interval}s)`)
  }

  /**
   * 检查被限流账户是否已恢复
   */
  async checkRecovery() {
    try {
      // 获取所有被限流的账户
      const limitedAccounts = await redisClient.smembers('smart_rate_limit:limited_accounts')

      if (limitedAccounts.length === 0) {
        return
      }

      logger.debug(`🔍 Checking recovery for ${limitedAccounts.length} rate-limited accounts`)

      // 批量检查账户
      const batchSize = Math.min(
        this.config.globalSettings.recoveryCheckBatchSize,
        limitedAccounts.length
      )
      const accountsToCheck = limitedAccounts.slice(0, batchSize)

      for (const accountId of accountsToCheck) {
        await this.checkAccountRecovery(accountId)
      }
    } catch (error) {
      logger.error('❌ Error checking recovery:', error)
    }
  }

  /**
   * 检查单个账户是否已恢复
   */
  async checkAccountRecovery(accountId) {
    try {
      const limitKey = `smart_rate_limit:limited:${accountId}`
      const info = await redisClient.hgetall(limitKey)

      // 如果限流信息不存在，从集合中移除
      if (!info || Object.keys(info).length === 0) {
        await redisClient.srem('smart_rate_limit:limited_accounts', accountId)
        return
      }

      // 检查是否已过期（Redis应该自动处理，这里是双重保险）
      const ttl = await redisClient.ttl(limitKey)
      if (ttl <= 0) {
        await redisClient.del(limitKey)
        await redisClient.srem('smart_rate_limit:limited_accounts', accountId)

        const logMessage = `✅ Rate limit auto-expired for account: ${info.accountName} (${accountId})`
        logger.info(logMessage)

        await keyLogger.log({
          type: 'RATE_LIMIT_EXPIRED',
          level: 'info',
          message: logMessage,
          accountId,
          accountName: info.accountName,
          accountType: info.accountType
        })
      }

      // 这里可以添加主动测试账户是否恢复的逻辑
      // 例如：发送一个测试请求到上游API
      // 如果成功，则提前解除限流
    } catch (error) {
      logger.error(`❌ Error checking recovery for account ${accountId}:`, error)
    }
  }

  /**
   * 获取所有被限流的账户
   */
  async getAllRateLimitedAccounts() {
    try {
      const accountIds = await redisClient.smembers('smart_rate_limit:limited_accounts')
      const accounts = []

      for (const accountId of accountIds) {
        const info = await this.getRateLimitInfo(accountId)
        if (info) {
          accounts.push(info)
        }
      }

      return accounts
    } catch (error) {
      logger.error('❌ Error getting rate-limited accounts:', error)
      return []
    }
  }

  /**
   * 获取限流统计信息
   */
  async getStatistics() {
    try {
      const limitedAccounts = await redisClient.smembers('smart_rate_limit:limited_accounts')
      const stats = {
        enabled: this.config.enabled,
        limitedAccountsCount: limitedAccounts.length,
        config: {
          instantRules: this.config.instantRules.length,
          cumulativeRules: this.config.cumulativeRules.length,
          globalSettings: this.config.globalSettings
        },
        limitedAccounts: await this.getAllRateLimitedAccounts()
      }

      return stats
    } catch (error) {
      logger.error('❌ Error getting statistics:', error)
      return null
    }
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig
    }

    logger.info('📝 Smart rate limit config updated:', this.config)

    // 重启恢复检查器
    if (this.recoveryCheckInterval) {
      clearInterval(this.recoveryCheckInterval)
    }

    if (this.config.enabled) {
      this.startRecoveryChecker()
    }
  }

  /**
   * 停止服务
   */
  stop() {
    if (this.recoveryCheckInterval) {
      clearInterval(this.recoveryCheckInterval)
      this.recoveryCheckInterval = null
      logger.info('🛑 Smart rate limit recovery checker stopped')
    }
  }
}

// 创建单例
const smartRateLimitService = new SmartRateLimitService()

module.exports = smartRateLimitService
