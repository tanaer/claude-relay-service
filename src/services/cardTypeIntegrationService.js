const cardTypeService = require('./cardTypeService')
const apiKeyService = require('./apiKeyService')
const redemptionCodeService = require('./redemptionCodeService')
const _redemptionPolicyService = require('./redemptionPolicyService')
const logger = require('../utils/logger')

/**
 * 卡类型系统集成服务
 * 负责协调现有服务与新卡类型系统的集成
 */
class CardTypeIntegrationService {
  /**
   * 从API Key标签推断卡类型ID
   * @param {Array} tags API Key标签数组
   * @returns {string|null} 对应的卡类型ID
   */
  async inferCardTypeFromTags(tags) {
    if (!Array.isArray(tags)) {
      return null
    }

    // 检查是否包含daily-card或monthly-card标签
    if (tags.includes('daily-card')) {
      return 'builtin_daily'
    }

    if (tags.includes('monthly-card')) {
      return 'builtin_monthly'
    }

    // 未来可以扩展更多推断逻辑
    return null
  }

  /**
   * 从兑换码类型推断卡类型ID
   * @param {string} type 兑换码类型 (daily/monthly)
   * @returns {string|null} 对应的卡类型ID
   */
  inferCardTypeFromRedemptionType(type) {
    if (type === 'daily') {
      return 'builtin_daily'
    }

    if (type === 'monthly') {
      return 'builtin_monthly'
    }

    return null
  }

  /**
   * 扩展API Key创建，自动设置cardTypeId
   * @param {Object} options 原始API Key创建选项
   * @returns {Object} 扩展后的选项
   */
  async enhanceApiKeyCreation(options) {
    const enhanced = { ...options }

    // 如果已经指定了cardTypeId，直接返回
    if (enhanced.cardTypeId) {
      return enhanced
    }

    // 从tags推断cardTypeId
    if (enhanced.tags && Array.isArray(enhanced.tags)) {
      const inferredCardTypeId = await this.inferCardTypeFromTags(enhanced.tags)
      if (inferredCardTypeId) {
        enhanced.cardTypeId = inferredCardTypeId
        logger.info(`🔗 从标签推断卡类型: ${enhanced.tags.join(', ')} -> ${inferredCardTypeId}`)
      }
    }

    return enhanced
  }

  /**
   * 扩展兑换码创建，自动设置cardTypeId
   * @param {Object} codeData 原始兑换码数据
   * @returns {Object} 扩展后的数据
   */
  async enhanceRedemptionCodeCreation(codeData) {
    const enhanced = { ...codeData }

    // 如果已经指定了cardTypeId，直接返回
    if (enhanced.cardTypeId) {
      return enhanced
    }

    // 从type推断cardTypeId
    if (enhanced.type) {
      const inferredCardTypeId = this.inferCardTypeFromRedemptionType(enhanced.type)
      if (inferredCardTypeId) {
        enhanced.cardTypeId = inferredCardTypeId
        logger.info(`🔗 从兑换码类型推断卡类型: ${enhanced.type} -> ${inferredCardTypeId}`)
      }
    }

    return enhanced
  }

  /**
   * 获取卡类型增强的API Key信息
   * @param {Object} apiKeyData 原始API Key数据
   * @returns {Object} 增强后的API Key数据
   */
  async enhanceApiKeyData(apiKeyData) {
    if (!apiKeyData) {
      return apiKeyData
    }

    const enhanced = { ...apiKeyData }

    // 如果有cardTypeId，获取卡类型信息
    if (enhanced.cardTypeId) {
      try {
        const cardType = await cardTypeService.getCardType(enhanced.cardTypeId)
        if (cardType) {
          enhanced.cardTypeInfo = {
            id: cardType.id,
            name: cardType.name,
            category: cardType.category,
            displayName: cardType.displayName,
            isBuiltIn: cardType.isBuiltIn
          }
        }
      } catch (error) {
        logger.warn(`⚠️ 获取卡类型信息失败: ${enhanced.cardTypeId}`, error)
      }
    } else {
      // 尝试从tags推断
      const inferredCardTypeId = await this.inferCardTypeFromTags(enhanced.tags)
      if (inferredCardTypeId) {
        enhanced.suggestedCardTypeId = inferredCardTypeId
        enhanced.migrationNeeded = true
      }
    }

    return enhanced
  }

  /**
   * 获取卡类型增强的兑换码信息
   * @param {Object} codeData 原始兑换码数据
   * @returns {Object} 增强后的兑换码数据
   */
  async enhanceRedemptionCodeData(codeData) {
    if (!codeData) {
      return codeData
    }

    const enhanced = { ...codeData }

    // 如果有cardTypeId，获取卡类型信息
    if (enhanced.cardTypeId) {
      try {
        const cardType = await cardTypeService.getCardType(enhanced.cardTypeId)
        if (cardType) {
          enhanced.cardTypeInfo = {
            id: cardType.id,
            name: cardType.name,
            category: cardType.category,
            displayName: cardType.displayName,
            isBuiltIn: cardType.isBuiltIn
          }
        }
      } catch (error) {
        logger.warn(`⚠️ 获取卡类型信息失败: ${enhanced.cardTypeId}`, error)
      }
    } else {
      // 尝试从type推断
      const inferredCardTypeId = this.inferCardTypeFromRedemptionType(enhanced.type)
      if (inferredCardTypeId) {
        enhanced.suggestedCardTypeId = inferredCardTypeId
        enhanced.migrationNeeded = true
      }
    }

    return enhanced
  }

  /**
   * 验证卡类型配置与现有系统的兼容性
   * @param {Object} cardTypeData 卡类型数据
   * @returns {Object} 验证结果
   */
  async validateCardTypeCompatibility(cardTypeData) {
    const issues = []
    const warnings = []

    try {
      // 检查定价标准兼容性
      const expectedRatio = 1000000 // $1 = 100万TOKENS
      const actualRatio = cardTypeData.totalTokens / cardTypeData.priceUsd
      const tolerance = 0.1 // 10%容差

      if (Math.abs(actualRatio - expectedRatio) / expectedRatio > tolerance) {
        warnings.push({
          type: 'pricing_standard',
          message: `定价偏离标准: 实际比率 ${Math.round(actualRatio).toLocaleString()} vs 预期 ${expectedRatio.toLocaleString()}`,
          severity: 'warning'
        })
      }

      // 检查是否与现有模版冲突
      if (cardTypeData.rateTemplateId) {
        // 这里可以添加模版兼容性检查
        warnings.push({
          type: 'template_integration',
          message: '需要验证计费模版集成',
          severity: 'info'
        })
      }

      return {
        valid: issues.length === 0,
        issues,
        warnings,
        compatibility: 'good'
      }
    } catch (error) {
      logger.error('❌ 卡类型兼容性验证失败:', error)

      return {
        valid: false,
        issues: [
          {
            type: 'validation_error',
            message: `验证过程出错: ${error.message}`,
            severity: 'error'
          }
        ],
        warnings: [],
        compatibility: 'unknown'
      }
    }
  }

  /**
   * 批量增强API Key数据
   * @param {Array} apiKeys API Key数组
   * @returns {Array} 增强后的API Key数组
   */
  async enhanceApiKeyList(apiKeys) {
    if (!Array.isArray(apiKeys)) {
      return apiKeys
    }

    const enhanced = []
    for (const apiKey of apiKeys) {
      try {
        const enhancedKey = await this.enhanceApiKeyData(apiKey)
        enhanced.push(enhancedKey)
      } catch (error) {
        logger.warn(`⚠️ 增强API Key数据失败: ${apiKey.id}`, error)
        enhanced.push(apiKey) // 失败时返回原数据
      }
    }

    return enhanced
  }

  /**
   * 获取系统集成统计
   * @returns {Object} 集成统计信息
   */
  async getIntegrationStats() {
    try {
      // 获取需要迁移的数据统计
      const allApiKeys = await apiKeyService.getAllApiKeys()
      const allCodes = await redemptionCodeService.getAllCodes()

      // 统计API Key迁移需求
      const apiKeyStats = {
        total: allApiKeys.length,
        withCardTypeId: 0,
        needsMigration: 0,
        byTags: {}
      }

      for (const key of allApiKeys) {
        if (key.cardTypeId) {
          apiKeyStats.withCardTypeId++
        } else {
          const inferredId = await this.inferCardTypeFromTags(key.tags)
          if (inferredId) {
            apiKeyStats.needsMigration++
            apiKeyStats.byTags[inferredId] = (apiKeyStats.byTags[inferredId] || 0) + 1
          }
        }
      }

      // 统计兑换码迁移需求
      const codeStats = {
        total: allCodes.length,
        withCardTypeId: 0,
        needsMigration: 0,
        byType: {}
      }

      for (const code of allCodes) {
        if (code.cardTypeId) {
          codeStats.withCardTypeId++
        } else {
          const inferredId = this.inferCardTypeFromRedemptionType(code.type)
          if (inferredId) {
            codeStats.needsMigration++
            codeStats.byType[inferredId] = (codeStats.byType[inferredId] || 0) + 1
          }
        }
      }

      return {
        timestamp: new Date().toISOString(),
        apiKeys: apiKeyStats,
        redemptionCodes: codeStats,
        overall: {
          totalItems: apiKeyStats.total + codeStats.total,
          totalMigrated: apiKeyStats.withCardTypeId + codeStats.withCardTypeId,
          totalNeedsMigration: apiKeyStats.needsMigration + codeStats.needsMigration
        }
      }
    } catch (error) {
      logger.error('❌ 获取集成统计失败:', error)
      throw error
    }
  }
}

module.exports = new CardTypeIntegrationService()
