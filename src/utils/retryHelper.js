const logger = require('./logger')

/**
 * 重试辅助类 - 处理网络请求的智能重试
 */
class RetryHelper {
  /**
   * 执行带重试的异步操作
   * @param {Function} fn - 要执行的异步函数
   * @param {Object} options - 重试配置选项
   * @returns {Promise} - 执行结果
   */
  static async withRetry(fn, options = {}) {
    const {
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 30000,
      exponentialBackoff = true,
      retryCondition = null,
      onRetry = null
    } = options

    let lastError

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error

        // 检查是否应该重试
        if (attempt === maxRetries) {
          break
        }

        // 如果提供了重试条件，检查是否满足
        if (retryCondition && !retryCondition(error)) {
          throw error
        }

        // 默认重试条件：网络错误和特定状态码
        if (!retryCondition && !this.shouldRetry(error)) {
          throw error
        }

        // 计算延迟时间
        let delay = initialDelay
        if (exponentialBackoff) {
          delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay)
        }

        // 记录重试日志
        logger.warn(`⚠️ Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
          error: error.message,
          code: error.code,
          status: error.response?.status
        })

        // 触发重试回调
        if (onRetry) {
          onRetry(attempt + 1, error)
        }

        // 等待延迟
        await this.sleep(delay)
      }
    }

    // 所有重试都失败了
    logger.error(`❌ All ${maxRetries} retry attempts failed`, {
      error: lastError.message
    })
    throw lastError
  }

  /**
   * 判断错误是否应该重试
   * @param {Error} error - 错误对象
   * @returns {boolean} - 是否应该重试
   */
  static shouldRetry(error) {
    // 网络错误
    if (error.code) {
      const retryCodes = [
        'ECONNRESET',
        'ECONNABORTED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'ENETUNREACH',
        'EAI_AGAIN',
        'ECONNREFUSED'
      ]
      if (retryCodes.includes(error.code)) {
        return true
      }
    }

    // HTTP状态码
    if (error.response?.status) {
      const retryStatuses = [
        408, // Request Timeout
        429, // Too Many Requests
        500, // Internal Server Error
        502, // Bad Gateway
        503, // Service Unavailable
        504 // Gateway Timeout
      ]
      if (retryStatuses.includes(error.response.status)) {
        return true
      }
    }

    // 超时错误
    if (error.message && (error.message.includes('timeout') || error.message.includes('Timeout'))) {
      return true
    }

    return false
  }

  /**
   * 睡眠函数
   * @param {number} ms - 毫秒数
   * @returns {Promise} - Promise
   */
  static sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * 创建带超时的Promise
   * @param {Promise} promise - 原始Promise
   * @param {number} timeout - 超时时间（毫秒）
   * @param {string} message - 超时错误消息
   * @returns {Promise} - 带超时的Promise
   */
  static withTimeout(promise, timeout, message = 'Operation timeout') {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => {
          const error = new Error(message)
          error.code = 'ETIMEDOUT'
          reject(error)
        }, timeout)
      })
    ])
  }
}

module.exports = RetryHelper
