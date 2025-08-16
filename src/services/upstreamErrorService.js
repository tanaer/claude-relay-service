const redis = require('../models/redis')
const logger = require('../utils/logger')

/**
 * 错误记录与自定义文案服务（按账户维度）
 * - 错误明细存储：list key upstream_error_logs:{accountId}
 * - 自定义文案存储：hash key upstream_error_messages:{accountId}
 * - 账户索引集合：set key upstream_error_messages_accounts
 */
class UpstreamErrorService {
  constructor() {
    this.MAX_LOGS_PER_ACCOUNT = 500
    this.DEFAULT_MESSAGES = {
      rate_limit: '当前服务繁忙，请稍后再试。',
      authentication: '认证失败，请联系管理员检查配置。',
      forbidden: '拒绝访问，请联系管理员。',
      bad_request: '请求参数不被接受，请检查后重试。',
      server_error: '服务出现异常，请稍后再试。',
      network_error: '通讯异常，请稍后重试。',
      timeout: '与通讯超时，请稍后重试。',
      not_found: '资源不存在。',
      unsupported_model: '当前模型暂不可用，请更换模型后重试。',
      unknown: '服务暂时不可用，请稍后再试。'
    }
    this.CUSTOM_MESSAGES_INDEX_KEY = 'upstream_error_messages_accounts'
  }

  /**
   * 分类错误到统一的 errorType
   */
  classifyError({ status, code, message, data }) {
    // 优先按 HTTP 状态码
    if (status === 429) {
      return 'rate_limit'
    }
    if (status === 401) {
      return 'authentication'
    }
    if (status === 403) {
      return 'forbidden'
    }
    if (status === 404) {
      return 'not_found'
    }
    if (status >= 500 && status < 600) {
      return 'server_error'
    }
    if (status === 400) {
      return 'bad_request'
    }

    // 其次按网络错误码/文案
    const msg = (message || '').toLowerCase()
    const c = (code || '').toUpperCase()
    if (c === 'ETIMEDOUT' || msg.includes('timeout')) {
      return 'timeout'
    }
    if (
      c === 'ECONNRESET' ||
      c === 'ECONNREFUSED' ||
      c === 'ENOTFOUND' ||
      msg.includes('socket hang up') ||
      msg.includes('resolve')
    ) {
      return 'network_error'
    }

    // 从内容中尝试判断
    const text = typeof data === 'string' ? data : JSON.stringify(data || {})
    if (/model.*not.*supported|unsupported.*model/i.test(text)) {
      return 'unsupported_model'
    }

    return 'unknown'
  }

  /**
   * 脱敏处理敏感信息
   */
  _sanitizeErrorData(data) {
    if (!data) {
      return ''
    }

    let text = typeof data === 'string' ? data : JSON.stringify(data)

    // 截断过长内容
    if (text.length > 2000) {
      text = `${text.substring(0, 2000)}...[truncated]`
    }

    // 脱敏常见敏感字段（保留结构但隐藏值）
    text = text.replace(
      /"(token|key|secret|password|authorization|cookie|session)"\s*:\s*"[^"]*"/gi,
      '"$1":"***"'
    )
    text = text.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer ***')
    text = text.replace(/sk-[A-Za-z0-9]{32,}/g, 'sk-***')

    return text
  }

  /**
   * 记录一条错误
   */
  async recordError({
    accountId,
    accountType = 'claude-console',
    provider = 'claude-console',
    status = 0,
    code = '',
    message = '',
    data = null,
    requestId = null
  }) {
    try {
      const client = redis.getClientSafe()
      const errorType = this.classifyError({ status, code, message, data })
      const entry = {
        accountId,
        accountType,
        provider,
        status,
        code,
        message: message ? message.substring(0, 500) : '', // 限制错误消息长度
        errorType,
        sampleBody: this._sanitizeErrorData(data),
        requestId: requestId || 'unknown',
        timestamp: new Date().toISOString()
      }

      const key = `upstream_error_logs:${accountId}`
      await client.lpush(key, JSON.stringify(entry))
      await client.ltrim(key, 0, this.MAX_LOGS_PER_ACCOUNT - 1)

      return { success: true, errorType }
    } catch (err) {
      logger.error('Failed to record upstream error:', err.message)
      return { success: false }
    }
  }

  /**
   * 聚合错误：按类型返回计数与一条示例
   */
  async getAggregatedErrors(accountId, limitPerType = 1) {
    try {
      const client = redis.getClientSafe()
      const key = `upstream_error_logs:${accountId}`
      const items = await client.lrange(key, 0, this.MAX_LOGS_PER_ACCOUNT - 1)
      const byType = {}

      for (const raw of items) {
        try {
          const obj = JSON.parse(raw)
          const t = obj.errorType || 'unknown'
          if (!byType[t]) {
            byType[t] = { count: 0, samples: [] }
          }
          byType[t].count += 1
          if (byType[t].samples.length < limitPerType) {
            byType[t].samples.push({
              status: obj.status,
              code: obj.code,
              message: obj.message,
              sampleBody: obj.sampleBody,
              timestamp: obj.timestamp
            })
          }
        } catch (_) {
          // ignore broken
        }
      }

      const result = Object.entries(byType).map(([errorType, info]) => ({
        errorType,
        count: info.count,
        sample: info.samples[0] || null
      }))

      return { success: true, data: result }
    } catch (err) {
      logger.error('Failed to aggregate upstream errors:', err)
      return { success: false, data: [] }
    }
  }

  /** 获取/设置自定义文案 */
  async getCustomMessages(accountId) {
    try {
      const client = redis.getClientSafe()
      const key = `upstream_error_messages:${accountId}`
      const map = await client.hgetall(key)
      // 读取即维护索引：有则加入索引集合，无则移除
      if (map && Object.keys(map).length > 0) {
        await client.sadd(this.CUSTOM_MESSAGES_INDEX_KEY, accountId)
      } else {
        await client.srem(this.CUSTOM_MESSAGES_INDEX_KEY, accountId)
      }
      return map || {}
    } catch (err) {
      logger.error('Failed to get custom upstream error messages:', err.message)
      return {}
    }
  }

  async setCustomMessages(accountId, messages = {}) {
    try {
      const client = redis.getClientSafe()
      const key = `upstream_error_messages:${accountId}`

      // 清空现有数据
      await client.del(key)

      // 设置新数据
      const validMessages = {}
      Object.entries(messages).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim()) {
          validMessages[k] = String(v)
        }
      })

      if (Object.keys(validMessages).length > 0) {
        await client.hset(key, validMessages)
        // 维护索引集合
        await client.sadd(this.CUSTOM_MESSAGES_INDEX_KEY, accountId)
      } else {
        // 没有自定义文案时，从索引集合移除
        await client.srem(this.CUSTOM_MESSAGES_INDEX_KEY, accountId)
      }
      return { success: true }
    } catch (err) {
      logger.error('Failed to set custom upstream error messages:', err)
      return { success: false, message: err.message }
    }
  }

  /**
   * 复制源账户的自定义错误信息到目标账户
   * @param {string} sourceAccountId - 源账户ID
   * @param {string} targetAccountId - 目标账户ID
   * @param {boolean} overwrite - 是否覆盖目标账户已有的自定义信息
   * @returns {Object} 复制结果
   */
  async copyCustomMessages(sourceAccountId, targetAccountId, overwrite = false) {
    try {
      const client = redis.getClientSafe()
      const sourceKey = `upstream_error_messages:${sourceAccountId}`
      const targetKey = `upstream_error_messages:${targetAccountId}`

      // 获取源账户的自定义错误信息
      const sourceMessages = await client.hgetall(sourceKey)
      if (!sourceMessages || Object.keys(sourceMessages).length === 0) {
        return {
          success: false,
          message: '源账户没有自定义错误信息',
          copiedCount: 0
        }
      }

      // 获取目标账户现有的自定义错误信息
      let targetMessages = {}
      if (!overwrite) {
        targetMessages = (await client.hgetall(targetKey)) || {}
      }

      // 合并错误信息（源账户优先，除非不覆盖且目标已存在）
      const mergedMessages = { ...sourceMessages }
      if (!overwrite) {
        // 不覆盖模式：保留目标账户已有的信息
        Object.keys(targetMessages).forEach((key) => {
          if (targetMessages[key]) {
            mergedMessages[key] = targetMessages[key]
          }
        })
      }

      // 保存合并后的信息到目标账户
      await client.del(targetKey)
      if (Object.keys(mergedMessages).length > 0) {
        await client.hset(targetKey, mergedMessages)
      }

      const copiedCount = Object.keys(sourceMessages).length
      const finalCount = Object.keys(mergedMessages).length

      return {
        success: true,
        message: `成功复制 ${copiedCount} 条错误信息到目标账户`,
        copiedCount,
        finalCount,
        sourceMessages,
        finalMessages: mergedMessages
      }
    } catch (err) {
      logger.error('Failed to copy custom upstream error messages:', err)
      return {
        success: false,
        message: err.message,
        copiedCount: 0
      }
    }
  }

  /**
   * 获取所有有自定义错误信息的账户列表（用于复制功能的源选择）
   */
  async getAccountsWithCustomMessages() {
    try {
      const client = redis.getClientSafe()

      // 优先使用索引集合，避免使用 KEYS（在集群/大数据量下更安全）
      const indexedIds = await client.smembers(this.CUSTOM_MESSAGES_INDEX_KEY)
      const accountsWithMessages = []

      if (indexedIds && indexedIds.length > 0) {
        for (const accountId of indexedIds) {
          const key = `upstream_error_messages:${accountId}`
          const messages = await client.hgetall(key)
          const messageCount = Object.keys(messages || {}).length
          if (messageCount > 0) {
            accountsWithMessages.push({
              accountId,
              messageCount,
              errorTypes: Object.keys(messages)
            })
          } else {
            // 清理索引中已空的账户
            await client.srem(this.CUSTOM_MESSAGES_INDEX_KEY, accountId)
          }
        }
        // 如果索引存在但读取为空，降级执行一次全量扫描
        if (accountsWithMessages.length > 0) {
          return { success: true, data: accountsWithMessages }
        }
      }

      // 兼容：索引为空时，回退扫描（仅用于初始化或兼容老数据）
      const pattern = 'upstream_error_messages:*'
      const keys = await client.keys(pattern)
      for (const key of keys) {
        const accountId = key.replace('upstream_error_messages:', '')
        const messages = await client.hgetall(key)
        const messageCount = Object.keys(messages || {}).length
        if (messageCount > 0) {
          accountsWithMessages.push({
            accountId,
            messageCount,
            errorTypes: Object.keys(messages)
          })
          // 同步写入索引
          await client.sadd(this.CUSTOM_MESSAGES_INDEX_KEY, accountId)
        }
      }

      return { success: true, data: accountsWithMessages }
    } catch (err) {
      logger.error('Failed to get accounts with custom messages:', err)
      return { success: false, data: [] }
    }
  }

  /**
   * 重建账户索引集合（从现有 key 扫描）
   */
  async rebuildAccountsWithCustomMessagesIndex() {
    try {
      const client = redis.getClientSafe()
      const pattern = 'upstream_error_messages:*'
      const keys = await client.keys(pattern)
      // 清空旧索引
      await client.del(this.CUSTOM_MESSAGES_INDEX_KEY)

      for (const key of keys) {
        const accountId = key.replace('upstream_error_messages:', '')
        const count = await client.hlen(key)
        if (count > 0) {
          await client.sadd(this.CUSTOM_MESSAGES_INDEX_KEY, accountId)
        }
      }
      return { success: true }
    } catch (err) {
      logger.error('Failed to rebuild custom messages index:', err)
      return { success: false, message: err.message }
    }
  }

  /**
   * 根据账户与错误类型，返回将给客户端的文案
   */
  async getClientMessage(accountId, errorType) {
    const custom = await this.getCustomMessages(accountId)
    if (custom && custom[errorType]) {
      return custom[errorType]
    }
    return this.DEFAULT_MESSAGES[errorType] || this.DEFAULT_MESSAGES.unknown
  }
}

module.exports = new UpstreamErrorService()
