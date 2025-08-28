const logger = require('../utils/logger')

/**
 * 增强的错误日志中间件
 */
class ErrorLogger {
  /**
   * 创建错误日志中间件
   */
  static middleware() {
    return (err, req, res, next) => {
      const requestId = req.id || req.headers['x-request-id'] || 'unknown'
      const startTime = req.startTime || Date.now()
      const duration = Date.now() - startTime

      // 构建错误信息
      const errorInfo = {
        requestId,
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        duration: `${duration}ms`,
        error: {
          message: err.message,
          code: err.code,
          status: err.status || err.statusCode || 500,
          stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }
      }

      // 分类记录错误
      if (this.isTimeoutError(err)) {
        this.logTimeoutError(errorInfo)
      } else if (this.isConnectionError(err)) {
        this.logConnectionError(errorInfo)
      } else if (this.isRateLimitError(err)) {
        this.logRateLimitError(errorInfo)
      } else {
        this.logGenericError(errorInfo)
      }

      // 传递到下一个错误处理器
      next(err)
    }
  }

  /**
   * 判断是否为超时错误
   */
  static isTimeoutError(err) {
    return (
      err.code === 'ECONNABORTED' ||
      err.code === 'ETIMEDOUT' ||
      err.message?.toLowerCase().includes('timeout')
    )
  }

  /**
   * 判断是否为连接错误
   */
  static isConnectionError(err) {
    return err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND'
  }

  /**
   * 判断是否为限流错误
   */
  static isRateLimitError(err) {
    return err.status === 429 || err.statusCode === 429
  }

  /**
   * 记录超时错误
   */
  static logTimeoutError(errorInfo) {
    logger.error(`❌ TIMEOUT ERROR: ${errorInfo.error.message}`, {
      metadata: {
        ...errorInfo,
        errorType: 'TIMEOUT',
        severity: 'HIGH'
      }
    })
  }

  /**
   * 记录连接错误
   */
  static logConnectionError(errorInfo) {
    logger.error(`❌ CONNECTION ERROR: ${errorInfo.error.message}`, {
      metadata: {
        ...errorInfo,
        errorType: 'CONNECTION',
        severity: 'HIGH'
      }
    })
  }

  /**
   * 记录限流错误
   */
  static logRateLimitError(errorInfo) {
    logger.warn(`⚠️ RATE LIMIT ERROR: ${errorInfo.error.message}`, {
      metadata: {
        ...errorInfo,
        errorType: 'RATE_LIMIT',
        severity: 'MEDIUM'
      }
    })
  }

  /**
   * 记录通用错误
   */
  static logGenericError(errorInfo) {
    logger.error(`❌ ERROR: ${errorInfo.error.message}`, {
      metadata: {
        ...errorInfo,
        errorType: 'GENERIC',
        severity: 'MEDIUM'
      }
    })
  }

  /**
   * 错误统计中间件
   */
  static statistics() {
    const stats = {
      timeout: 0,
      connection: 0,
      rateLimit: 0,
      generic: 0,
      total: 0
    }

    return (err, req, res, next) => {
      stats.total++

      if (this.isTimeoutError(err)) {
        stats.timeout++
      } else if (this.isConnectionError(err)) {
        stats.connection++
      } else if (this.isRateLimitError(err)) {
        stats.rateLimit++
      } else {
        stats.generic++
      }

      // 每100个错误输出一次统计
      if (stats.total % 100 === 0) {
        logger.info('📊 Error Statistics', {
          stats: { ...stats },
          timestamp: new Date().toISOString()
        })
      }

      next(err)
    }
  }
}

module.exports = ErrorLogger
