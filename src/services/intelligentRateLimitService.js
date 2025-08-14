const redis = require('../models/redis')
const logger = require('../utils/logger')
const config = require('../../config/config')
const claudeAccountService = require('./claudeAccountService')
const claudeConsoleAccountService = require('./claudeConsoleAccountService')
const geminiAccountService = require('./geminiAccountService')

class IntelligentRateLimitService {
  constructor() {
    this.RATE_LIMIT_PREFIX = 'intelligent_rate_limit:'
    this.RECOVERY_TEST_PREFIX = 'recovery_test:'
    this.FAULT_LOG_PREFIX = 'fault_log:'
    this.ERROR_COUNT_PREFIX = 'error_count:'

    // 从配置读取参数
    this.RECOVERY_TEST_INTERVAL =
      (config.intelligentRateLimit.recoveryTestInterval || 5) * 60 * 1000
    this.RECOVERY_TEST_TIMEOUT = (config.intelligentRateLimit.recoveryTestTimeout || 30) * 1000
    this.MAX_FAULT_LOGS = config.intelligentRateLimit.maxFaultLogs || 1000
    this.FAULT_LOG_RETENTION_DAYS = config.intelligentRateLimit.faultLogRetentionDays || 30

    // 仅在启用时启动定期恢复测试
    if (config.intelligentRateLimit.enabled) {
      this.startRecoveryTestingLoop()
    }
  }

  // 检查是否应该应用智能限流（考虑累积阈值）
  async shouldApplyIntelligentRateLimit(accountId, accountType, errorInfo) {
    try {
      const errorType = this._categorizeError(errorInfo)
      const { immediate, accumulative, accumulativeThreshold } =
        config.intelligentRateLimit.errorCategories

      // 立即触发限流的错误类型
      if (immediate.includes(errorType)) {
        return true
      }

      // 累积型错误需要检查计数
      if (accumulative.includes(errorType)) {
        const errorCount = await this._incrementErrorCount(accountId, accountType, errorType)
        logger.debug(`[调试] 错误计数 ${accountType}:${accountId}:${errorType} = ${errorCount}`)

        if (errorCount >= accumulativeThreshold) {
          logger.warn(
            `[警告] ${accountType} 账户 ${accountId} 达到累积阈值，错误类型：${errorType}（${errorCount}/${accumulativeThreshold}）`
          )
          return true
        }
        return false
      }

      // 如果配置为对任何错误都进行限流
      if (config.intelligentRateLimit.triggerOnAnyError) {
        return true
      }

      return false
    } catch (error) {
      logger.error(`[错误] 检查智能限流条件出错：${error.message}`)
      return false
    }
  }

  // 增加错误计数（5分钟窗口）
  async _incrementErrorCount(accountId, accountType, errorType) {
    try {
      const client = redis.getClientSafe()
      const countKey = `${this.ERROR_COUNT_PREFIX}${accountType}:${accountId}:${errorType}`

      // 增加计数并设置5分钟过期时间
      const count = await client.incr(countKey)
      if (count === 1) {
        await client.expire(countKey, 5 * 60) // 5分钟窗口
      }

      return count
    } catch (error) {
      logger.error(`[错误] 增加错误计数失败：${error.message}`)
      return 0
    }
  }

  // 清理错误计数（在成功请求后调用）
  async clearErrorCounts(accountId, accountType) {
    try {
      const client = redis.getClientSafe()
      const pattern = `${this.ERROR_COUNT_PREFIX}${accountType}:${accountId}:*`
      const keys = await client.keys(pattern)

      if (keys.length > 0) {
        await client.del(...keys)
        logger.debug(`[调试] 已清理 ${accountType} 账户 ${accountId} 的错误计数`)
      }
    } catch (error) {
      logger.error(`[错误] 清理错误计数失败：${error.message}`)
    }
  }

  // 智能限流 - 任何错误都可触发限流
  async markAccountIntelligentRateLimit(accountId, accountType, errorInfo) {
    try {
      const client = redis.getClientSafe()
      const rateLimitKey = `${this.RATE_LIMIT_PREFIX}${accountType}:${accountId}`

      // 记录限流信息
      const rateLimitData = {
        accountId,
        accountType,
        rateLimitedAt: new Date().toISOString(),
        errorInfo: JSON.stringify(errorInfo),
        errorType: this._categorizeError(errorInfo),
        recoveryAttempts: 0,
        lastRecoveryTest: null,
        status: 'rate_limited'
      }

      await client.hset(rateLimitKey, rateLimitData)

      // 记录故障日志
      await this._logFault(accountId, accountType, errorInfo)

      logger.warn(
        `[智能限流] 已对 ${accountType} 账户 ${accountId} 应用限流：${errorInfo.error || errorInfo.message}`
      )

      return { success: true }
    } catch (error) {
      logger.error(`[错误] 应用智能限流失败：${accountId}`, error)
      throw error
    }
  }

  // 移除智能限流状态
  async removeIntelligentRateLimit(accountId, accountType, reason = 'recovery_verified') {
    try {
      const client = redis.getClientSafe()
      const rateLimitKey = `${this.RATE_LIMIT_PREFIX}${accountType}:${accountId}`

      // 获取当前限流信息
      const rateLimitData = await client.hgetall(rateLimitKey)
      if (rateLimitData && Object.keys(rateLimitData).length > 0) {
        // 记录恢复日志
        await this._logRecovery(accountId, accountType, reason, rateLimitData)

        // 删除限流记录
        await client.del(rateLimitKey)

        // 清理错误计数
        await this.clearErrorCounts(accountId, accountType)

        logger.success(`[成功] 已移除 ${accountType} 账户 ${accountId} 的智能限流：${reason}`)
      }

      return { success: true }
    } catch (error) {
      logger.error(`[错误] 移除智能限流失败：${accountId}`, error)
      throw error
    }
  }

  // 检查账户是否处于智能限流状态
  async isIntelligentRateLimited(accountId, accountType) {
    try {
      const client = redis.getClientSafe()
      const rateLimitKey = `${this.RATE_LIMIT_PREFIX}${accountType}:${accountId}`
      const rateLimitData = await client.hgetall(rateLimitKey)

      return rateLimitData && Object.keys(rateLimitData).length > 0
    } catch (error) {
      logger.error(`[错误] 检查智能限流状态失败：${accountId}`, error)
      return false
    }
  }

  // 测试账户服务恢复状态
  async testAccountRecovery(accountId, accountType) {
    try {
      logger.info(`[恢复测试] 正在测试 ${accountType} 账户 ${accountId} 的恢复`)

      // 使用配置的超时时间包装测试
      const testWithTimeout = async () => {
        switch (accountType) {
          case 'claude-official':
            return await claudeAccountService.testAccount(accountId)
          case 'claude-console': {
            // 临时实现：检查账户存在性作为可用性测试
            const consoleAccount = await claudeConsoleAccountService.getAccount(accountId)
            if (consoleAccount && consoleAccount.isActive) {
              return {
                success: true,
                data: { status: 'available', message: '账户存在且处于可用状态' }
              }
            } else {
              return {
                success: false,
                error: '未找到账户或账户不可用'
              }
            }
          }
          case 'gemini': {
            // 临时实现：检查账户存在性作为可用性测试
            const geminiAccount = await geminiAccountService.getAccount(accountId)
            if (geminiAccount && geminiAccount.isActive) {
              return {
                success: true,
                data: { status: 'available', message: '账户存在且处于可用状态' }
              }
            } else {
              return {
                success: false,
                error: '未找到账户或账户不可用'
              }
            }
          }
          default:
            throw new Error(`Unsupported account type: ${accountType}`)
        }
      }

      // 应用配置的超时
      const testResult = await Promise.race([
        testWithTimeout(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('恢复测试超时')), this.RECOVERY_TEST_TIMEOUT)
        )
      ])

      // 更新恢复测试记录
      await this._updateRecoveryTestRecord(accountId, accountType, testResult)

      if (testResult.success) {
        logger.success(`[成功] 恢复测试通过：${accountType} 账户 ${accountId}`)
        // 自动移除限流状态
        await this.removeIntelligentRateLimit(accountId, accountType, 'recovery_test_passed')
        return { recovered: true, testResult }
      } else {
        logger.warn(`[警告] 恢复测试失败：${accountType} 账户 ${accountId}：${testResult.error}`)
        return { recovered: false, testResult }
      }
    } catch (error) {
      logger.error(`[错误] 恢复测试执行出错：${accountType} 账户 ${accountId}`, error)
      return { recovered: false, error: error.message }
    }
  }

  // 启动定期恢复测试循环
  startRecoveryTestingLoop() {
    setInterval(async () => {
      try {
        await this._runRecoveryTests()
      } catch (error) {
        logger.error('[错误] 恢复测试循环出错：', error)
      }
    }, this.RECOVERY_TEST_INTERVAL)

    logger.info('[信息] 智能限流恢复测试循环已启动')
  }

  // 执行所有受限账户的恢复测试
  async _runRecoveryTests() {
    try {
      const client = redis.getClientSafe()
      const keys = await client.keys(`${this.RATE_LIMIT_PREFIX}*`)

      if (keys.length === 0) {
        return
      }

      logger.info(`[信息] 正在对 ${keys.length} 个受限账户进行恢复测试`)

      for (const key of keys) {
        try {
          const rateLimitData = await client.hgetall(key)
          if (!rateLimitData || Object.keys(rateLimitData).length === 0) {
            continue
          }

          const { accountId, accountType, lastRecoveryTest } = rateLimitData

          // 检查是否需要测试（避免过于频繁的测试）
          if (lastRecoveryTest) {
            const lastTestTime = new Date(lastRecoveryTest).getTime()
            const now = Date.now()
            if (now - lastTestTime < this.RECOVERY_TEST_INTERVAL) {
              continue
            }
          }

          // 执行恢复测试
          await this.testAccountRecovery(accountId, accountType)

          // 增加尝试次数
          await client.hincrby(key, 'recoveryAttempts', 1)
        } catch (error) {
          logger.error(`[错误] 账户 ${key} 恢复测试出错：`, error)
        }
      }
    } catch (error) {
      logger.error('[错误] 执行恢复测试时出错：', error)
    }
  }

  // 错误分类
  _categorizeError(errorInfo) {
    const error = errorInfo.error || errorInfo.message || ''
    const statusCode = errorInfo.statusCode || errorInfo.status

    if (statusCode === 429 || error.includes('rate limit')) {
      return 'rate_limit'
    } else if (statusCode === 401 || error.includes('unauthorized') || error.includes('token')) {
      return 'authentication'
    } else if (statusCode >= 500 || error.includes('server error') || error.includes('internal')) {
      return 'server_error'
    } else if (
      error.includes('network') ||
      error.includes('timeout') ||
      error.includes('connection')
    ) {
      return 'network_error'
    } else if (statusCode >= 400 && statusCode < 500) {
      return 'client_error'
    } else {
      return 'unknown'
    }
  }

  // 记录故障日志
  async _logFault(accountId, accountType, errorInfo) {
    try {
      const client = redis.getClientSafe()
      const faultLogKey = `${this.FAULT_LOG_PREFIX}${accountType}:${accountId}`

      const faultEntry = {
        timestamp: new Date().toISOString(),
        accountId,
        accountType,
        errorType: this._categorizeError(errorInfo),
        errorInfo: JSON.stringify(errorInfo),
        severity: this._determineSeverity(errorInfo)
      }

      // 使用列表存储故障日志，保持时间顺序
      await client.lpush(faultLogKey, JSON.stringify(faultEntry))

      // 限制日志数量，删除最老的记录
      await client.ltrim(faultLogKey, 0, this.MAX_FAULT_LOGS - 1)

      // 设置过期时间（使用配置的天数）
      await client.expire(faultLogKey, this.FAULT_LOG_RETENTION_DAYS * 24 * 60 * 60)
    } catch (error) {
      logger.error('[错误] 记录故障日志失败：', error)
    }
  }

  // 记录恢复日志
  async _logRecovery(accountId, accountType, reason, rateLimitData) {
    try {
      const client = redis.getClientSafe()
      const recoveryLogKey = `recovery_log:${accountType}:${accountId}`

      const recoveryEntry = {
        timestamp: new Date().toISOString(),
        accountId,
        accountType,
        reason,
        rateLimitDuration: this._calculateDuration(rateLimitData.rateLimitedAt),
        recoveryAttempts: rateLimitData.recoveryAttempts || 0,
        originalError: rateLimitData.errorInfo
      }

      await client.lpush(recoveryLogKey, JSON.stringify(recoveryEntry))
      await client.ltrim(recoveryLogKey, 0, 99) // 保留最近100条恢复记录
      await client.expire(recoveryLogKey, this.FAULT_LOG_RETENTION_DAYS * 24 * 60 * 60) // 使用配置的天数过期
    } catch (error) {
      logger.error('[错误] 记录恢复日志失败：', error)
    }
  }

  // 更新恢复测试记录
  async _updateRecoveryTestRecord(accountId, accountType, testResult) {
    try {
      const client = redis.getClientSafe()
      const rateLimitKey = `${this.RATE_LIMIT_PREFIX}${accountType}:${accountId}`

      await client.hset(rateLimitKey, {
        lastRecoveryTest: new Date().toISOString(),
        lastTestResult: JSON.stringify(testResult)
      })
    } catch (error) {
      logger.error('[错误] 更新恢复测试记录失败：', error)
    }
  }

  // 确定错误严重程度
  _determineSeverity(errorInfo) {
    const errorType = this._categorizeError(errorInfo)

    switch (errorType) {
      case 'server_error':
        return 'high'
      case 'authentication':
        return 'medium'
      case 'rate_limit':
        return 'medium'
      case 'network_error':
        return 'low'
      default:
        return 'low'
    }
  }

  // 计算持续时间
  _calculateDuration(startTimeISO) {
    try {
      const startTime = new Date(startTimeISO).getTime()
      const now = Date.now()
      return Math.floor((now - startTime) / 1000) // 返回秒数
    } catch (error) {
      return 0
    }
  }

  // 获取限流统计信息
  async getRateLimitStats() {
    try {
      const client = redis.getClientSafe()
      const keys = await client.keys(`${this.RATE_LIMIT_PREFIX}*`)

      const stats = {
        totalRateLimited: keys.length,
        byAccountType: {},
        byErrorType: {},
        avgRecoveryAttempts: 0,
        recentFaults: []
      }

      let totalAttempts = 0

      for (const key of keys) {
        const data = await client.hgetall(key)
        if (!data || Object.keys(data).length === 0) {
          continue
        }

        const { accountType, errorType } = data
        const attempts = parseInt(data.recoveryAttempts) || 0

        stats.byAccountType[accountType] = (stats.byAccountType[accountType] || 0) + 1
        stats.byErrorType[errorType] = (stats.byErrorType[errorType] || 0) + 1
        totalAttempts += attempts
      }

      if (keys.length > 0) {
        stats.avgRecoveryAttempts = Math.round(totalAttempts / keys.length)
      }

      return stats
    } catch (error) {
      logger.error('[错误] 获取限流统计失败：', error)
      return null
    }
  }

  // 获取故障日志
  async getFaultLogs(accountId = null, accountType = null, limit = 50) {
    try {
      const client = redis.getClientSafe()
      let keys

      if (accountId && accountType) {
        keys = [`${this.FAULT_LOG_PREFIX}${accountType}:${accountId}`]
      } else {
        keys = await client.keys(`${this.FAULT_LOG_PREFIX}*`)
      }

      const logs = []

      for (const key of keys) {
        const entries = await client.lrange(key, 0, limit - 1)
        for (const entry of entries) {
          try {
            logs.push(JSON.parse(entry))
          } catch (parseError) {
            logger.warn('[警告] 解析故障日志条目失败：', entry)
          }
        }
      }

      // 按时间排序（最新的在前）
      logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

      return logs.slice(0, limit)
    } catch (error) {
      logger.error('[错误] 获取故障日志失败：', error)
      return []
    }
  }
}

module.exports = new IntelligentRateLimitService()
