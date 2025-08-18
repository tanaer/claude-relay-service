const redis = require('../models/redis')
const logger = require('../utils/logger')

class KeyLogsService {
  constructor() {
    this.KEY_LOGS_PREFIX = 'key_logs:'
    this.KEY_LOGS_LIST = 'key_logs_list'
    this.KEY_LOGS_INDEX = 'key_logs_index:'
    this.MAX_LOGS = 10000 // 最大保留日志数量
    this.LOG_RETENTION_DAYS = 30 // 日志保留天数
  }

  /**
   * 记录关键日志
   * @param {Object} logData 日志数据
   * @param {string} logData.type 日志类型 (rate_limit, template_switch, account_status, redemption, system)
   * @param {string} logData.level 日志级别 (error, warn, info, success)
   * @param {string} logData.title 日志标题
   * @param {string} logData.message 日志消息
   * @param {Object} logData.details 详细信息对象
   * @param {string} logData.source 日志来源 (可选)
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
        timestamp
      }

      // 存储日志详细信息
      await redis.hset(`${this.KEY_LOGS_PREFIX}${logId}`, logEntry)

      // 添加到有序列表（按时间戳排序）
      await redis.zadd(this.KEY_LOGS_LIST, Date.now(), logId)

      // 添加到类型索引
      await redis.zadd(`${this.KEY_LOGS_INDEX}${logData.type}`, Date.now(), logId)

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
   * @returns {Object} 包含日志列表和分页信息
   */
  async getKeyLogs(options = {}) {
    try {
      const { type, page = 1, pageSize = 20, level } = options

      // 确定使用哪个索引
      const indexKey = type ? `${this.KEY_LOGS_INDEX}${type}` : this.KEY_LOGS_LIST

      // 获取总数
      const totalCount = await redis.zcard(indexKey)
      const totalPages = Math.ceil(totalCount / pageSize)

      // 计算分页偏移
      const start = (page - 1) * pageSize
      const end = start + pageSize - 1

      // 获取日志ID列表（按时间倒序）
      const logIds = await redis.zrevrange(indexKey, start, end)

      // 获取日志详细信息
      const logs = []
      for (const logId of logIds) {
        const logData = await redis.hgetall(`${this.KEY_LOGS_PREFIX}${logId}`)
        if (logData && Object.keys(logData).length > 0) {
          // 解析 details 字段
          if (logData.details && typeof logData.details === 'string') {
            try {
              logData.details = JSON.parse(logData.details)
            } catch (e) {
              logData.details = {}
            }
          }

          // 级别过滤
          if (!level || logData.level === level) {
            logs.push(logData)
          }
        }
      }

      return {
        logs,
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
      stats.total = await redis.zcard(this.KEY_LOGS_LIST)

      // 统计各类型数量
      const types = ['rate_limit', 'template_switch', 'account_status', 'redemption', 'system']
      for (const type of types) {
        const count = await redis.zcard(`${this.KEY_LOGS_INDEX}${type}`)
        stats.byType[type] = count
      }

      // 统计最近24小时的日志
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
      stats.recent24h = await redis.zcount(this.KEY_LOGS_LIST, oneDayAgo, '+inf')

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
      const totalCount = await redis.zcard(this.KEY_LOGS_LIST)
      if (totalCount > this.MAX_LOGS) {
        const removeCount = totalCount - this.MAX_LOGS
        const oldLogIds = await redis.zrange(this.KEY_LOGS_LIST, 0, removeCount - 1)

        // 删除旧日志
        for (const logId of oldLogIds) {
          await redis.del(`${this.KEY_LOGS_PREFIX}${logId}`)
        }

        // 从有序集合中移除
        await redis.zremrangebyrank(this.KEY_LOGS_LIST, 0, removeCount - 1)

        // 从类型索引中移除
        const types = ['rate_limit', 'template_switch', 'account_status', 'redemption', 'system']
        for (const type of types) {
          for (const logId of oldLogIds) {
            await redis.zrem(`${this.KEY_LOGS_INDEX}${type}`, logId)
          }
        }

        logger.info(`[关键日志] 清理了 ${removeCount} 条旧日志`)
      }

      // 清理超过保留时间的日志
      const retentionTime = Date.now() - this.LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
      const expiredLogIds = await redis.zrangebyscore(this.KEY_LOGS_LIST, '-inf', retentionTime)

      if (expiredLogIds.length > 0) {
        // 删除过期日志
        for (const logId of expiredLogIds) {
          await redis.del(`${this.KEY_LOGS_PREFIX}${logId}`)
        }

        // 从有序集合中移除
        await redis.zremrangebyscore(this.KEY_LOGS_LIST, '-inf', retentionTime)

        // 从类型索引中移除
        const types = ['rate_limit', 'template_switch', 'account_status', 'redemption', 'system']
        for (const type of types) {
          for (const logId of expiredLogIds) {
            await redis.zrem(`${this.KEY_LOGS_INDEX}${type}`, logId)
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
      const allLogIds = await redis.zrange(this.KEY_LOGS_LIST, 0, -1)

      // 删除所有日志数据
      for (const logId of allLogIds) {
        await redis.del(`${this.KEY_LOGS_PREFIX}${logId}`)
      }

      // 清空索引
      await redis.del(this.KEY_LOGS_LIST)

      const types = ['rate_limit', 'template_switch', 'account_status', 'redemption', 'system']
      for (const type of types) {
        await redis.del(`${this.KEY_LOGS_INDEX}${type}`)
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
}

module.exports = new KeyLogsService()
