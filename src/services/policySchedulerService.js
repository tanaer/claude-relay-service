const cron = require('node-cron')
const redis = require('../models/redis')
const logger = require('../utils/logger')
const keyLogsService = require('./keyLogsService')
const redemptionPolicyService = require('./redemptionPolicyService')
const dynamicPolicyEngine = require('./dynamicPolicyEngine')

class PolicySchedulerService {
  constructor() {
    this.isRunning = false
    this.tasks = new Map()
    this.ACTIVE_POLICIES_INDEX = 'active_policies:redemption'
    this.DAILY_RESET_QUEUE_PREFIX = 'daily_reset_queue:'
  }

  /**
   * 启动调度服务
   */
  start() {
    if (this.isRunning) {
      logger.warn('[策略调度] 调度服务已在运行中')
      return
    }

    this.isRunning = true

    // 每日重置任务 - 每天0点执行
    const dailyResetTask = cron.schedule(
      '0 0 * * *',
      () => {
        this.performDailyReset()
      },
      {
        scheduled: false,
        timezone: 'Asia/Shanghai'
      }
    )

    // 数据清理任务 - 每天凌晨2点执行
    const dataCleanupTask = cron.schedule(
      '0 2 * * *',
      () => {
        this.performDataCleanup()
      },
      {
        scheduled: false,
        timezone: 'Asia/Shanghai'
      }
    )

    // 健康检查任务 - 每小时执行
    const healthCheckTask = cron.schedule(
      '0 * * * *',
      () => {
        this.performHealthCheck()
      },
      {
        scheduled: false,
        timezone: 'Asia/Shanghai'
      }
    )

    // 存储任务引用
    this.tasks.set('dailyReset', dailyResetTask)
    this.tasks.set('dataCleanup', dataCleanupTask)
    this.tasks.set('healthCheck', healthCheckTask)

    // 启动所有任务
    dailyResetTask.start()
    dataCleanupTask.start()
    healthCheckTask.start()

    // 启动动态策略引擎
    dynamicPolicyEngine.start()

    logger.info('[策略调度] 策略调度服务已启动')

    // 记录系统事件
    keyLogsService.logSystemEvent('策略调度服务已启动', 'info', {
      service: 'PolicySchedulerService',
      tasks: ['dailyReset', 'dataCleanup', 'healthCheck'],
      timezone: 'Asia/Shanghai'
    })
  }

  /**
   * 停止调度服务
   */
  stop() {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false

    // 停止所有定时任务
    for (const [name, task] of this.tasks) {
      task.stop()
      logger.debug(`[策略调度] 已停止任务: ${name}`)
    }

    this.tasks.clear()

    // 停止动态策略引擎
    dynamicPolicyEngine.stop()

    logger.info('[策略调度] 策略调度服务已停止')

    // 记录系统事件
    keyLogsService.logSystemEvent('策略调度服务已停止', 'warn', {
      service: 'PolicySchedulerService'
    })
  }

  /**
   * 执行每日重置
   */
  async performDailyReset() {
    try {
      logger.info('[策略调度] 开始执行每日重置任务')

      const startTime = Date.now()
      let resetCount = 0
      let errorCount = 0

      // 获取所有活跃的策略API Key
      const activeApiKeys = await redis.smembers(this.ACTIVE_POLICIES_INDEX)

      logger.info(`[策略调度] 发现 ${activeApiKeys.length} 个活跃策略API Key`)

      // 批量处理重置
      const batchSize = 10
      for (let i = 0; i < activeApiKeys.length; i += batchSize) {
        const batch = activeApiKeys.slice(i, i + batchSize)

        await Promise.allSettled(
          batch.map(async (apiKeyId) => {
            try {
              await dynamicPolicyEngine.resetApiKeyPolicy(apiKeyId)
              resetCount++
            } catch (error) {
              errorCount++
              logger.error(`[策略调度] 重置 API Key ${apiKeyId} 失败: ${error.message}`)
            }
          })
        )

        // 批次间稍作延迟，避免对Redis造成压力
        if (i + batchSize < activeApiKeys.length) {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      }

      const duration = Date.now() - startTime

      // 记录重置结果
      const resetResult = {
        totalApiKeys: activeApiKeys.length,
        successCount: resetCount,
        errorCount,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }

      logger.info(
        `[策略调度] 每日重置完成: 成功 ${resetCount}，失败 ${errorCount}，耗时 ${duration}ms`
      )

      // 记录关键日志
      await keyLogsService.logSystemEvent(
        `每日策略重置完成：成功 ${resetCount} 个，失败 ${errorCount} 个`,
        errorCount > 0 ? 'warn' : 'success',
        resetResult
      )

      // 更新重置队列
      const today = this._getTodayString()
      const resetQueueKey = `${this.DAILY_RESET_QUEUE_PREFIX}${today}`
      await redis.sadd(resetQueueKey, ...activeApiKeys)
      await redis.expire(resetQueueKey, 7 * 24 * 60 * 60) // 保留7天
    } catch (error) {
      logger.error(`[策略调度] 每日重置任务失败: ${error.message}`)

      await keyLogsService.logSystemEvent(`每日策略重置失败: ${error.message}`, 'error', {
        error: error.stack
      })
    }
  }

  /**
   * 执行数据清理
   */
  async performDataCleanup() {
    try {
      logger.info('[策略调度] 开始执行数据清理任务')

      const startTime = Date.now()
      const cleanupResults = {
        usageData: 0,
        keyLogs: 0,
        resetQueues: 0
      }

      // 清理过期的使用量监控数据
      await redemptionPolicyService.cleanupExpiredUsageData()
      cleanupResults.usageData = 1

      // 清理关键日志（由keyLogsService自动处理）
      await keyLogsService.cleanupOldLogs()
      cleanupResults.keyLogs = 1

      // 清理过期的重置队列
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - 7)
      const cutoffString = cutoffDate.toISOString().split('T')[0]

      // 查找并删除过期的重置队列
      const client = redis.getClientSafe()
      const resetQueueKeys = await client.keys(`${this.DAILY_RESET_QUEUE_PREFIX}*`)

      for (const key of resetQueueKeys) {
        const dateString = key.replace(this.DAILY_RESET_QUEUE_PREFIX, '')
        if (dateString < cutoffString) {
          await redis.del(key)
          cleanupResults.resetQueues++
        }
      }

      const duration = Date.now() - startTime

      logger.info(`[策略调度] 数据清理完成，耗时 ${duration}ms`)

      // 记录清理结果
      await keyLogsService.logSystemEvent('数据清理任务完成', 'info', {
        ...cleanupResults,
        duration: `${duration}ms`,
        cutoffDate: cutoffString
      })
    } catch (error) {
      logger.error(`[策略调度] 数据清理任务失败: ${error.message}`)

      await keyLogsService.logSystemEvent(`数据清理任务失败: ${error.message}`, 'error', {
        error: error.stack
      })
    }
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck() {
    try {
      const healthStatus = {
        timestamp: new Date().toISOString(),
        scheduler: {
          isRunning: this.isRunning,
          activeTasks: this.tasks.size
        },
        policyEngine: dynamicPolicyEngine.getStatus(),
        redis: {
          connected: false,
          activePolices: 0
        }
      }

      // 检查Redis连接
      try {
        const activeApiKeys = await redis.smembers(this.ACTIVE_POLICIES_INDEX)
        healthStatus.redis.connected = true
        healthStatus.redis.activePolices = activeApiKeys.length
      } catch (error) {
        healthStatus.redis.connected = false
        healthStatus.redis.error = error.message
      }

      // 记录健康状态
      const hasErrors = !healthStatus.redis.connected || !healthStatus.policyEngine.isRunning

      if (hasErrors) {
        logger.warn('[策略调度] 健康检查发现问题', healthStatus)

        await keyLogsService.logSystemEvent('策略系统健康检查发现问题', 'warn', healthStatus)
      } else {
        logger.debug('[策略调度] 健康检查正常', healthStatus)
      }
    } catch (error) {
      logger.error(`[策略调度] 健康检查失败: ${error.message}`)
    }
  }

  /**
   * 手动触发每日重置（测试用）
   */
  async triggerDailyReset() {
    logger.info('[策略调度] 手动触发每日重置')
    await this.performDailyReset()
  }

  /**
   * 手动触发数据清理（测试用）
   */
  async triggerDataCleanup() {
    logger.info('[策略调度] 手动触发数据清理')
    await this.performDataCleanup()
  }

  /**
   * 获取调度服务状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeTasks: Array.from(this.tasks.keys()),
      taskCount: this.tasks.size,
      policyEngineStatus: dynamicPolicyEngine.getStatus()
    }
  }

  /**
   * 获取今天的日期字符串 (YYYY-MM-DD)
   */
  _getTodayString() {
    return new Date().toISOString().split('T')[0]
  }

  /**
   * 获取重置历史
   */
  async getResetHistory(days = 7) {
    try {
      const history = []
      const endDate = new Date()

      for (let i = 0; i < days; i++) {
        const date = new Date(endDate)
        date.setDate(date.getDate() - i)
        const dateString = date.toISOString().split('T')[0]

        const resetQueueKey = `${this.DAILY_RESET_QUEUE_PREFIX}${dateString}`
        const exists = await redis.exists(resetQueueKey)

        if (exists) {
          const resetApiKeys = await redis.smembers(resetQueueKey)
          history.push({
            date: dateString,
            apiKeyCount: resetApiKeys.length,
            completed: true
          })
        } else {
          history.push({
            date: dateString,
            apiKeyCount: 0,
            completed: false
          })
        }
      }

      return history.reverse()
    } catch (error) {
      logger.error(`[策略调度] 获取重置历史失败: ${error.message}`)
      return []
    }
  }
}

module.exports = new PolicySchedulerService()
