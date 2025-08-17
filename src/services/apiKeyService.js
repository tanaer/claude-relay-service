const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')
const config = require('../../config/config')
const redis = require('../models/redis')
const logger = require('../utils/logger')

class ApiKeyService {
  constructor() {
    this.prefix = config.security.apiKeyPrefix
  }

  // 🔑 生成新的API Key
  async generateApiKey(options = {}) {
    try {
      const {
        name = 'Unnamed Key',
        description = '',
        tokenLimit = config.limits.defaultTokenLimit,
        expiresAt = null,
        claudeAccountId = null,
        claudeConsoleAccountId = null,
        geminiAccountId = null,
        permissions = 'all', // 'claude', 'gemini', 'all'
        isActive = true,
        concurrencyLimit = 0,
        rateLimitWindow = null,
        rateLimitRequests = null,
        enableModelRestriction = false,
        restrictedModels = [],
        enableClientRestriction = false,
        allowedClients = [],
        dailyCostLimit = 0,
        tags = [],
        rateTemplateId = null
      } = options

      // 生成简单的API Key (64字符十六进制)
      const apiKey = `${this.prefix}${this._generateSecretKey()}`
      const keyId = uuidv4()
      const hashedKey = this._hashApiKey(apiKey)

      const keyData = {
        id: keyId,
        name,
        description,
        apiKey: hashedKey,
        tokenLimit: String(tokenLimit ?? 0),
        concurrencyLimit: String(concurrencyLimit ?? 0),
        rateLimitWindow: String(rateLimitWindow ?? 0),
        rateLimitRequests: String(rateLimitRequests ?? 0),
        isActive: String(isActive),
        claudeAccountId: claudeAccountId || '',
        claudeConsoleAccountId: claudeConsoleAccountId || '',
        geminiAccountId: geminiAccountId || '',
        permissions: permissions || 'all',
        enableModelRestriction: String(enableModelRestriction),
        restrictedModels: JSON.stringify(restrictedModels || []),
        enableClientRestriction: String(enableClientRestriction || false),
        allowedClients: JSON.stringify(allowedClients || []),
        dailyCostLimit: String(dailyCostLimit || 0),
        tags: JSON.stringify(tags || []),
        rateTemplateId: rateTemplateId || '',
        createdAt: new Date().toISOString(),
        lastUsedAt: '',
        expiresAt: expiresAt || '',
        createdBy: 'admin' // 可以根据需要扩展用户系统
      }

      // 保存API Key数据并建立哈希映射
      await redis.setApiKey(keyId, keyData, hashedKey)

      logger.success(`🔑 Generated new API key: ${name} (${keyId})`)

      return {
        success: true,
        id: keyId,
        apiKey, // 只在创建时返回完整的key
        name: keyData.name,
        description: keyData.description,
        tokenLimit: parseInt(keyData.tokenLimit),
        concurrencyLimit: parseInt(keyData.concurrencyLimit),
        rateLimitWindow: parseInt(keyData.rateLimitWindow || 0),
        rateLimitRequests: parseInt(keyData.rateLimitRequests || 0),
        isActive: keyData.isActive === 'true',
        claudeAccountId: keyData.claudeAccountId,
        claudeConsoleAccountId: keyData.claudeConsoleAccountId,
        geminiAccountId: keyData.geminiAccountId,
        permissions: keyData.permissions,
        enableModelRestriction: keyData.enableModelRestriction === 'true',
        restrictedModels: JSON.parse(keyData.restrictedModels),
        enableClientRestriction: keyData.enableClientRestriction === 'true',
        allowedClients: JSON.parse(keyData.allowedClients || '[]'),
        dailyCostLimit: parseFloat(keyData.dailyCostLimit || 0),
        tags: JSON.parse(keyData.tags || '[]'),
        rateTemplateId: keyData.rateTemplateId || null,
        createdAt: keyData.createdAt,
        expiresAt: keyData.expiresAt,
        createdBy: keyData.createdBy
      }
    } catch (error) {
      logger.error('❌ Failed to generate API key:', {
        error: error.message,
        stack: error.stack,
        options: JSON.stringify(options, null, 2)
      })
      throw error
    }
  }

  // 🔍 验证API Key
  async validateApiKey(apiKey) {
    try {
      if (!apiKey || !apiKey.startsWith(this.prefix)) {
        return { valid: false, error: 'Invalid API key format' }
      }

      // 计算API Key的哈希值
      const hashedKey = this._hashApiKey(apiKey)

      // 通过哈希值直接查找API Key（性能优化）
      const keyData = await redis.findApiKeyByHash(hashedKey)

      if (!keyData) {
        return { valid: false, error: 'API key not found' }
      }

      // 检查是否激活
      if (keyData.isActive !== 'true') {
        return { valid: false, error: 'API key is disabled' }
      }

      // 检查是否过期
      if (keyData.expiresAt && new Date() > new Date(keyData.expiresAt)) {
        return { valid: false, error: 'API key has expired' }
      }

      // 获取使用统计（供返回数据使用）
      const usage = await redis.getUsageStats(keyData.id)

      // 获取当日费用统计
      const dailyCost = await redis.getDailyCost(keyData.id)

      // 更新最后使用时间（优化：只在实际API调用时更新，而不是验证时）
      // 注意：lastUsedAt的更新已移至recordUsage方法中

      logger.api(`🔓 API key validated successfully: ${keyData.id}`)

      // 解析限制模型数据
      let restrictedModels = []
      try {
        restrictedModels = keyData.restrictedModels ? JSON.parse(keyData.restrictedModels) : []
      } catch (e) {
        restrictedModels = []
      }

      // 解析允许的客户端
      let allowedClients = []
      try {
        allowedClients = keyData.allowedClients ? JSON.parse(keyData.allowedClients) : []
      } catch (e) {
        allowedClients = []
      }

      // 解析标签
      let tags = []
      try {
        tags = keyData.tags ? JSON.parse(keyData.tags) : []
      } catch (e) {
        tags = []
      }

      return {
        valid: true,
        keyData: {
          id: keyData.id,
          name: keyData.name,
          description: keyData.description,
          createdAt: keyData.createdAt,
          expiresAt: keyData.expiresAt,
          claudeAccountId: keyData.claudeAccountId,
          claudeConsoleAccountId: keyData.claudeConsoleAccountId,
          geminiAccountId: keyData.geminiAccountId,
          permissions: keyData.permissions || 'all',
          tokenLimit: parseInt(keyData.tokenLimit),
          concurrencyLimit: parseInt(keyData.concurrencyLimit || 0),
          rateLimitWindow: parseInt(keyData.rateLimitWindow || 0),
          rateLimitRequests: parseInt(keyData.rateLimitRequests || 0),
          enableModelRestriction: keyData.enableModelRestriction === 'true',
          restrictedModels,
          enableClientRestriction: keyData.enableClientRestriction === 'true',
          allowedClients,
          dailyCostLimit: parseFloat(keyData.dailyCostLimit || 0),
          dailyCost: dailyCost || 0,
          tags,
          rateTemplateId: keyData.rateTemplateId || null,
          usage
        }
      }
    } catch (error) {
      logger.error('❌ API key validation error:', error)
      return { valid: false, error: 'Internal validation error' }
    }
  }

  // 📋 获取所有API Keys
  async getAllApiKeys() {
    try {
      const apiKeys = await redis.getAllApiKeys()
      const client = redis.getClientSafe()

      // 为每个key添加使用统计和当前并发数
      for (const key of apiKeys) {
        key.usage = await redis.getUsageStats(key.id)
        key.tokenLimit = parseInt(key.tokenLimit)
        key.concurrencyLimit = parseInt(key.concurrencyLimit || 0)
        key.rateLimitWindow = parseInt(key.rateLimitWindow || 0)
        key.rateLimitRequests = parseInt(key.rateLimitRequests || 0)
        key.currentConcurrency = await redis.getConcurrency(key.id)
        key.isActive = key.isActive === 'true'
        key.enableModelRestriction = key.enableModelRestriction === 'true'
        key.enableClientRestriction = key.enableClientRestriction === 'true'
        key.permissions = key.permissions || 'all' // 兼容旧数据
        key.dailyCostLimit = parseFloat(key.dailyCostLimit || 0)
        key.dailyCost = (await redis.getDailyCost(key.id)) || 0
        key.rateTemplateId = key.rateTemplateId || null

        // 获取当前时间窗口的请求次数和Token使用量
        if (key.rateLimitWindow > 0) {
          const requestCountKey = `rate_limit:requests:${key.id}`
          const tokenCountKey = `rate_limit:tokens:${key.id}`
          const windowStartKey = `rate_limit:window_start:${key.id}`

          key.currentWindowRequests = parseInt((await client.get(requestCountKey)) || '0')
          key.currentWindowTokens = parseInt((await client.get(tokenCountKey)) || '0')

          // 获取窗口开始时间和计算剩余时间
          const windowStart = await client.get(windowStartKey)
          if (windowStart) {
            const now = Date.now()
            const windowStartTime = parseInt(windowStart)
            const windowDuration = key.rateLimitWindow * 60 * 1000 // 转换为毫秒
            const windowEndTime = windowStartTime + windowDuration

            // 如果窗口还有效
            if (now < windowEndTime) {
              key.windowStartTime = windowStartTime
              key.windowEndTime = windowEndTime
              key.windowRemainingSeconds = Math.max(0, Math.floor((windowEndTime - now) / 1000))
            } else {
              // 窗口已过期，下次请求会重置
              key.windowStartTime = null
              key.windowEndTime = null
              key.windowRemainingSeconds = 0
              // 重置计数为0，因为窗口已过期
              key.currentWindowRequests = 0
              key.currentWindowTokens = 0
            }
          } else {
            // 窗口还未开始（没有任何请求）
            key.windowStartTime = null
            key.windowEndTime = null
            key.windowRemainingSeconds = null
          }
        } else {
          key.currentWindowRequests = 0
          key.currentWindowTokens = 0
          key.windowStartTime = null
          key.windowEndTime = null
          key.windowRemainingSeconds = null
        }

        try {
          key.restrictedModels = key.restrictedModels ? JSON.parse(key.restrictedModels) : []
        } catch (e) {
          key.restrictedModels = []
        }
        try {
          key.allowedClients = key.allowedClients ? JSON.parse(key.allowedClients) : []
        } catch (e) {
          key.allowedClients = []
        }
        try {
          key.tags = key.tags ? JSON.parse(key.tags) : []
        } catch (e) {
          key.tags = []
        }
        delete key.apiKey // 不返回哈希后的key
      }

      return apiKeys
    } catch (error) {
      logger.error('❌ Failed to get API keys:', error)
      throw error
    }
  }

  // 📝 更新API Key
  async updateApiKey(keyId, updates) {
    try {
      const keyData = await redis.getApiKey(keyId)
      if (!keyData || Object.keys(keyData).length === 0) {
        throw new Error('API key not found')
      }

      // 允许更新的字段
      const allowedUpdates = [
        'name',
        'description',
        'tokenLimit',
        'concurrencyLimit',
        'rateLimitWindow',
        'rateLimitRequests',
        'isActive',
        'claudeAccountId',
        'claudeConsoleAccountId',
        'geminiAccountId',
        'permissions',
        'expiresAt',
        'enableModelRestriction',
        'restrictedModels',
        'enableClientRestriction',
        'allowedClients',
        'dailyCostLimit',
        'tags',
        'rateTemplateId'
      ]
      const updatedData = { ...keyData }

      for (const [field, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(field)) {
          if (field === 'restrictedModels' || field === 'allowedClients' || field === 'tags') {
            // 特殊处理数组字段
            updatedData[field] = JSON.stringify(value || [])
          } else if (field === 'enableModelRestriction' || field === 'enableClientRestriction') {
            // 布尔值转字符串
            updatedData[field] = String(value)
          } else {
            updatedData[field] = (value !== null && value !== undefined ? value : '').toString()
          }
        }
      }

      updatedData.updatedAt = new Date().toISOString()

      // 更新时不需要重新建立哈希映射，因为API Key本身没有变化
      await redis.setApiKey(keyId, updatedData)

      logger.success(`📝 Updated API key: ${keyId}`)

      return { success: true }
    } catch (error) {
      logger.error('❌ Failed to update API key:', error)
      throw error
    }
  }

  // 📝 从动态策略引擎更新API Key（专用方法）
  async updateApiKeyFromDynamicPolicy(keyId, updates) {
    try {
      // 添加更新来源标记
      const updatesWithSource = {
        ...updates,
        updatedBy: 'dynamic_policy_engine'
      }

      // 调用标准更新方法
      const result = await this.updateApiKey(keyId, updatesWithSource)

      logger.info(`📝 [动态策略] 更新 API Key: ${keyId}，模板: ${updates.rateTemplateId || 'N/A'}`)

      return result
    } catch (error) {
      logger.error(`❌ [动态策略] 更新 API Key 失败: ${keyId}`, error)
      throw error
    }
  }

  // 🗑️ 删除API Key
  async deleteApiKey(keyId) {
    try {
      const result = await redis.deleteApiKey(keyId)

      if (result === 0) {
        throw new Error('API key not found')
      }

      logger.success(`🗑️ Deleted API key: ${keyId}`)

      return { success: true }
    } catch (error) {
      logger.error('❌ Failed to delete API key:', error)
      throw error
    }
  }

  // 📊 记录使用情况（支持缓存token和账户级别统计）
  async recordUsage(
    keyId,
    inputTokens = 0,
    outputTokens = 0,
    cacheCreateTokens = 0,
    cacheReadTokens = 0,
    model = 'unknown',
    accountId = null,
    apiKeyData = null // 新增参数：可选的API Key数据，避免重复查询
  ) {
    try {
      const dynamicPolicyEngine = require('./dynamicPolicyEngine') // 在方法内部引入以避免循环依赖
      const totalTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

      // 计算费用
      const CostCalculator = require('../utils/costCalculator')
      const originalCostInfo = CostCalculator.calculateCost(
        {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_creation_input_tokens: cacheCreateTokens,
          cache_read_input_tokens: cacheReadTokens
        },
        model
      )

      // 应用倍率模板 - 优先使用传入的 apiKeyData，避免重复查询
      const rateTemplateService = require('./rateTemplateService')
      let rates = await rateTemplateService.getRatesForEntity(
        keyId,
        'apikey',
        apiKeyData // 传递 apiKeyData 以避免重复查询
      )

      // 如果 API Key 没有绑定倍率模板（rateTemplateId 为空），优先根据“实际使用的账户”回退查找倍率
      // 这样可覆盖共享/专属池（system_group_rate:shared/dedicated），避免默认模板误用
      const apiKeyHasTemplate = !!(apiKeyData && apiKeyData.rateTemplateId)
      if (accountId && !apiKeyHasTemplate) {
        try {
          const client = redis.getClientSafe()
          let fallbackRates = null
          let fallbackEntityType = null

          // 1) Claude Console 账户
          const consoleAccount = await client.hgetall(`claude_console_account:${accountId}`)
          if (consoleAccount && consoleAccount.id) {
            fallbackEntityType = 'claude_console_account'
            fallbackRates = await rateTemplateService.getRatesForEntity(
              accountId,
              'claude_console_account'
            )
          }

          // 2) 官方 Claude OAuth 账户（若未命中 Console）
          if (!fallbackRates || Object.keys(fallbackRates).length === 0) {
            const oauthAccount = await client.hgetall(`claude_account:${accountId}`)
            if (oauthAccount && Object.keys(oauthAccount).length > 0) {
              fallbackEntityType = 'claude_account'
              fallbackRates = await rateTemplateService.getRatesForEntity(
                accountId,
                'claude_account'
              )
            }
          }

          // 3) Gemini 账户（若仍未命中）
          if (!fallbackRates || Object.keys(fallbackRates).length === 0) {
            const geminiAccount = await client.hgetall(`gemini_account:${accountId}`)
            if (geminiAccount && Object.keys(geminiAccount).length > 0) {
              fallbackEntityType = 'gemini_account'
              fallbackRates = await rateTemplateService.getRatesForEntity(
                accountId,
                'gemini_account'
              )
            }
          }

          if (fallbackRates && Object.keys(fallbackRates).length > 0) {
            rates = fallbackRates
            logger.info(
              `🔍 Using fallback rates from ${fallbackEntityType} ${accountId} for API Key ${keyId}`
            )
          } else {
            logger.debug(
              `🔍 No fallback rates found for account ${accountId}; using default or no multipliers`
            )
          }
        } catch (e) {
          logger.warn('⚠️ Failed to resolve fallback rates by accountId:', e)
        }
      }

      let costInfo = originalCostInfo
      if (rates && rates[model]) {
        // 支持两种倍率格式：
        // 1. 简单数字格式：{ "model": 1.2 }（四项统一倍率）
        // 2. 详细对象格式：{ "model": { input, output, cacheCreate, cacheRead } }
        const modelRate = rates[model]

        let multipliers = {
          input: 1.0,
          output: 1.0,
          cacheWrite: 1.0, // 前端为 cacheCreate
          cacheRead: 1.0
        }

        if (typeof modelRate === 'number') {
          const m = parseFloat(modelRate) || 1.0
          multipliers = { input: m, output: m, cacheWrite: m, cacheRead: m }
        } else if (typeof modelRate === 'object' && modelRate !== null) {
          multipliers = {
            input: parseFloat(modelRate.input) || 1.0,
            output: parseFloat(modelRate.output) || 1.0,
            // 兼容字段名：cacheCreate(前端) / cacheWrite(后端成本字段)
            cacheWrite:
              parseFloat(
                modelRate.cacheWrite !== undefined ? modelRate.cacheWrite : modelRate.cacheCreate
              ) || 1.0,
            cacheRead: parseFloat(modelRate.cacheRead) || 1.0
          }
        } else {
          const m = parseFloat(modelRate) || 1.0
          multipliers = { input: m, output: m, cacheWrite: m, cacheRead: m }
        }

        // 分别应用倍率，total 为四项求和
        const multipliedCosts = {
          input: originalCostInfo.costs.input * multipliers.input,
          output: originalCostInfo.costs.output * multipliers.output,
          cacheWrite: originalCostInfo.costs.cacheWrite * multipliers.cacheWrite,
          cacheRead: originalCostInfo.costs.cacheRead * multipliers.cacheRead
        }
        const multipliedTotal =
          multipliedCosts.input +
          multipliedCosts.output +
          multipliedCosts.cacheWrite +
          multipliedCosts.cacheRead

        costInfo = {
          ...originalCostInfo,
          costs: {
            ...multipliedCosts,
            total: multipliedTotal
          },
          appliedMultipliers: multipliers
        }

        logger.info(
          `💰 Applied rate multipliers for model ${model}: ` +
            `[input:${multipliers.input}x, output:${multipliers.output}x, cacheCreate/cacheWrite:${multipliers.cacheWrite}x, cacheRead:${multipliers.cacheRead}x] ` +
            `$${originalCostInfo.costs.total.toFixed(6)} -> $${costInfo.costs.total.toFixed(6)} (API Key: ${keyId})`
        )
      } else {
        logger.debug(`💰 No rate multiplier found for model ${model} (API Key: ${keyId})`)
      }

      // 记录API Key级别的使用统计
      await redis.incrementTokenUsage(
        keyId,
        totalTokens,
        inputTokens,
        outputTokens,
        cacheCreateTokens,
        cacheReadTokens,
        model,
        costInfo.costs.total // 传递应用倍率后的实际费用
      )

      // 记录费用统计
      if (costInfo.costs.total > 0) {
        await redis.incrementDailyCost(keyId, costInfo.costs.total)
        logger.database(
          `💰 Recorded cost for ${keyId}: $${costInfo.costs.total.toFixed(6)}, model: ${model}`
        )
      } else {
        logger.debug(`💰 No cost recorded for ${keyId} - zero cost for model: ${model}`)
      }

      // 获取API Key数据以确定关联的账户
      const keyData = await redis.getApiKey(keyId)
      if (keyData && Object.keys(keyData).length > 0) {
        // 更新最后使用时间
        keyData.lastUsedAt = new Date().toISOString()
        await redis.setApiKey(keyId, keyData)

        // 记录账户级别的使用统计（只统计实际处理请求的账户）
        if (accountId) {
          await redis.incrementAccountUsage(
            accountId,
            totalTokens,
            inputTokens,
            outputTokens,
            cacheCreateTokens,
            cacheReadTokens,
            model
          )
          logger.database(
            `📊 Recorded account usage: ${accountId} - ${totalTokens} tokens (API Key: ${keyId})`
          )
        } else {
          logger.debug(
            '⚠️ No accountId provided for usage recording, skipping account-level statistics'
          )
        }
      }

      const logParts = [`Model: ${model}`, `Input: ${inputTokens}`, `Output: ${outputTokens}`]
      if (cacheCreateTokens > 0) {
        logParts.push(`Cache Create: ${cacheCreateTokens}`)
      }
      if (cacheReadTokens > 0) {
        logParts.push(`Cache Read: ${cacheReadTokens}`)
      }
      logParts.push(`Total: ${totalTokens} tokens`)

      logger.database(`📊 Recorded usage: ${keyId} - ${logParts.join(', ')}`)

      // 触发动态策略检查（兑换码动态计费功能）
      try {
        await dynamicPolicyEngine.handleUsageUpdate(keyId, {
          totalTokens,
          inputTokens,
          outputTokens,
          cacheCreateTokens,
          cacheReadTokens,
          model,
          accountId
        })
      } catch (policyError) {
        // 策略检查失败不影响主要功能，仅记录警告
        logger.warn(`⚠️ 策略检查失败 API Key ${keyId}: ${policyError.message}`)
      }
    } catch (error) {
      logger.error('❌ Failed to record usage:', error)
    }
  }

  // 🔐 生成密钥
  _generateSecretKey() {
    return crypto.randomBytes(32).toString('hex')
  }

  // 🔒 哈希API Key
  _hashApiKey(apiKey) {
    return crypto
      .createHash('sha256')
      .update(apiKey + config.security.encryptionKey)
      .digest('hex')
  }

  // 📈 获取使用统计
  async getUsageStats(keyId) {
    return await redis.getUsageStats(keyId)
  }

  // 📊 获取账户使用统计
  async getAccountUsageStats(accountId) {
    return await redis.getAccountUsageStats(accountId)
  }

  // 📈 获取所有账户使用统计
  async getAllAccountsUsageStats() {
    return await redis.getAllAccountsUsageStats()
  }

  // 🧹 清理过期的API Keys
  async cleanupExpiredKeys() {
    try {
      const apiKeys = await redis.getAllApiKeys()
      const now = new Date()
      let cleanedCount = 0

      for (const key of apiKeys) {
        // 检查是否已过期且仍处于激活状态
        if (key.expiresAt && new Date(key.expiresAt) < now && key.isActive === 'true') {
          // 将过期的 API Key 标记为禁用状态，而不是直接删除
          await this.updateApiKey(key.id, { isActive: false })
          logger.info(`🔒 API Key ${key.id} (${key.name}) has expired and been disabled`)
          cleanedCount++
        }
      }

      if (cleanedCount > 0) {
        logger.success(`🧹 Disabled ${cleanedCount} expired API keys`)
      }

      return cleanedCount
    } catch (error) {
      logger.error('❌ Failed to cleanup expired keys:', error)
      return 0
    }
  }
}

// 导出实例和单独的方法
const apiKeyService = new ApiKeyService()

// 为了方便其他服务调用，导出 recordUsage 方法
apiKeyService.recordUsageMetrics = apiKeyService.recordUsage.bind(apiKeyService)

module.exports = apiKeyService
