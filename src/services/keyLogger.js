const logger = require('../utils/logger')

/**
 * 关键日志记录服务
 * 用于记录系统的重要事件和操作
 */
class KeyLogger {
  constructor() {
    this.logs = []
    this.maxLogs = 1000
  }

  /**
   * 记录关键日志
   * @param {Object} logData - 日志数据
   */
  async log(logData) {
    try {
      const timestamp = new Date().toISOString()
      const logEntry = {
        ...logData,
        timestamp
      }

      // 记录到内存
      this.logs.push(logEntry)

      // 限制日志数量
      if (this.logs.length > this.maxLogs) {
        this.logs.shift()
      }

      // 同时输出到系统日志
      if (logData.level === 'error') {
        logger.error(`[KeyLog] ${logData.message}`, logData)
      } else if (logData.level === 'warning') {
        logger.warn(`[KeyLog] ${logData.message}`, logData)
      } else {
        logger.info(`[KeyLog] ${logData.message}`, logData)
      }
    } catch (error) {
      logger.error('Failed to log key event:', error)
    }
  }

  /**
   * 获取所有日志
   */
  async getLogs(limit = 100) {
    return this.logs.slice(-limit)
  }

  /**
   * 清空日志
   */
  async clearLogs() {
    this.logs = []
  }
}

// 导出单例
module.exports = new KeyLogger()
