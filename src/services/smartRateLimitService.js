const logger = require('../utils/logger')
const redisClient = require('../models/redis')
const keyLogsService = require('./keyLogsService')
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
    this._initialized = false
  }

  /**
   * 初始化服务
   */
  async initialize() {
    try {
      if (this._initialized) {
        return
      }
      // 加载配置
      await this.loadConfig()

      // 订阅配置更新
      this.subscribeConfigUpdates()

      // 启动恢复检查器
      if (this.config && this.config.enabled) {
        this.startRecoveryChecker()
      }
      this._initialized = true
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
   * @param {boolean} params.isFromUpstream - 是否来自上游API（true：上游API错误，false或undefined：本地中间件错误）
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
    apiKeyName = 'unknown',
    isFromUpstream = true
  }) {
    if (!this.config || !this.config.enabled) {
      return { shouldLimit: false, reason: 'disabled' }
    }

    // 如果不是来自上游的错误，跳过智能限流处理
    // 例如：API Key 费用限制、并发限制等本地限制产生的 429 错误
    if (!isFromUpstream) {
      logger.debug(
        `[智能限流] 跳过本地中间件错误处理: ${statusCode} ${errorMessage} - API Key: ${apiKeyName}`
      )
      return { shouldLimit: false, reason: 'not_upstream_error' }
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
    apiKeyName,
    ruleId,
    ruleName
  }) {
    const limitKey = `smart_rate_limit:limited:${accountId}`

    // 检查账户是否配置了上游重置时间
    let finalDuration = duration
    let upstreamResetTime = null

    try {
      upstreamResetTime = await this.getAccountUpstreamResetTime(accountId, accountType)
      if (upstreamResetTime) {
        const now = new Date()
        const resetTime = this.parseUpstreamResetTime(upstreamResetTime)

        if (resetTime && resetTime > now) {
          // 计算到重置时间的秒数
          finalDuration = Math.ceil((resetTime.getTime() - now.getTime()) / 1000)
          logger.info(
            `⏰ Using upstream reset time for account ${accountId}: ${resetTime.toISOString()} (${finalDuration}s)`
          )
        }
      }
    } catch (error) {
      logger.warn(`⚠️ Error checking upstream reset time for account ${accountId}:`, error)
    }

    const limitInfo = {
      accountId,
      accountName,
      accountType,
      reason,
      startTime: new Date().toISOString(),
      duration: finalDuration,
      originalDuration: duration, // 保存原始持续时间
      upstreamResetTime: upstreamResetTime || '', // 保存上游重置时间配置
      apiKeyId,
      apiKeyName,
      ruleId: ruleId || 'manual',
      ruleName: ruleName || '手动'
    }

    try {
      // 设置限流信息
      await redisClient.hset(limitKey, limitInfo)
      await redisClient.expire(limitKey, finalDuration)

      // 添加到限流账户集合（用于恢复检查）
      await redisClient.sadd('smart_rate_limit:limited_accounts', accountId)

      // 记录关键日志
      const logMessage = `🚫 Rate limit applied to ${accountType} account: ${accountName} (${accountId}) for ${finalDuration}s. Reason: ${reason}${upstreamResetTime ? ` (upstream reset: ${upstreamResetTime})` : ''}`
      logger.warn(logMessage)

      // 记录到关键日志
      await keyLogsService.logRateLimit(accountId, accountType, 'triggered', {
        accountName,
        reason,
        duration: finalDuration,
        originalDuration: duration,
        upstreamResetTime,
        apiKeyId,
        apiKeyName
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

      await keyLogsService.logRateLimit(accountId, info.accountType, 'removed', {
        accountName: info.accountName,
        reason: 'manually_removed'
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

        await keyLogsService.logRateLimit(accountId, info.accountType, 'expired', {
          accountName: info.accountName,
          reason: 'auto_expired'
        })

        return // TTL已过期，无需进一步检查
      }

      // 检查上游重置时间
      if (info.upstreamResetTime) {
        try {
          const resetTime = this.parseUpstreamResetTime(info.upstreamResetTime)
          const now = new Date()

          if (resetTime && now >= resetTime) {
            // 上游重置时间已到，自动解除限流
            await redisClient.del(limitKey)
            await redisClient.srem('smart_rate_limit:limited_accounts', accountId)

            const logMessage = `⏰ Rate limit auto-removed by upstream reset time: ${info.accountName} (${accountId}) at ${resetTime.toISOString()}`
            logger.info(logMessage)

            await keyLogsService.logRateLimit(accountId, info.accountType, 'upstream_reset', {
              accountName: info.accountName,
              reason: 'upstream_reset_time',
              resetTime: resetTime.toISOString(),
              originalResetConfig: info.upstreamResetTime
            })

            return // 已通过上游重置时间解除限流，无需进一步检查
          } else if (resetTime) {
            logger.debug(
              `⏰ Upstream reset time not yet reached for account ${accountId}: ${resetTime.toISOString()}`
            )
          }
        } catch (error) {
          logger.warn(`⚠️ Error checking upstream reset time for account ${accountId}:`, error)
        }
      }

      // 主动测试账户是否已恢复（模拟Claude Code客户端请求）
      if (info.accountType === 'claude-oauth' || info.accountType === 'claude') {
        await this.testAccountRecovery(accountId, info)
      } else if (info.accountType === 'claude-console') {
        // 对于console账户，暂时只依赖TTL过期
        logger.debug(`⏳ Console account ${accountId} recovery depends on TTL expiration`)
      }
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
          // 转换为前端期望的数据结构
          const account = {
            accountId: info.accountId,
            accountName: info.accountName,
            accountType: info.accountType,
            reason: info.reason,
            startTime: info.startTime,
            duration: parseInt(info.duration) || 0,
            remainingSeconds: info.remainingSeconds,
            apiKeyId: info.apiKeyId,
            apiKeyName: info.apiKeyName,
            ruleId: info.ruleId,
            ruleName: info.ruleName,
            upstreamResetTime: info.upstreamResetTime || '', // 添加上游重置时间
            // 前端期望的字段
            limitedAt: info.startTime, // 限流开始时间
            expiresAt: this.calculateExpiresAt(info.startTime, info.duration), // 计算过期时间
            triggeredRule: info.ruleName || this.extractRuleFromReason(info.reason) // 优先使用存储的规则名
          }
          accounts.push(account)
        }
      }

      return accounts
    } catch (error) {
      logger.error('❌ Error getting rate-limited accounts:', error)
      return []
    }
  }

  /**
   * 计算过期时间
   */
  calculateExpiresAt(startTime, duration) {
    if (!startTime || !duration) {
      return null
    }
    try {
      const start = new Date(startTime)
      const expires = new Date(start.getTime() + duration * 1000)
      return expires.toISOString()
    } catch (error) {
      return null
    }
  }

  /**
   * 从限流原因中提取规则名称
   */
  extractRuleFromReason(reason) {
    if (!reason) {
      return '未知'
    }

    // 如果原因包含规则名称（格式：规则名: 详细原因）
    if (reason.includes(':')) {
      const parts = reason.split(':')
      if (parts.length > 1) {
        return parts[0].trim()
      }
    }

    // 检查是否是手动操作
    if (reason.includes('手动') || reason.includes('manually')) {
      return '手动'
    }

    // 检查是否是自动过期
    if (reason.includes('auto_expired') || reason.includes('过期')) {
      return '自动过期'
    }

    // 检查是否是提前恢复
    if (reason.includes('early_recovery') || reason.includes('提前恢复')) {
      return '提前恢复'
    }

    return '智能限流'
  }

  /**
   * 获取限流统计信息
   */
  async getStatistics() {
    try {
      const limitedAccounts = await redisClient.smembers('smart_rate_limit:limited_accounts')

      // 获取今日统计数据
      const today = new Date().toISOString().split('T')[0]
      const todayStatsKey = `smart_rate_limit:stats:${today}`
      const todayStats = await redisClient.hgetall(todayStatsKey)

      // 获取过去7天的统计数据
      const last7DaysStats = await this.getLast7DaysStats()

      // 分析规则触发统计
      const ruleStats = {}
      const totalTriggers = parseInt(todayStats.total) || 0
      let instantTriggers = 0
      let cumulativeTriggers = 0

      // 统计各规则的触发次数
      for (const [key, value] of Object.entries(todayStats)) {
        if (key.startsWith('rule:')) {
          const ruleId = key.substring(5) // 移除 'rule:' 前缀
          const triggerCount = parseInt(value) || 0
          ruleStats[ruleId] = triggerCount

          // 根据规则类型分类统计
          const rule = this.findRuleById(ruleId)
          if (rule) {
            if (rule.type === 'instant') {
              instantTriggers += triggerCount
            } else if (rule.type === 'cumulative') {
              cumulativeTriggers += triggerCount
            }
          }
        }
      }

      const stats = {
        enabled: this.config.enabled,
        limitedAccountsCount: limitedAccounts.length,

        // 今日统计
        totalTriggers,
        instantTriggers,
        cumulativeTriggers,

        // 规则统计
        ruleStats,

        // 过去7天统计
        last7DaysStats,

        // 配置信息
        config: {
          instantRules: this.config.instantRules.length,
          cumulativeRules: this.config.cumulativeRules.length,
          globalSettings: this.config.globalSettings
        },

        // 被限流账户
        limitedAccounts: await this.getAllRateLimitedAccounts()
      }

      return stats
    } catch (error) {
      logger.error('❌ Error getting statistics:', error)
      return null
    }
  }

  /**
   * 获取过去7天的统计数据
   */
  async getLast7DaysStats() {
    try {
      const stats = []
      const now = new Date()

      for (let i = 6; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        const dateStr = date.toISOString().split('T')[0]
        const statsKey = `smart_rate_limit:stats:${dateStr}`

        const dayStats = await redisClient.hgetall(statsKey)
        const total = parseInt(dayStats.total) || 0

        stats.push({
          date: dateStr,
          total,
          dayName: date.toLocaleDateString('zh-CN', { weekday: 'short' })
        })
      }

      return stats
    } catch (error) {
      logger.error('❌ Error getting last 7 days stats:', error)
      return []
    }
  }

  /**
   * 根据ID查找规则
   */
  findRuleById(ruleId) {
    if (!this.config) {
      return null
    }

    // 在立即限流规则中查找
    for (const rule of this.config.instantRules) {
      if (rule.id === ruleId) {
        return { ...rule, type: 'instant' }
      }
    }

    // 在累计触发规则中查找
    for (const rule of this.config.cumulativeRules) {
      if (rule.id === ruleId) {
        return { ...rule, type: 'cumulative' }
      }
    }

    return null
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
   * 测试账户恢复（模拟Claude Code客户端请求）
   */
  async testAccountRecovery(accountId, rateLimitInfo) {
    try {
      logger.debug(`🧪 Testing recovery for account: ${rateLimitInfo.accountName} (${accountId})`)

      // 动态引入claudeAccountService以避免循环依赖
      const claudeAccountService = require('./claudeAccountService')

      // 发送测试请求（模拟Claude Code客户端）
      const testResult = await claudeAccountService.testAccount(accountId)

      if (testResult.success) {
        // 账户已恢复，提前解除限流
        logger.info(`🎉 Account recovered early: ${rateLimitInfo.accountName} (${accountId})`)

        // 删除限流记录
        const limitKey = `smart_rate_limit:limited:${accountId}`
        await redisClient.del(limitKey)
        await redisClient.srem('smart_rate_limit:limited_accounts', accountId)

        // 记录恢复日志
        await keyLogsService.logRateLimit(accountId, rateLimitInfo.accountType, 'recovered', {
          accountName: rateLimitInfo.accountName,
          reason: 'early_recovery_test_success',
          testResult: {
            model: testResult.data?.model,
            tokenValid: testResult.data?.tokenValid
          }
        })

        const logMessage = `✅ Rate limit removed early due to successful test: ${rateLimitInfo.accountName} (${accountId})`
        logger.info(logMessage)
      } else {
        // 仍然有问题，保持限流状态
        logger.debug(
          `⏳ Account still limited: ${rateLimitInfo.accountName} (${accountId}) - ${testResult.error}`
        )

        // 检查是否是新的错误类型，可能需要延长限流
        if (testResult.isRateLimit) {
          logger.warn(`🚫 Account still rate limited: ${rateLimitInfo.accountName} (${accountId})`)
        } else if (testResult.isUnauthorized) {
          logger.warn(`🔐 Account unauthorized: ${rateLimitInfo.accountName} (${accountId})`)
        }
      }
    } catch (error) {
      logger.error(`❌ Error testing recovery for account ${accountId}:`, error)
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

  /**
   * 获取账户的上游重置时间配置
   */
  async getAccountUpstreamResetTime(accountId, accountType) {
    try {
      const redis = require('../models/redis')

      if (accountType === 'claude' || accountType === 'claude-official') {
        // Claude OAuth 账户
        const account = await redis.getClaudeAccount(accountId)
        return account?.upstreamResetTime || null
      } else if (accountType === 'claude-console') {
        // Claude Console 账户
        const claudeConsoleAccountService = require('./claudeConsoleAccountService')
        const account = await claudeConsoleAccountService.getAccount(accountId)
        return account?.upstreamResetTime || null
      } else if (accountType === 'bedrock') {
        // Bedrock 账户
        const bedrockAccountService = require('./bedrockAccountService')
        const accountResult = await bedrockAccountService.getAccount(accountId)
        if (accountResult.success) {
          return accountResult.data.upstreamResetTime || null
        }
      }

      return null
    } catch (error) {
      logger.error(`Error getting upstream reset time for account ${accountId}:`, error)
      return null
    }
  }

  /**
   * 解析上游重置时间字符串
   * 支持格式：
   * - HH:MM (每日重置，如 "14:30")
   * - YYYY-MM-DD HH:MM:SS (特定时间，如 "2024-08-18 14:30:00")
   */
  parseUpstreamResetTime(resetTimeStr) {
    if (!resetTimeStr || typeof resetTimeStr !== 'string') {
      return null
    }

    resetTimeStr = resetTimeStr.trim()

    try {
      // 检查是否是 HH:MM 格式（每日重置）
      if (/^\d{1,2}:\d{2}$/.test(resetTimeStr)) {
        const [hours, minutes] = resetTimeStr.split(':').map(Number)

        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
          logger.warn(`Invalid time format: ${resetTimeStr}`)
          return null
        }

        const now = new Date()
        const resetTime = new Date()
        resetTime.setHours(hours, minutes, 0, 0)

        // 如果今天的重置时间已过，设置为明天
        if (resetTime <= now) {
          resetTime.setDate(resetTime.getDate() + 1)
        }

        return resetTime
      }

      // 检查是否是 YYYY-MM-DD HH:MM:SS 格式（特定时间）
      if (/^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{2}$/.test(resetTimeStr)) {
        const resetTime = new Date(resetTimeStr)

        if (isNaN(resetTime.getTime())) {
          logger.warn(`Invalid datetime format: ${resetTimeStr}`)
          return null
        }

        return resetTime
      }

      // 尝试直接解析为Date
      const resetTime = new Date(resetTimeStr)
      if (!isNaN(resetTime.getTime())) {
        return resetTime
      }

      logger.warn(`Unsupported upstream reset time format: ${resetTimeStr}`)
      return null
    } catch (error) {
      logger.error(`Error parsing upstream reset time "${resetTimeStr}":`, error)
      return null
    }
  }
}

// 创建单例
const smartRateLimitService = new SmartRateLimitService()

module.exports = smartRateLimitService
