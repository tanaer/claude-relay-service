/**
 * 迁移专用日志记录器
 *
 * 提供专门用于迁移过程的结构化日志记录，包括：
 * - 分级日志（DEBUG, INFO, WARN, ERROR）
 * - 迁移特定的元数据和上下文
 * - 批次操作日志
 * - 错误堆栈和诊断��息
 * - 性能监控和计时
 * - 结构化查询支持
 */

const winston = require('winston')
const path = require('path')
const fs = require('fs').promises
const { logger: _globalLogger } = require('./logger')

class MigrationLogger {
  constructor(migrationId, options = {}) {
    this.migrationId = migrationId
    this.options = {
      logLevel: options.logLevel || 'info',
      maxFileSize: options.maxFileSize || 50 * 1024 * 1024, // 50MB
      maxFiles: options.maxFiles || 10,
      enableConsole: options.enableConsole !== false,
      enableFile: options.enableFile !== false,
      logDir: options.logDir || path.join(__dirname, '../../logs/migrations'),
      ...options
    }

    this.timers = new Map() // 存储计时器
    this.counters = new Map() // 存储计数器
    this.contexts = [] // 上下文堆栈

    this.initializeLogger()
  }

  /**
   * 初始化日志记录器
   */
  initializeLogger() {
    // 创建 Winston 实例而不等待目录创建
    // 目录创建会在需要时同步进行

    // 创建 Winston 实例
    const transports = []

    // 控制台输出
    if (this.options.enableConsole) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
              return `${timestamp} [${level}] [${this.migrationId}] ${message}${metaStr}`
            })
          ),
          level: this.options.logLevel
        })
      )
    }

    // 文件输出
    if (this.options.enableFile) {
      const logFilename = `migration-${this.migrationId}.log`
      const errorFilename = `migration-${this.migrationId}-error.log`

      transports.push(
        // 所有级别日志
        new winston.transports.File({
          filename: path.join(this.options.logDir, logFilename),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          ),
          maxsize: this.options.maxFileSize,
          maxFiles: this.options.maxFiles,
          level: this.options.logLevel
        }),

        // 错误级别日志
        new winston.transports.File({
          filename: path.join(this.options.logDir, errorFilename),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          ),
          maxsize: this.options.maxFileSize,
          maxFiles: this.options.maxFiles,
          level: 'error'
        })
      )
    }

    this.winstonLogger = winston.createLogger({
      level: this.options.logLevel,
      transports,
      defaultMeta: {
        migrationId: this.migrationId,
        component: 'migration'
      }
    })

    // 记录初始化信息
    this.info('Migration logger initialized', {
      logLevel: this.options.logLevel,
      enableConsole: this.options.enableConsole,
      enableFile: this.options.enableFile,
      logDir: this.options.logDir
    })
  }

  /**
   * 开始迁移日志记录
   */
  startMigration(metadata = {}) {
    this.info('Migration started', {
      type: 'migration_start',
      startTime: new Date().toISOString(),
      metadata
    })

    this.startTimer('migration_total')
    return this
  }

  /**
   * 结束迁移日志记录
   */
  endMigration(status = 'completed', summary = {}) {
    const totalTime = this.stopTimer('migration_total')

    this.info('Migration completed', {
      type: 'migration_end',
      endTime: new Date().toISOString(),
      status,
      totalTime,
      summary,
      counters: Object.fromEntries(this.counters)
    })

    return this
  }

  /**
   * 记录批次开始
   */
  startBatch(batchIndex, batchInfo = {}) {
    const batchId = `batch_${batchIndex}`

    this.debug('Batch started', {
      type: 'batch_start',
      batchIndex,
      batchId,
      batchInfo,
      timestamp: new Date().toISOString()
    })

    this.startTimer(batchId)
    this.pushContext({ batchIndex, batchId })
    return this
  }

  /**
   * 记录批次结束
   */
  endBatch(batchIndex, result = {}) {
    const batchId = `batch_${batchIndex}`
    const batchTime = this.stopTimer(batchId)

    this.info('Batch completed', {
      type: 'batch_end',
      batchIndex,
      batchId,
      batchTime,
      result,
      timestamp: new Date().toISOString()
    })

    this.popContext()
    this.increment('batches_completed')

    if (result.failed > 0) {
      this.increment('batches_failed')
    }

    return this
  }

  /**
   * 记录记录处理
   */
  recordProcessed(recordId, operation, result = 'success', details = {}) {
    const level = result === 'success' ? 'debug' : result === 'failed' ? 'error' : 'warn'

    this[level](`Record ${operation}`, {
      type: 'record_processed',
      recordId,
      operation,
      result,
      details,
      context: this.getCurrentContext()
    })

    this.increment(`records_${result}`)
    this.increment('records_total')

    return this
  }

  /**
   * 记录数据验证
   */
  validateData(validationType, recordId, result, details = {}) {
    const level = result.isValid ? 'debug' : 'warn'

    this[level](`Data validation ${result.isValid ? 'passed' : 'failed'}`, {
      type: 'data_validation',
      validationType,
      recordId,
      result,
      details,
      context: this.getCurrentContext()
    })

    this.increment(result.isValid ? 'validations_passed' : 'validations_failed')
    return this
  }

  /**
   * 记录错误并进行分析
   */
  logError(error, context = {}, analysis = {}) {
    const errorInfo = {
      type: 'migration_error',
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
        code: error.code
      },
      context: {
        ...this.getCurrentContext(),
        ...context
      },
      analysis: {
        category: this.categorizeError(error),
        severity: this.assessErrorSeverity(error),
        recoverable: this.isErrorRecoverable(error),
        ...analysis
      },
      timestamp: new Date().toISOString()
    }

    this.error(error.message, errorInfo)
    this.increment('errors_total')
    this.increment(`errors_${errorInfo.analysis.category}`)

    return this
  }

  /**
   * 记录性能指标
   */
  recordPerformance(metric, value, unit = '', context = {}) {
    this.info(`Performance metric: ${metric}`, {
      type: 'performance_metric',
      metric,
      value,
      unit,
      context: {
        ...this.getCurrentContext(),
        ...context
      },
      timestamp: new Date().toISOString()
    })

    return this
  }

  /**
   * 记录进度更新
   */
  recordProgress(currentStep, totalSteps, details = {}) {
    const percentage = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0

    this.info(`Progress: ${percentage}%`, {
      type: 'progress_update',
      currentStep,
      totalSteps,
      percentage,
      details,
      context: this.getCurrentContext(),
      timestamp: new Date().toISOString()
    })

    return this
  }

  /**
   * 记录资源使用情况
   */
  recordResourceUsage() {
    const usage = process.memoryUsage()
    const cpuUsage = process.cpuUsage()

    this.debug('Resource usage', {
      type: 'resource_usage',
      memory: {
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
        rss: Math.round(usage.rss / 1024 / 1024),
        external: Math.round(usage.external / 1024 / 1024)
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      timestamp: new Date().toISOString()
    })

    return this
  }

  /**
   * 创建检查点
   */
  createCheckpoint(checkpointId, data = {}) {
    this.info(`Checkpoint: ${checkpointId}`, {
      type: 'checkpoint',
      checkpointId,
      data,
      counters: Object.fromEntries(this.counters),
      context: this.getCurrentContext(),
      timestamp: new Date().toISOString()
    })

    return this
  }

  /**
   * 基础日志方法
   */
  debug(message, meta = {}) {
    this.winstonLogger.debug(message, this.enhanceMeta(meta))
    return this
  }

  info(message, meta = {}) {
    this.winstonLogger.info(message, this.enhanceMeta(meta))
    return this
  }

  warn(message, meta = {}) {
    this.winstonLogger.warn(message, this.enhanceMeta(meta))
    return this
  }

  error(message, meta = {}) {
    this.winstonLogger.error(message, this.enhanceMeta(meta))
    return this
  }

  /**
   * 增强元数据
   */
  enhanceMeta(meta = {}) {
    return {
      ...meta,
      migrationId: this.migrationId,
      context: this.getCurrentContext(),
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 计时器管理
   */
  startTimer(name) {
    this.timers.set(name, {
      startTime: process.hrtime.bigint(),
      name
    })
    return this
  }

  stopTimer(name) {
    const timer = this.timers.get(name)
    if (!timer) {
      this.warn(`Timer ${name} not found`)
      return 0
    }

    const endTime = process.hrtime.bigint()
    const duration = Number(endTime - timer.startTime) / 1000000 // 转为毫秒

    this.timers.delete(name)
    return Math.round(duration * 100) / 100 // 保留两位小数
  }

  getTimer(name) {
    const timer = this.timers.get(name)
    if (!timer) {
      return null
    }

    const currentTime = process.hrtime.bigint()
    const elapsed = Number(currentTime - timer.startTime) / 1000000
    return Math.round(elapsed * 100) / 100
  }

  /**
   * 计数器管理
   */
  increment(counter, value = 1) {
    const current = this.counters.get(counter) || 0
    this.counters.set(counter, current + value)
    return this
  }

  decrement(counter, value = 1) {
    return this.increment(counter, -value)
  }

  getCounter(counter) {
    return this.counters.get(counter) || 0
  }

  resetCounter(counter) {
    this.counters.set(counter, 0)
    return this
  }

  /**
   * 上下文管理
   */
  pushContext(context) {
    this.contexts.push(context)
    return this
  }

  popContext() {
    return this.contexts.pop()
  }

  getCurrentContext() {
    return this.contexts.length > 0 ? this.contexts[this.contexts.length - 1] : {}
  }

  /**
   * 错误分析方法
   */
  categorizeError(error) {
    const message = error.message.toLowerCase()
    const name = error.name.toLowerCase()

    if (message.includes('redis') || message.includes('connection')) {
      return 'database'
    } else if (message.includes('validation') || message.includes('invalid')) {
      return 'validation'
    } else if (message.includes('timeout') || message.includes('network')) {
      return 'network'
    } else if (message.includes('permission') || message.includes('auth')) {
      return 'permission'
    } else if (name.includes('syntax') || message.includes('parse')) {
      return 'syntax'
    } else {
      return 'general'
    }
  }

  assessErrorSeverity(error) {
    const message = error.message.toLowerCase()

    if (message.includes('critical') || message.includes('fatal')) {
      return 'critical'
    } else if (message.includes('connection') || message.includes('timeout')) {
      return 'high'
    } else if (message.includes('validation') || message.includes('warning')) {
      return 'medium'
    } else {
      return 'low'
    }
  }

  isErrorRecoverable(error) {
    const message = error.message.toLowerCase()
    const recoverable = ['timeout', 'network', 'connection', 'temporary', 'retry']

    return recoverable.some((keyword) => message.includes(keyword))
  }

  /**
   * 查询日志
   */
  async queryLogs(query = {}) {
    // 这里实现日志查询功能
    // 可以根据时间范围、日志级别、类型等进行过滤
    try {
      const logFile = path.join(this.options.logDir, `migration-${this.migrationId}.log`)
      const content = await fs.readFile(logFile, 'utf8')
      const lines = content.split('\n').filter((line) => line.trim())

      let results = lines
        .map((line) => {
          try {
            return JSON.parse(line)
          } catch {
            return null
          }
        })
        .filter(Boolean)

      // 应用查询过滤器
      if (query.level) {
        results = results.filter((log) => log.level === query.level)
      }

      if (query.type) {
        results = results.filter((log) => log.type === query.type)
      }

      if (query.startTime && query.endTime) {
        results = results.filter((log) => {
          const logTime = new Date(log.timestamp).getTime()
          return logTime >= query.startTime && logTime <= query.endTime
        })
      }

      return results.slice(query.offset || 0, (query.offset || 0) + (query.limit || 100))
    } catch (error) {
      this.error('Failed to query logs', { error: error.message, query })
      return []
    }
  }

  /**
   * 生成日志摘要
   */
  generateLogSummary() {
    const summary = {
      migrationId: this.migrationId,
      counters: Object.fromEntries(this.counters),
      activeTimers: Array.from(this.timers.keys()),
      contextStack: [...this.contexts]
    }

    this.info('Log summary generated', {
      type: 'log_summary',
      summary
    })

    return summary
  }

  /**
   * 清理资源
   */
  async cleanup() {
    if (this.winstonLogger) {
      this.winstonLogger.close()
    }

    this.timers.clear()
    this.counters.clear()
    this.contexts.length = 0
  }
}

// 迁移日志管理器
class MigrationLoggerManager {
  constructor() {
    this.loggers = new Map()
  }

  /**
   * 创建或获取迁移日志记录器
   */
  getLogger(migrationId, options = {}) {
    if (!this.loggers.has(migrationId)) {
      const migrationLogger = new MigrationLogger(migrationId, options)
      this.loggers.set(migrationId, migrationLogger)
    }

    return this.loggers.get(migrationId)
  }

  /**
   * 移除日志记录器
   */
  async removeLogger(migrationId) {
    const migrationLogger = this.loggers.get(migrationId)
    if (migrationLogger) {
      await migrationLogger.cleanup()
      this.loggers.delete(migrationId)
    }
  }

  /**
   * 获取所有活跃的日志记录器
   */
  getActiveLoggers() {
    return Array.from(this.loggers.keys())
  }

  /**
   * 清理所有日志记录器
   */
  async cleanupAll() {
    const promises = Array.from(this.loggers.values()).map((migrationLogger) =>
      migrationLogger.cleanup()
    )
    await Promise.allSettled(promises)
    this.loggers.clear()
  }
}

// 导出单例实例
const migrationLoggerManager = new MigrationLoggerManager()

module.exports = {
  MigrationLogger,
  MigrationLoggerManager,
  migrationLoggerManager
}
