const { v4: _uuidv4 } = require('uuid')
const logger = require('../utils/logger')
const redis = require('../models/redis')
const cardTypeModel = require('../models/cardTypeModel')

/**
 * 卡类型管理服务
 * 提供灵活的卡类型管理功能，与策略系统集成
 */
class CardTypeService {
  constructor() {
    this.CARD_TYPE_PREFIX = 'card_type:'
    this.CARD_TYPES_SET = 'card_types'
    this.ACTIVE_CARD_TYPES_SET = 'card_types:active'
    this.CATEGORY_INDEX_PREFIX = 'card_types:category:'
    this.TEMPLATE_INDEX_PREFIX = 'card_types:template:'
    this.BUILTIN_CARD_TYPES_SET = 'card_types:builtin'
  }

  /**
   * 获取卡类型使用统计
   * @param {string} cardTypeId - 卡类型ID
   * @returns {Promise<Object>} 统计数据
   */
  async getCardTypeStats(cardTypeId) {
    try {
      const _client = redis.getClientSafe()

      // 获取卡类型基本信息
      const cardType = await this.getCardType(cardTypeId)
      if (!cardType) {
        throw new Error('卡类型不存在')
      }

      // 统计数据收集
      const stats = {
        totalAssociatedKeys: 0,
        activeKeys: 0,
        totalRedemptions: 0,
        totalTokenUsage: 0,
        usageTrend: [],
        associatedKeys: [],
        redemptionHistory: []
      }

      // 查找关联的 API Keys
      const apiKeyService = require('./apiKeyService')
      const allApiKeys = await apiKeyService.getApiKeys()

      const associatedKeys = allApiKeys.filter((key) =>
        // 通过标签或其他方式判断关联关系
        this._isKeyAssociatedWithCardType(key, cardType)
      )

      stats.totalAssociatedKeys = associatedKeys.length
      stats.activeKeys = associatedKeys.filter((key) => key.active).length

      // 获取每个关联 API Key 的详细信息
      stats.associatedKeys = associatedKeys.map((key) => ({
        id: key.id,
        name: key.name,
        active: key.active,
        totalUsage: key.totalUsage || 0
      }))

      // 查找兑换历史（通过兑换码服务）
      try {
        const redemptionCodeService = require('./redemptionCodeService')
        const redemptionHistory = await redemptionCodeService.getRedemptionHistory({
          cardType: cardType.category // 根据分类查找
        })

        stats.redemptionHistory = redemptionHistory || []
        stats.totalRedemptions = stats.redemptionHistory.length
      } catch (redemptionError) {
        logger.warn('获取兑换历史失败:', redemptionError)
      }

      // 计算总使用量
      stats.totalTokenUsage = stats.associatedKeys.reduce(
        (total, key) => total + (key.totalUsage || 0),
        0
      )

      // 生成使用趋势（过去30天）
      stats.usageTrend = await this._generateUsageTrend(cardTypeId, associatedKeys, 30)

      logger.info(`📊 成功获取卡类型 ${cardTypeId} 的统计数据`)

      return {
        success: true,
        data: stats
      }
    } catch (error) {
      logger.error(`获取卡类型统计失败: ${error.message}`)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 判断 API Key 是否与卡类型关联
   * @param {Object} apiKey - API Key 对象
   * @param {Object} cardType - 卡类型对象
   * @returns {boolean} 是否关联
   */
  _isKeyAssociatedWithCardType(apiKey, cardType) {
    if (!apiKey.tags || !Array.isArray(apiKey.tags)) {
      return false
    }

    // 通过标签判断关联关系
    const cardTypeTag = `${cardType.category}-card`
    return apiKey.tags.includes(cardTypeTag)
  }

  /**
   * 生成使用趋势数据
   * @param {string} cardTypeId - 卡类型ID
   * @param {Array} associatedKeys - 关联的API Keys
   * @param {number} days - 天数
   * @returns {Promise<Array>} 趋势数据
   */
  async _generateUsageTrend(cardTypeId, associatedKeys, days) {
    const trend = []
    const now = new Date()

    try {
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        const dateStr = date.toISOString().split('T')[0] // YYYY-MM-DD

        let dailyUsage = 0

        // 为每个关联的 API Key 计算当日使用量
        for (const key of associatedKeys) {
          const usageKey = `usage:daily:${dateStr}:${key.id}`
          try {
            const client = redis.getClientSafe()
            const usage = await client.hgetall(usageKey)

            // 累加所有模型的使用量
            for (const [_model, count] of Object.entries(usage)) {
              dailyUsage += parseInt(count) || 0
            }
          } catch (error) {
            // 忽略单个key的错误，继续处理其他key
            logger.debug(`获取使用量数据失败 ${usageKey}:`, error)
          }
        }

        trend.push({
          date: dateStr,
          usage: dailyUsage
        })
      }
    } catch (error) {
      logger.warn('生成使用趋势失败:', error)
    }

    return trend
  }

  /**
   * 创建新的卡类型
   * @param {Object} cardTypeData - 卡类型数据
   * @returns {Promise<Object>} 创建结果
   */
  async createCardType(cardTypeData) {
    try {
      // 数据验证
      const validation = cardTypeModel.validate(cardTypeData)
      if (!validation.valid) {
        return {
          success: false,
          error: '数据验证失败',
          details: validation.errors
        }
      }

      // 检查名称是否重复
      const existingByName = await this.getCardTypeByName(cardTypeData.name)
      if (existingByName) {
        return {
          success: false,
          error: '卡类型名称已存在'
        }
      }

      const client = redis.getClientSafe()
      const cardType = cardTypeModel.create(cardTypeData)
      const redisData = cardTypeModel.toRedisHash(cardType)

      // 保存卡类型数据
      await client.hset(`${this.CARD_TYPE_PREFIX}${cardType.id}`, redisData)

      // 更新索引
      await this._updateIndexes(cardType, 'create')

      logger.info(`✅ 创建卡类型成功: ${cardType.name} (${cardType.id})`)

      return {
        success: true,
        data: cardType
      }
    } catch (error) {
      logger.error('❌ 创建卡类型失败:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 获取单个卡类型
   * @param {string} cardTypeId - 卡类型ID
   * @returns {Promise<Object|null>} 卡类型数据
   */
  async getCardType(cardTypeId) {
    try {
      const client = redis.getClientSafe()
      const redisData = await client.hgetall(`${this.CARD_TYPE_PREFIX}${cardTypeId}`)

      return cardTypeModel.fromRedisHash(redisData)
    } catch (error) {
      logger.error(`❌ 获取卡类型失败 (${cardTypeId}):`, error)
      return null
    }
  }

  /**
   * 根据名称获取卡类型
   * @param {string} name - 卡类型名称
   * @returns {Promise<Object|null>} 卡类型数据
   */
  async getCardTypeByName(name) {
    try {
      const allCardTypes = await this.getAllCardTypes()
      return allCardTypes.find((cardType) => cardType.name === name) || null
    } catch (error) {
      logger.error(`❌ 根据名称获取卡类型失败 (${name}):`, error)
      return null
    }
  }

  /**
   * 获取卡类型列表（带过滤）
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 卡类型列表
   */
  async getCardTypes(options = {}) {
    try {
      const { category, status, includeInactive } = options

      // 构建查询条件
      const queryOptions = {
        category,
        activeOnly: status === 'active',
        includeBuiltIn: true
      }

      let cardTypes = await this.getAllCardTypes(queryOptions)

      // 根据状态过滤
      if (status === 'inactive') {
        cardTypes = cardTypes.filter((ct) => !ct.active)
      } else if (!includeInactive) {
        cardTypes = cardTypes.filter((ct) => ct.active)
      }

      return cardTypes
    } catch (error) {
      logger.error('❌ 获取卡类型列表失败:', error)
      return []
    }
  }

  /**
   * 获取所有卡类型
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 卡类型列表
   */
  async getAllCardTypes(options = {}) {
    try {
      const client = redis.getClientSafe()
      const { category, activeOnly = false, includeBuiltIn = true } = options

      let cardTypeIds
      if (category) {
        // 按分类筛选
        cardTypeIds = await client.smembers(`${this.CATEGORY_INDEX_PREFIX}${category}`)
      } else if (activeOnly) {
        // 只获取启用的
        cardTypeIds = await client.smembers(this.ACTIVE_CARD_TYPES_SET)
      } else {
        // 获取全部
        cardTypeIds = await client.smembers(this.CARD_TYPES_SET)
      }

      const cardTypes = []
      for (const id of cardTypeIds) {
        const cardType = await this.getCardType(id)
        if (cardType) {
          // 是否包含内置类型
          if (!includeBuiltIn && cardType.isBuiltIn) {
            continue
          }
          cardTypes.push(cardType)
        }
      }

      // 排序：内置类型在前，然后按创建时间排序
      return cardTypes.sort((a, b) => {
        if (a.isBuiltIn && !b.isBuiltIn) {
          return -1
        }
        if (!a.isBuiltIn && b.isBuiltIn) {
          return 1
        }
        return new Date(b.createdAt) - new Date(a.createdAt)
      })
    } catch (error) {
      logger.error('❌ 获取卡类型列表失败:', error)
      return []
    }
  }

  /**
   * 更新卡类型
   * @param {string} cardTypeId - 卡类型ID
   * @param {Object} updates - 更新数据
   * @returns {Promise<Object>} 更新结果
   */
  async updateCardType(cardTypeId, updates) {
    try {
      const existing = await this.getCardType(cardTypeId)
      if (!existing) {
        return {
          success: false,
          error: '卡类型不存在'
        }
      }

      // 数据验证
      const updatedData = { ...existing, ...updates }
      const validation = cardTypeModel.validate(updatedData)
      if (!validation.valid) {
        return {
          success: false,
          error: '数据验证失败',
          details: validation.errors
        }
      }

      // 检查名称冲突（如果更新了名称）
      if (updates.name && updates.name !== existing.name) {
        const existingByName = await this.getCardTypeByName(updates.name)
        if (existingByName && existingByName.id !== cardTypeId) {
          return {
            success: false,
            error: '卡类型名称已存在'
          }
        }
      }

      const client = redis.getClientSafe()
      const updatedCardType = cardTypeModel.update(existing, updates)
      const redisData = cardTypeModel.toRedisHash(updatedCardType)

      // 更新数据
      await client.hset(`${this.CARD_TYPE_PREFIX}${cardTypeId}`, redisData)

      // 更新索引（如果分类或状态发生变化）
      if (updates.category || updates.isActive !== undefined || updates.rateTemplateId) {
        await this._updateIndexes(updatedCardType, 'update', existing)
      }

      logger.info(`✅ 更新卡类型成功: ${updatedCardType.name} (${cardTypeId})`)

      return {
        success: true,
        data: updatedCardType
      }
    } catch (error) {
      logger.error(`❌ 更新卡类型失败 (${cardTypeId}):`, error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 删除卡类型
   * @param {string} cardTypeId - 卡类型ID
   * @param {boolean} force - 是否强制删除（忽略依赖检查）
   * @returns {Promise<Object>} 删除结果
   */
  async deleteCardType(cardTypeId, force = false) {
    try {
      const cardType = await this.getCardType(cardTypeId)
      if (!cardType) {
        return {
          success: false,
          error: '卡类型不存在'
        }
      }

      // 内置类型不能删除
      if (cardType.isBuiltIn) {
        return {
          success: false,
          error: '不能删除内置卡类型'
        }
      }

      // 检查依赖关系（除非强制删除）
      if (!force) {
        const dependencies = await this._checkDependencies(cardTypeId)
        if (dependencies.length > 0) {
          return {
            success: false,
            error: '卡类型存在依赖关系，无法删除',
            dependencies
          }
        }
      }

      const client = redis.getClientSafe()

      // 删除主数据
      await client.del(`${this.CARD_TYPE_PREFIX}${cardTypeId}`)

      // 清理索引
      await this._updateIndexes(cardType, 'delete')

      logger.info(`✅ 删除卡类型成功: ${cardType.name} (${cardTypeId})`)

      return {
        success: true,
        message: '卡类型删除成功'
      }
    } catch (error) {
      logger.error(`❌ 删除卡类型失败 (${cardTypeId}):`, error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 切换卡类型启用状态
   * @param {string} cardTypeId - 卡类型ID
   * @returns {Promise<Object>} 操作结果
   */
  async toggleCardType(cardTypeId) {
    try {
      const cardType = await this.getCardType(cardTypeId)
      if (!cardType) {
        return {
          success: false,
          error: '卡类型不存在'
        }
      }

      const newStatus = !cardType.isActive
      const result = await this.updateCardType(cardTypeId, { isActive: newStatus })

      if (result.success) {
        logger.info(`✅ 卡类型状态切换: ${cardType.name} -> ${newStatus ? '启用' : '禁用'}`)
      }

      return result
    } catch (error) {
      logger.error(`❌ 切换卡类型状态失败 (${cardTypeId}):`, error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 获取卡类型的专属策略配置
   * @param {string} cardTypeId - 卡类型ID
   * @returns {Promise<Object|null>} 策略配置
   */
  async getCardTypePolicy(cardTypeId) {
    try {
      const cardType = await this.getCardType(cardTypeId)
      if (!cardType) {
        return null
      }

      return cardType.policyConfig || {}
    } catch (error) {
      logger.error(`❌ 获取卡类型策略失败 (${cardTypeId}):`, error)
      return null
    }
  }

  /**
   * 更新卡类型的专属策略配置
   * @param {string} cardTypeId - 卡类型ID
   * @param {Object} policyConfig - 策略配置
   * @returns {Promise<Object>} 更新结果
   */
  async updateCardTypePolicy(cardTypeId, policyConfig) {
    try {
      return await this.updateCardType(cardTypeId, { policyConfig })
    } catch (error) {
      logger.error(`❌ 更新卡类型策略失败 (${cardTypeId}):`, error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 获取卡类型关联的计费倍率
   * @param {string} cardTypeId - 卡类型ID
   * @returns {Promise<Object>} 倍率配置
   */
  async getCardTypeRates(cardTypeId) {
    try {
      const cardType = await this.getCardType(cardTypeId)
      if (!cardType) {
        return {}
      }

      // 先使用自定义倍率，再尝试关联的模版
      if (Object.keys(cardType.customRates).length > 0) {
        return cardType.customRates
      }

      // 如果有关联的倍率模版，从模版服务获取
      if (cardType.rateTemplateId) {
        const rateTemplateService = require('./rateTemplateService')
        const template = await rateTemplateService.getTemplate(cardType.rateTemplateId)
        return template?.rates || {}
      }

      return {}
    } catch (error) {
      logger.error(`❌ 获取卡类型倍率失败 (${cardTypeId}):`, error)
      return {}
    }
  }

  /**
   * 更新卡类型的自定义倍率
   * @param {string} cardTypeId - 卡类型ID
   * @param {Object} customRates - 自定义倍率配置
   * @returns {Promise<Object>} 更新结果
   */
  async updateCardTypeRates(cardTypeId, customRates) {
    try {
      return await this.updateCardType(cardTypeId, { customRates })
    } catch (error) {
      logger.error(`❌ 更新卡类型倍率失败 (${cardTypeId}):`, error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 应用计费模版到卡类型
   * @param {string} cardTypeId - 卡类型ID
   * @param {string} templateId - 模版ID
   * @param {boolean} clearCustomRates - 是否清除自定义倍率
   * @returns {Promise<Object>} 应用结果
   */
  async applyRateTemplate(cardTypeId, templateId, clearCustomRates = true) {
    try {
      const updates = { rateTemplateId: templateId }

      if (clearCustomRates) {
        updates.customRates = {}
      }

      const result = await this.updateCardType(cardTypeId, updates)

      if (result.success) {
        logger.info(`✅ 应用计费模版成功: 卡类型${cardTypeId} -> 模版${templateId}`)
      }

      return result
    } catch (error) {
      logger.error(`❌ 应用计费模版失败 (${cardTypeId} -> ${templateId}):`, error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 获取卡类型统计信息
   * @returns {Promise<Object>} 统计数据
   */
  async getCardTypeOverallStats() {
    try {
      const client = redis.getClientSafe()

      const totalCount = await client.scard(this.CARD_TYPES_SET)
      const activeCount = await client.scard(this.ACTIVE_CARD_TYPES_SET)
      const builtinCount = await client.scard(this.BUILTIN_CARD_TYPES_SET)

      // 按分类统计
      const categoryStats = {}
      for (const category of Object.values(cardTypeModel.CATEGORIES)) {
        const count = await client.scard(`${this.CATEGORY_INDEX_PREFIX}${category}`)
        categoryStats[category] = count
      }

      return {
        total: totalCount,
        active: activeCount,
        builtin: builtinCount,
        byCategory: categoryStats
      }
    } catch (error) {
      logger.error('❌ 获取卡类型统计失败:', error)
      return {
        total: 0,
        active: 0,
        builtin: 0,
        byCategory: {}
      }
    }
  }

  /**
   * 初始化内置卡类型
   * @returns {Promise<Object>} 初始化结果
   */
  async initializeBuiltinCardTypes() {
    try {
      const results = { created: [], skipped: [], errors: [] }

      // 创建内置日卡
      const dailyCardType = cardTypeModel.createBuiltinDaily()
      const existingDaily = await this.getCardType(dailyCardType.id)
      if (!existingDaily) {
        const dailyResult = await this.createCardType(dailyCardType)
        if (dailyResult.success) {
          results.created.push('内置日卡')
        } else {
          results.errors.push(`创建内置日卡失败: ${dailyResult.error}`)
        }
      } else {
        results.skipped.push('内置日卡已存在')
      }

      // 创建内置月卡
      const monthlyCardType = cardTypeModel.createBuiltinMonthly()
      const existingMonthly = await this.getCardType(monthlyCardType.id)
      if (!existingMonthly) {
        const monthlyResult = await this.createCardType(monthlyCardType)
        if (monthlyResult.success) {
          results.created.push('内置月卡')
        } else {
          results.errors.push(`创建内置月卡失败: ${monthlyResult.error}`)
        }
      } else {
        results.skipped.push('内置月卡已存在')
      }

      logger.info(
        `✅ 内置卡类型初始化完成: 创建${results.created.length}个, 跳过${results.skipped.length}个`
      )

      return {
        success: results.errors.length === 0,
        results
      }
    } catch (error) {
      logger.error('❌ 初始化内置卡类型失败:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 更新索引
   * @param {Object} cardType - 卡类型数据
   * @param {string} operation - 操作类型：create、update、delete
   * @param {Object} oldCardType - 旧数据（用于update和delete）
   * @private
   */
  async _updateIndexes(cardType, operation, oldCardType = null) {
    try {
      const client = redis.getClientSafe()

      if (operation === 'create') {
        // 添加到主索引
        await client.sadd(this.CARD_TYPES_SET, cardType.id)

        // 添加到分类索引
        await client.sadd(`${this.CATEGORY_INDEX_PREFIX}${cardType.category}`, cardType.id)

        // 添加到状态索引
        if (cardType.isActive) {
          await client.sadd(this.ACTIVE_CARD_TYPES_SET, cardType.id)
        }

        // 添加到内置索引
        if (cardType.isBuiltIn) {
          await client.sadd(this.BUILTIN_CARD_TYPES_SET, cardType.id)
        }

        // 添加到模版索引
        if (cardType.rateTemplateId) {
          await client.sadd(`${this.TEMPLATE_INDEX_PREFIX}${cardType.rateTemplateId}`, cardType.id)
        }
      } else if (operation === 'update' && oldCardType) {
        // 更新分类索引
        if (cardType.category !== oldCardType.category) {
          await client.srem(`${this.CATEGORY_INDEX_PREFIX}${oldCardType.category}`, cardType.id)
          await client.sadd(`${this.CATEGORY_INDEX_PREFIX}${cardType.category}`, cardType.id)
        }

        // 更新状态索引
        if (cardType.isActive !== oldCardType.isActive) {
          if (cardType.isActive) {
            await client.sadd(this.ACTIVE_CARD_TYPES_SET, cardType.id)
          } else {
            await client.srem(this.ACTIVE_CARD_TYPES_SET, cardType.id)
          }
        }

        // 更新模版索引
        if (cardType.rateTemplateId !== oldCardType.rateTemplateId) {
          if (oldCardType.rateTemplateId) {
            await client.srem(
              `${this.TEMPLATE_INDEX_PREFIX}${oldCardType.rateTemplateId}`,
              cardType.id
            )
          }
          if (cardType.rateTemplateId) {
            await client.sadd(
              `${this.TEMPLATE_INDEX_PREFIX}${cardType.rateTemplateId}`,
              cardType.id
            )
          }
        }
      } else if (operation === 'delete') {
        // 从所有索引中移除
        await client.srem(this.CARD_TYPES_SET, cardType.id)
        await client.srem(`${this.CATEGORY_INDEX_PREFIX}${cardType.category}`, cardType.id)
        await client.srem(this.ACTIVE_CARD_TYPES_SET, cardType.id)
        await client.srem(this.BUILTIN_CARD_TYPES_SET, cardType.id)

        if (cardType.rateTemplateId) {
          await client.srem(`${this.TEMPLATE_INDEX_PREFIX}${cardType.rateTemplateId}`, cardType.id)
        }
      }
    } catch (error) {
      logger.error('❌ 更新卡类型索引失败:', error)
    }
  }

  /**
   * 批量编辑卡类型
   * @param {Array<string>} cardTypeIds - 卡类型ID列表
   * @param {Object} changes - 更改配置
   * @param {string} adminUsername - 管理员用户名
   * @returns {Promise<Object>} 批量编辑结果
   */
  async batchEditCardTypes(cardTypeIds, changes, adminUsername = 'admin') {
    try {
      let updated = 0
      let skipped = 0
      const errors = []

      for (const cardTypeId of cardTypeIds) {
        try {
          const cardType = await this.getCardType(cardTypeId)
          if (!cardType) {
            errors.push(`卡类型 ${cardTypeId} 不存在`)
            skipped++
            continue
          }

          // 跳过内置类型的某些操作
          if (cardType.isBuiltIn) {
            errors.push(`卡类型 ${cardType.name} 是内置类型，跳过修改`)
            skipped++
            continue
          }

          // 构建更新数据
          const updateData = { updatedBy: adminUsername }

          // 价格调整
          if (changes.priceAction) {
            const currentPrice = cardType.priceUsd || 0
            switch (changes.priceAction.type) {
              case 'set':
                updateData.priceUsd = changes.priceAction.value
                break
              case 'multiply':
                updateData.priceUsd = currentPrice * changes.priceAction.value
                break
              case 'add':
                updateData.priceUsd = currentPrice + changes.priceAction.value
                break
              case 'subtract':
                updateData.priceUsd = Math.max(0, currentPrice - changes.priceAction.value)
                break
            }
          }

          // Token数量调整
          if (changes.totalTokensAction) {
            const currentTokens = cardType.totalTokens || 0
            switch (changes.totalTokensAction.type) {
              case 'set':
                updateData.totalTokens = changes.totalTokensAction.value
                break
              case 'multiply':
                updateData.totalTokens = currentTokens * changes.totalTokensAction.value
                break
            }
          }

          if (changes.dailyTokensAction) {
            const currentTokens = cardType.dailyTokens || 0
            switch (changes.dailyTokensAction.type) {
              case 'set':
                updateData.dailyTokens = changes.dailyTokensAction.value
                break
              case 'multiply':
                updateData.dailyTokens = currentTokens * changes.dailyTokensAction.value
                break
            }
          }

          // 标签管理
          if (changes.addTags || changes.removeTags) {
            let currentTags = cardType.defaultTags || []

            if (changes.addTags) {
              currentTags = [...new Set([...currentTags, ...changes.addTags])]
            }

            if (changes.removeTags) {
              currentTags = currentTags.filter((tag) => !changes.removeTags.includes(tag))
            }

            updateData.defaultTags = currentTags
          }

          // 执行更新
          const result = await this.updateCardType(cardTypeId, updateData)

          if (result.success) {
            updated++
          } else {
            errors.push(`更新 ${cardType.name} 失败: ${result.error}`)
            skipped++
          }
        } catch (error) {
          errors.push(`处理 ${cardTypeId} 时出错: ${error.message}`)
          skipped++
        }
      }

      return {
        success: true,
        updated,
        skipped,
        errors
      }
    } catch (error) {
      logger.error('❌ 批量编辑卡类型失败:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 导出卡类型数据
   * @param {Object} options - 导出选项
   * @returns {Promise<Object>} 导出结果
   */
  async exportCardTypes(options = {}) {
    try {
      const { scope, format, fields, ids, limit } = options

      // 获取要导出的卡类型
      let cardTypes = []

      if (scope === 'selected' && ids) {
        // 导出选中的
        for (const id of ids) {
          const cardType = await this.getCardType(id)
          if (cardType) {
            cardTypes.push(cardType)
          }
        }
      } else if (scope === 'active') {
        // 导出启用的
        cardTypes = await this.getAllCardTypes({ activeOnly: true })
      } else if (scope === 'custom') {
        // 导出自定义的（非内置）
        const allTypes = await this.getAllCardTypes()
        cardTypes = allTypes.filter((ct) => !ct.isBuiltIn)
      } else {
        // 导出全部
        cardTypes = await this.getAllCardTypes()
      }

      // 限制数量（预览模式）
      if (limit && limit > 0) {
        cardTypes = cardTypes.slice(0, limit)
      }

      // 筛选字段
      if (fields && fields.length > 0) {
        cardTypes = cardTypes.map((cardType) => {
          const filtered = {}
          for (const field of fields) {
            if (cardType[field] !== undefined) {
              filtered[field] = cardType[field]
            }
          }
          return filtered
        })
      }

      // 格式转换
      let data
      let contentType

      switch (format) {
        case 'json':
          data = JSON.stringify(cardTypes, null, 2)
          contentType = 'application/json'
          break

        case 'csv':
          if (cardTypes.length === 0) {
            data = ''
          } else {
            const headers = Object.keys(cardTypes[0])
            const csvRows = [headers.join(',')]

            for (const cardType of cardTypes) {
              const row = headers.map((header) => {
                const value = cardType[header]
                if (typeof value === 'string') {
                  return `"${value.replace(/"/g, '""')}"`
                }
                return value || ''
              })
              csvRows.push(row.join(','))
            }

            data = csvRows.join('\n')
          }
          contentType = 'text/csv'
          break

        case 'yaml': {
          const yaml = require('js-yaml')
          data = yaml.dump(cardTypes, { noRefs: true, skipInvalid: true })
          contentType = 'text/yaml'
          break
        }

        default:
          throw new Error(`不支持的导出格式: ${format}`)
      }

      return {
        data,
        contentType,
        count: cardTypes.length
      }
    } catch (error) {
      logger.error('❌ 导出卡类型失败:', error)
      throw error
    }
  }

  /**
   * 导入卡类型数据
   * @param {Object} file - 上传的文件
   * @param {Object} options - 导入选项
   * @returns {Promise<Object>} 导入结果
   */
  async importCardTypes(file, options = {}) {
    try {
      const { mode, conflictResolution, validateOnly, createdBy } = options

      // 解析文件内容
      const fileContent = file.buffer.toString('utf8')
      let cardTypesData

      const fileExt = file.originalname.split('.').pop().toLowerCase()

      switch (fileExt) {
        case 'json':
          cardTypesData = JSON.parse(fileContent)
          break
        case 'csv': {
          // 简单的CSV解析
          const lines = fileContent.trim().split('\n')
          if (lines.length < 2) {
            throw new Error('CSV文件格式无效')
          }

          const headers = lines[0].split(',').map((h) => h.replace(/"/g, '').trim())
          cardTypesData = []

          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map((v) => v.replace(/"/g, '').trim())
            const item = {}
            headers.forEach((header, index) => {
              item[header] = values[index] || ''
            })
            cardTypesData.push(item)
          }
          break
        }
        case 'yaml':
        case 'yml': {
          const yaml = require('js-yaml')
          cardTypesData = yaml.load(fileContent)
          break
        }
        default:
          throw new Error(`不支持的文件格式: ${fileExt}`)
      }

      if (!Array.isArray(cardTypesData)) {
        cardTypesData = [cardTypesData]
      }

      const results = {
        success: true,
        stats: {
          total: cardTypesData.length,
          success: 0,
          skipped: 0,
          errors: 0
        },
        errors: []
      }

      // 验证和处理每个卡类型
      for (const [index, item] of cardTypesData.entries()) {
        try {
          // 基础验证
          if (!item.name) {
            results.errors.push(`第${index + 1}行: 缺少名称`)
            results.stats.errors++
            continue
          }

          // 检查重名冲突
          const existingCardType = await this.getCardTypeByName(item.name)

          if (existingCardType && mode === 'create') {
            results.errors.push(`第${index + 1}行: 卡类型"${item.name}"已存在`)
            results.stats.skipped++
            continue
          }

          if (existingCardType && conflictResolution === 'skip') {
            results.stats.skipped++
            continue
          }

          // 处理冲突
          let finalName = item.name
          if (existingCardType && conflictResolution === 'rename') {
            let counter = 1
            while (await this.getCardTypeByName(`${item.name}_${counter}`)) {
              counter++
            }
            finalName = `${item.name}_${counter}`
          }

          if (!validateOnly) {
            // 准备数据
            const cardTypeData = {
              name: finalName,
              description: item.description || '',
              category: item.category || 'unlimited',
              duration: parseInt(item.duration) || -1,
              totalTokens: parseInt(item.totalTokens) || 0,
              dailyTokens: parseInt(item.dailyTokens) || 0,
              priceUsd: parseFloat(item.priceUsd) || 0,
              active: item.active === true || item.active === 'true',
              defaultTags: Array.isArray(item.defaultTags) ? item.defaultTags : [],
              notes: item.notes || '',
              createdBy
            }

            let result
            if (existingCardType && (mode === 'update' || mode === 'upsert')) {
              // 更新现有的
              result = await this.updateCardType(existingCardType.id, cardTypeData)
            } else {
              // 创建新的
              result = await this.createCardType(cardTypeData)
            }

            if (result.success) {
              results.stats.success++
            } else {
              results.errors.push(`第${index + 1}行: ${result.error}`)
              results.stats.errors++
            }
          } else {
            // 仅验证模式
            results.stats.success++
          }
        } catch (error) {
          results.errors.push(`第${index + 1}行: ${error.message}`)
          results.stats.errors++
        }
      }

      if (results.stats.errors > 0 && results.stats.success === 0) {
        results.success = false
        results.message = '导入失败'
      } else if (validateOnly) {
        results.message = '文件验证通过'
      } else {
        results.message = `导入完成，成功${results.stats.success}个，跳过${results.stats.skipped}个，错误${results.stats.errors}个`
      }

      return results
    } catch (error) {
      logger.error('❌ 导入卡类型失败:', error)
      return {
        success: false,
        message: `导入失败: ${error.message}`,
        errors: [error.message]
      }
    }
  }

  /**
   * 检查卡类型的依赖关系
   * @param {string} cardTypeId - 卡类型ID
   * @returns {Promise<Array>} 依赖关系列表
   * @private
   */
  async _checkDependencies(_cardTypeId) {
    try {
      const dependencies = []

      // 这里可以添加检查逻辑，比如：
      // 1. 检查是否有使用该卡类型的兑换码
      // 2. 检查是否有绑定该卡类型的API Key
      // 3. 检查是否有关联的策略配置

      // 目前暂时返回空数组，后续可以扩展
      return dependencies
    } catch (error) {
      logger.error('❌ 检查卡类型依赖失败:', error)
      return []
    }
  }
}

module.exports = new CardTypeService()
