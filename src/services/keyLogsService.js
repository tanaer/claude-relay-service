const redis = require('../models/redis')
const logger = require('../utils/logger')

class KeyLogsService {
  constructor() {
    this.KEY_LOGS_PREFIX = 'key_logs:'
    this.KEY_LOGS_LIST = 'key_logs_list'
    this.KEY_LOGS_INDEX = 'key_logs_index:'
    this.MAX_LOGS = 10000 // 最大保留日志数量
    this.LOG_RETENTION_DAYS = 30 // 日志保留天数
    this.UPSTREAM_ERROR_PREFIX = 'upstream_error:'
    this.UPSTREAM_ERROR_DAILY_PREFIX = 'upstream_error:daily:'
    this.APIKEY_ERROR_PREFIX = 'apikey_error:' // API Key 报错前缀
    this.APIKEY_ERROR_DAILY_PREFIX = 'apikey_error:daily:' // API Key 每日报错前缀
  }

  /**
   * 记录关键日志
   * @param {Object} logData 日志数据
   * @param {string} logData.type 日志类型 (rate_limit, template_switch, account_status, redemption, system, upstream_error, api_error)
   * @param {string} logData.level 日志级别 (error, warn, info, success)
   * @param {string} logData.title 日志标题
   * @param {string} logData.message 日志消息
   * @param {Object} logData.details 详细信息对象
   * @param {string} logData.source 日志来源 (可选)
   * @param {string} logData.apiKeyId API Key ID (用于 api_error 类型)
   * @param {string} logData.apiKeyName API Key 名称 (用于 api_error 类型)
   */
  async logKeyEvent(logData) {
    try {
      const logId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const timestamp = new Date().toISOString()

      const logEntry = {
        id: logId,
        type: logData.type,
        level: logData.level || 'info',
        title: logData.title,
        message: logData.message,
        details: logData.details || {},
        source: logData.source || 'system',
        timestamp,
        apiKeyId: logData.apiKeyId || null,
        apiKeyName: logData.apiKeyName || null
      }

      // 存储日志详细信息
      await redis.client.hset(`${this.KEY_LOGS_PREFIX}${logId}`, logEntry)

      // 添加到有序列表（按时间戳排序）
      await redis.client.zadd(this.KEY_LOGS_LIST, Date.now(), logId)

      // 添加到类型索引
      await redis.client.zadd(`${this.KEY_LOGS_INDEX}${logData.type}`, Date.now(), logId)

      // 清理旧日志
      await this.cleanupOldLogs()

      logger.debug(`[关键日志] 记录成功: ${logData.type} - ${logData.title}`)
    } catch (error) {
      logger.error(`[关键日志] 记录失败: ${error.message}`)
    }
  }

  /**
   * 获取关键日志列表
   * @param {Object} options 查询选项
   * @param {string} options.type 日志类型过滤
   * @param {number} options.page 页码
   * @param {number} options.pageSize 每页大小
   * @param {string} options.level 日志级别过滤
   * @param {string} options.apiKeyName API Key 名称过滤
   * @returns {Object} 包含日志列表和分页信息
   */
  async getKeyLogs(options = {}) {
    try {
      const { type, page = 1, pageSize = 20, level, apiKeyName } = options

      // 确定使用哪个索引
      const indexKey = type ? `${this.KEY_LOGS_INDEX}${type}` : this.KEY_LOGS_LIST

      // 获取所有匹配类型的日志ID（按时间倒序）
      const allLogIds = await redis.client.zrevrange(indexKey, 0, -1)

      // 获取所有日志详细信息并进行筛选
      const filteredLogs = []
      for (const logId of allLogIds) {
        const logData = await redis.client.hgetall(`${this.KEY_LOGS_PREFIX}${logId}`)
        if (logData && Object.keys(logData).length > 0) {
          // 解析 details 字段
          if (logData.details && typeof logData.details === 'string') {
            try {
              logData.details = JSON.parse(logData.details)
            } catch (e) {
              logData.details = {}
            }
          }

          // 应用所有过滤条件
          let shouldInclude = true

          // 级别过滤
          if (level && logData.level !== level) {
            shouldInclude = false
          }

          // API Key 名称过滤
          if (apiKeyName && shouldInclude) {
            if (
              !logData.apiKeyName ||
              !logData.apiKeyName.toLowerCase().includes(apiKeyName.toLowerCase())
            ) {
              shouldInclude = false
            }
          }

          if (shouldInclude) {
            filteredLogs.push(logData)
          }
        }
      }

      // 计算分页
      const totalCount = filteredLogs.length
      const totalPages = Math.ceil(totalCount / pageSize)
      const start = (page - 1) * pageSize
      const end = start + pageSize
      const paginatedLogs = filteredLogs.slice(start, end)

      return {
        logs: paginatedLogs,
        pagination: {
          currentPage: page,
          pageSize,
          totalCount,
          totalPages
        }
      }
    } catch (error) {
      logger.error(`[关键日志] 获取日志失败: ${error.message}`)
      return {
        logs: [],
        pagination: {
          currentPage: 1,
          pageSize: 20,
          totalCount: 0,
          totalPages: 0
        }
      }
    }
  }

  /**
   * 记录 API 错误日志
   * @param {Object} errorData 错误数据
   * @param {string} errorData.apiKeyId API Key ID
   * @param {string} errorData.apiKeyName API Key 名称
   * @param {string} errorData.error 错误信息
   * @param {Object} errorData.request 请求详情
   * @param {string} errorData.level 错误级别 (error, warn)
   */
  async logApiError(errorData) {
    await this.logKeyEvent({
      type: 'api_error',
      level: errorData.level || 'error',
      title: `API 请求错误`,
      message: errorData.error,
      details: {
        request: errorData.request || {},
        timestamp: new Date().toISOString()
      },
      source: 'api',
      apiKeyId: errorData.apiKeyId,
      apiKeyName: errorData.apiKeyName
    })
  }

  /**
   * 获取日志统计信息
   * @returns {Object} 日志统计
   */
  async getLogStats() {
    try {
      const stats = {
        total: 0,
        byType: {},
        byLevel: {},
        recent24h: 0
      }

      // 获取总数
      stats.total = await redis.client.zcard(this.KEY_LOGS_LIST)

      // 统计各类型数量
      const types = [
        'rate_limit',
        'template_switch',
        'account_status',
        'redemption',
        'system',
        'upstream_error'
      ]
      for (const type of types) {
        const count = await redis.client.zcard(`${this.KEY_LOGS_INDEX}${type}`)
        stats.byType[type] = count
      }

      // 统计最近24小时的日志
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
      stats.recent24h = await redis.client.zcount(this.KEY_LOGS_LIST, oneDayAgo, '+inf')

      return stats
    } catch (error) {
      logger.error(`[关键日志] 获取统计信息失败: ${error.message}`)
      return {
        total: 0,
        byType: {},
        byLevel: {},
        recent24h: 0
      }
    }
  }

  /**
   * 清理旧日志
   */
  async cleanupOldLogs() {
    try {
      // 清理超过最大数量的日志
      const totalCount = await redis.client.zcard(this.KEY_LOGS_LIST)
      if (totalCount > this.MAX_LOGS) {
        const removeCount = totalCount - this.MAX_LOGS
        const oldLogIds = await redis.client.zrange(this.KEY_LOGS_LIST, 0, removeCount - 1)

        // 删除旧日志
        for (const logId of oldLogIds) {
          await redis.client.del(`${this.KEY_LOGS_PREFIX}${logId}`)
        }

        // 从有序集合中移除
        await redis.client.zremrangebyrank(this.KEY_LOGS_LIST, 0, removeCount - 1)

        // 从类型索引中移除
        const types = [
          'rate_limit',
          'template_switch',
          'account_status',
          'redemption',
          'system',
          'upstream_error'
        ]
        for (const type of types) {
          for (const logId of oldLogIds) {
            await redis.client.zrem(`${this.KEY_LOGS_INDEX}${type}`, logId)
          }
        }

        logger.info(`[关键日志] 清理了 ${removeCount} 条旧日志`)
      }

      // 清理超过保留时间的日志
      const retentionTime = Date.now() - this.LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
      const expiredLogIds = await redis.client.zrangebyscore(
        this.KEY_LOGS_LIST,
        '-inf',
        retentionTime
      )

      if (expiredLogIds.length > 0) {
        // 删除过期日志
        for (const logId of expiredLogIds) {
          await redis.client.del(`${this.KEY_LOGS_PREFIX}${logId}`)
        }

        // 从有序集合中移除
        await redis.client.zremrangebyscore(this.KEY_LOGS_LIST, '-inf', retentionTime)

        // 从类型索引中移除
        const types = [
          'rate_limit',
          'template_switch',
          'account_status',
          'redemption',
          'system',
          'upstream_error'
        ]
        for (const type of types) {
          for (const logId of expiredLogIds) {
            await redis.client.zrem(`${this.KEY_LOGS_INDEX}${type}`, logId)
          }
        }

        logger.info(`[关键日志] 清理了 ${expiredLogIds.length} 条过期日志`)
      }
    } catch (error) {
      logger.error(`[关键日志] 清理日志失败: ${error.message}`)
    }
  }

  /**
   * 清空所有日志
   */
  async clearAllLogs() {
    try {
      // 获取所有日志ID
      const allLogIds = await redis.client.zrange(this.KEY_LOGS_LIST, 0, -1)

      // 删除所有日志数据
      for (const logId of allLogIds) {
        await redis.client.del(`${this.KEY_LOGS_PREFIX}${logId}`)
      }

      // 清空索引
      await redis.client.del(this.KEY_LOGS_LIST)

      const types = [
        'rate_limit',
        'template_switch',
        'account_status',
        'redemption',
        'system',
        'upstream_error'
      ]
      for (const type of types) {
        await redis.client.del(`${this.KEY_LOGS_INDEX}${type}`)
      }

      logger.info(`[关键日志] 清空了所有日志`)
    } catch (error) {
      logger.error(`[关键日志] 清空日志失败: ${error.message}`)
      throw error
    }
  }

  // 便捷的日志记录方法
  async logRateLimit(accountId, accountType, action, details = {}) {
    // 优先使用账户名称，如果没有则使用账户ID
    const displayName = details.accountName || accountId

    await this.logKeyEvent({
      type: 'rate_limit',
      level: action === 'triggered' ? 'warn' : 'success',
      title: `智能限流${action === 'triggered' ? '触发' : '恢复'}`,
      message: `账户 ${displayName} (${accountType}) ${action === 'triggered' ? '被智能限流' : '从限流中恢复'}`,
      details: { accountId, accountType, action, ...details }
    })
  }

  async logTemplateSwitch(apiKeyId, fromTemplate, toTemplate, reason, details = {}) {
    await this.logKeyEvent({
      type: 'template_switch',
      level: 'info',
      title: '计费模板切换',
      message: `API Key ${apiKeyId} 模板从 ${fromTemplate} 切换到 ${toTemplate}`,
      details: { apiKeyId, fromTemplate, toTemplate, reason, ...details }
    })
  }

  async logAccountStatus(accountId, accountType, status, details = {}) {
    await this.logKeyEvent({
      type: 'account_status',
      level: status === 'error' ? 'error' : 'info',
      title: '账户状态变更',
      message: `账户 ${accountId} (${accountType}) 状态变更为 ${status}`,
      details: { accountId, accountType, status, ...details }
    })
  }

  async logRedemption(code, apiKeyId, type, success, details = {}) {
    await this.logKeyEvent({
      type: 'redemption',
      level: success ? 'success' : 'error',
      title: `兑换码${success ? '兑换成功' : '兑换失败'}`,
      message: `兑换码 ${code} ${success ? '成功兑换为' : '兑换失败'} ${type}`,
      details: { code, apiKeyId, type, success, ...details }
    })
  }

  async logPolicyBinding(apiKeyId, codeType, codeId, success, details = {}) {
    await this.logKeyEvent({
      type: 'redemption',
      level: success ? 'success' : 'error',
      title: `策略绑定${success ? '成功' : '失败'}`,
      message: `API Key ${apiKeyId} 策略绑定${success ? '成功' : '失败'} - ${codeType} 兑换码`,
      details: { apiKeyId, codeType, codeId, success, bindingType: 'policy', ...details }
    })
  }

  async logSystemEvent(event, level = 'info', details = {}) {
    await this.logKeyEvent({
      type: 'system',
      level,
      title: '系统事件',
      message: event,
      details
    })
  }

  /**
   * 记录上游API报错
   * @param {Object} params
   * @param {string} params.accountId - 账户ID
   * @param {string} params.accountName - 账户名称
   * @param {string} params.accountType - 账户类型
   * @param {number} params.statusCode - HTTP状态码
   * @param {string} params.errorMessage - 错误消息
   * @param {Object} params.errorBody - 错误响应体
   * @param {string} params.apiKeyId - API Key ID
   * @param {string} params.apiKeyName - API Key名称
   */
  async logUpstreamError(params) {
    const {
      accountId,
      accountName = 'unknown',
      accountType = 'claude',
      statusCode,
      errorMessage = '',
      errorBody = {},
      apiKeyId,
      apiKeyName = 'unknown'
    } = params

    // 构建完整的错误内容用于聚合（包含原始响应）
    let fullErrorContent = ''
    if (errorMessage) {
      fullErrorContent = errorMessage
    } else if (errorBody.rawResponse) {
      fullErrorContent = errorBody.rawResponse
    } else if (errorBody.error) {
      fullErrorContent = errorBody.error
    } else {
      fullErrorContent = `HTTP ${statusCode} Error`
    }

    // 生成错误内容的哈希（用于合并相同错误）
    const errorContentForHash = `${statusCode}_${fullErrorContent.trim()}`
    const errorHash = require('crypto')
      .createHash('md5')
      .update(errorContentForHash)
      .digest('hex')
      .substring(0, 8)

    // 记录到关键日志
    await this.logKeyEvent({
      type: 'upstream_error',
      level: 'error',
      title: `上游API报错 ${statusCode}`,
      message: `账户 ${accountName} 报错: ${fullErrorContent}`,
      details: {
        accountId,
        accountName,
        accountType,
        statusCode,
        errorMessage: fullErrorContent,
        rawResponse: errorBody.rawResponse || '',
        parsedError: errorBody.parsedError || null,
        errorBody,
        apiKeyId,
        apiKeyName,
        errorHash,
        errorContent: fullErrorContent
      }
    })

    // 记录到按天统计的数据结构
    const today = new Date().toISOString().split('T')[0]
    const dailyKey = `${this.UPSTREAM_ERROR_DAILY_PREFIX}${today}`
    const errorKey = `${accountId}:${errorHash}`

    // 使用Redis哈希存储错误统计
    const errorData = {
      accountId,
      accountName,
      accountType,
      statusCode,
      errorMessage: fullErrorContent,
      errorContent: fullErrorContent,
      rawResponse: errorBody.rawResponse || '',
      parsedError: errorBody.parsedError || null,
      lastTime: new Date().toISOString(),
      firstTime: new Date().toISOString(),
      count: 0
    }

    // 获取现有记录
    const existingData = await redis.client.hget(dailyKey, errorKey)
    if (existingData) {
      const parsed = JSON.parse(existingData)
      errorData.count = (parsed.count || 0) + 1
      errorData.firstTime = parsed.firstTime || errorData.firstTime // 保留首次发生时间
    } else {
      errorData.count = 1
    }

    // 更新记录
    await redis.client.hset(dailyKey, errorKey, JSON.stringify(errorData))

    // 设置过期时间（保留30天）
    await redis.client.expire(dailyKey, 30 * 24 * 60 * 60)

    // 同时记录到 API Key 的报错统计（如果有 apiKeyId）
    if (apiKeyId) {
      const apiKeyDailyKey = `${this.APIKEY_ERROR_DAILY_PREFIX}${today}:${apiKeyId}`
      const apiKeyErrorKey = `${accountId}:${errorHash}`

      // 使用相同的错误数据结构
      const apiKeyErrorData = { ...errorData }

      // 获取现有记录
      const existingApiKeyData = await redis.client.hget(apiKeyDailyKey, apiKeyErrorKey)
      if (existingApiKeyData) {
        const parsed = JSON.parse(existingApiKeyData)
        apiKeyErrorData.count = (parsed.count || 0) + 1
      } else {
        apiKeyErrorData.count = 1
      }

      // 更新 API Key 的错误记录
      await redis.client.hset(apiKeyDailyKey, apiKeyErrorKey, JSON.stringify(apiKeyErrorData))

      // 设置过期时间（保留30天）
      await redis.client.expire(apiKeyDailyKey, 30 * 24 * 60 * 60)

      // 更新 API Key 的错误计数器（用于快速获取总数）
      const apiKeyErrorCountKey = `${this.APIKEY_ERROR_PREFIX}count:${apiKeyId}`
      await redis.client.hincrby(apiKeyErrorCountKey, today, 1)
      await redis.client.expire(apiKeyErrorCountKey, 30 * 24 * 60 * 60)
    }
  }

  /**
   * 获取上游错误统计
   * @param {Object} options
   * @param {string} options.date - 日期 (YYYY-MM-DD)
   * @param {string} options.accountId - 账户ID筛选
   * @param {string} options.sortBy - 排序字段 (count, lastTime)
   * @param {string} options.order - 排序方向 (desc, asc)
   * @returns {Array} 错误统计列表
   */
  async getUpstreamErrorStats(options = {}) {
    try {
      const {
        date = new Date().toISOString().split('T')[0],
        accountId = null,
        sortBy = 'count',
        order = 'desc'
      } = options

      const dailyKey = `${this.UPSTREAM_ERROR_DAILY_PREFIX}${date}`

      // 获取所有错误记录
      const allErrors = await redis.client.hgetall(dailyKey)

      if (!allErrors || Object.keys(allErrors).length === 0) {
        return []
      }

      // 解析并过滤数据
      const errorStats = []
      for (const [_key, value] of Object.entries(allErrors)) {
        try {
          const errorData = JSON.parse(value)

          // 如果指定了账户ID，则过滤
          if (accountId && errorData.accountId !== accountId) {
            continue
          }

          errorStats.push(errorData)
        } catch (e) {
          logger.warn(`解析上游错误统计失败: ${e.message}`)
        }
      }

      // 排序
      errorStats.sort((a, b) => {
        if (sortBy === 'count') {
          return order === 'desc' ? b.count - a.count : a.count - b.count
        } else if (sortBy === 'lastTime') {
          const timeA = new Date(a.lastTime).getTime()
          const timeB = new Date(b.lastTime).getTime()
          return order === 'desc' ? timeB - timeA : timeA - timeB
        }
        return 0
      })

      return errorStats
    } catch (error) {
      logger.error(`获取上游错误统计失败: ${error.message}`)
      return []
    }
  }

  /**
   * 获取可用的日期列表（有数据的日期）
   * @returns {Array} 日期列表
   */
  async getAvailableErrorDates() {
    try {
      const pattern = `${this.UPSTREAM_ERROR_DAILY_PREFIX}*`
      const keys = await redis.client.keys(pattern)

      const dates = keys
        .map((key) => key.replace(this.UPSTREAM_ERROR_DAILY_PREFIX, ''))
        .sort((a, b) => b.localeCompare(a)) // 降序排序

      return dates
    } catch (error) {
      logger.error(`获取可用日期列表失败: ${error.message}`)
      return []
    }
  }

  /**
   * 获取上游错误账户列表
   * @param {string} date - 日期
   * @returns {Array} 账户列表
   */
  async getUpstreamErrorAccounts(date = null) {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0]
      const dailyKey = `${this.UPSTREAM_ERROR_DAILY_PREFIX}${targetDate}`

      const allErrors = await redis.client.hgetall(dailyKey)
      if (!allErrors || Object.keys(allErrors).length === 0) {
        return []
      }

      const accountMap = new Map()
      for (const value of Object.values(allErrors)) {
        try {
          const errorData = JSON.parse(value)
          if (!accountMap.has(errorData.accountId)) {
            accountMap.set(errorData.accountId, {
              accountId: errorData.accountId,
              accountName: errorData.accountName,
              accountType: errorData.accountType
            })
          }
        } catch (e) {
          // 忽略解析错误
        }
      }

      return Array.from(accountMap.values())
    } catch (error) {
      logger.error(`获取上游错误账户列表失败: ${error.message}`)
      return []
    }
  }

  /**
   * 获取 API Key 的上游错误统计
   * @param {string} apiKeyId - API Key ID
   * @param {Object} options
   * @param {string} options.date - 日期 (YYYY-MM-DD)
   * @param {string} options.sortBy - 排序字段 (count, lastTime)
   * @param {string} options.order - 排序方向 (desc, asc)
   * @returns {Array} 错误统计列表
   */
  async getApiKeyErrorStats(apiKeyId, options = {}) {
    try {
      const {
        date = new Date().toISOString().split('T')[0],
        sortBy = 'count',
        order = 'desc'
      } = options

      const apiKeyDailyKey = `${this.APIKEY_ERROR_DAILY_PREFIX}${date}:${apiKeyId}`

      // 获取该 API Key 的所有错误记录
      const allErrors = await redis.client.hgetall(apiKeyDailyKey)

      if (!allErrors || Object.keys(allErrors).length === 0) {
        return []
      }

      // 解析数据
      const errorStats = []
      for (const [_key, value] of Object.entries(allErrors)) {
        try {
          const errorData = JSON.parse(value)
          errorStats.push(errorData)
        } catch (e) {
          logger.warn(`解析 API Key 错误统计失败: ${e.message}`)
        }
      }

      // 排序
      errorStats.sort((a, b) => {
        if (sortBy === 'count') {
          return order === 'desc' ? b.count - a.count : a.count - b.count
        } else if (sortBy === 'lastTime') {
          const timeA = new Date(a.lastTime).getTime()
          const timeB = new Date(b.lastTime).getTime()
          return order === 'desc' ? timeB - timeA : timeA - timeB
        }
        return 0
      })

      return errorStats
    } catch (error) {
      logger.error(`获取 API Key 错误统计失败: ${error.message}`)
      return []
    }
  }

  /**
   * 获取 API Key 的错误计数（用于列表显示）
   * @param {Array} apiKeyIds - API Key ID 列表
   * @param {string} date - 日期 (YYYY-MM-DD)，不传则获取所有日期的总和
   * @returns {Object} 错误计数映射 { apiKeyId: count }
   */
  async getApiKeyErrorCounts(apiKeyIds, date = null) {
    try {
      const counts = {}

      for (const apiKeyId of apiKeyIds) {
        if (date) {
          // 获取特定日期的错误数
          const apiKeyErrorCountKey = `${this.APIKEY_ERROR_PREFIX}count:${apiKeyId}`
          const dayCount = await redis.client.hget(apiKeyErrorCountKey, date)
          counts[apiKeyId] = parseInt(dayCount) || 0
        } else {
          // 获取所有日期的总和
          const apiKeyErrorCountKey = `${this.APIKEY_ERROR_PREFIX}count:${apiKeyId}`
          const allCounts = await redis.client.hgetall(apiKeyErrorCountKey)
          let total = 0
          for (const count of Object.values(allCounts)) {
            total += parseInt(count) || 0
          }
          counts[apiKeyId] = total
        }
      }

      return counts
    } catch (error) {
      logger.error(`获取 API Key 错误计数失败: ${error.message}`)
      return {}
    }
  }

  /**
   * 获取 API Key 的可用错误日期列表
   * @param {string} apiKeyId - API Key ID
   * @returns {Array} 日期列表
   */
  async getApiKeyErrorDates(apiKeyId) {
    try {
      const pattern = `${this.APIKEY_ERROR_DAILY_PREFIX}*:${apiKeyId}`
      const keys = await redis.client.keys(pattern)

      const dates = keys
        .map((key) => {
          // 提取日期部分
          const match = key.match(/apikey_error:daily:(\d{4}-\d{2}-\d{2}):/)
          return match ? match[1] : null
        })
        .filter((date) => date !== null)
        .sort((a, b) => b.localeCompare(a)) // 降序排序

      return dates
    } catch (error) {
      logger.error(`获取 API Key 错误日期列表失败: ${error.message}`)
      return []
    }
  }
}

module.exports = new KeyLogsService()
