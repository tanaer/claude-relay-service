const { v4: uuidv4 } = require('uuid')
const redis = require('../models/redis')
const logger = require('../utils/logger')
const apiKeyService = require('./apiKeyService')
const redemptionPolicyService = require('./redemptionPolicyService')
const keyLogsService = require('./keyLogsService')

class RedemptionCodeService {
  constructor() {
    // 兑换码类型配置
    this.codeTypes = {
      daily: {
        prefix: 'D-',
        duration: 1, // 1天
        costLimit: 20, // $20
        name: '日卡'
      },
      monthly: {
        prefix: 'M-',
        duration: 30, // 30天
        costLimit: 100, // $100
        name: '月卡'
      }
    }
  }

  // 生成随机兑换码
  _generateCodeSuffix() {
    // 生成8位随机字符串，包含大小写字母和数字
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let result = ''
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  // 生成兑换码
  async generateRedemptionCode(type) {
    if (!this.codeTypes[type]) {
      throw new Error(`Invalid code type: ${type}`)
    }

    const typeConfig = this.codeTypes[type]
    const code = `${typeConfig.prefix}${this._generateCodeSuffix()}`
    const codeId = uuidv4()
    const now = new Date()

    const codeData = {
      id: codeId,
      code,
      type,
      status: 'unused', // unused, used
      costLimit: typeConfig.costLimit,
      duration: typeConfig.duration,
      createdAt: now.toISOString(),
      usedAt: null,
      usedByApiKey: null
    }

    try {
      const client = redis.getClientSafe()
      // 存储兑换码详细信息
      await client.hset(`redemption_code:${codeId}`, codeData)
      // 建立兑换码到ID的映射，便于快速查找
      await client.set(`redemption_code_lookup:${code}`, codeId)

      logger.info(`✅ Generated ${type} redemption code: ${code}`)
      return { success: true, code: codeData }
    } catch (error) {
      logger.error(`❌ Failed to generate redemption code:`, error)
      throw error
    }
  }

  // 批量生成兑换码
  async generateBatchRedemptionCodes(type, count = 20) {
    const codes = []
    for (let i = 0; i < count; i++) {
      try {
        const result = await this.generateRedemptionCode(type)
        codes.push(result.code)
      } catch (error) {
        logger.error(`❌ Failed to generate redemption code ${i + 1}/${count}:`, error)
      }
    }
    return codes
  }

  // 获取所有兑换码
  async getAllRedemptionCodes(filters = {}, pagination = null) {
    try {
      const client = redis.getClientSafe()
      const keys = await client.keys('redemption_code:*')
      const codes = []

      // 添加调试日志
      logger.debug(`🔍 [兑换码服务] 开始查询兑换码`, {
        filters,
        pagination,
        totalKeys: keys.length
      })

      for (const key of keys) {
        if (key.includes('_lookup:')) {
          continue
        } // 跳过查找映射

        const codeData = await client.hgetall(key)
        if (Object.keys(codeData).length > 0) {
          // 转换数据类型
          codeData.costLimit = parseFloat(codeData.costLimit)
          codeData.duration = parseInt(codeData.duration)
          codes.push(codeData)
        }
      }

      logger.debug(`📊 [兑换码服务] 从Redis获取到兑换码数量: ${codes.length}`)

      // 应用过滤器
      let filteredCodes = codes

      // 清理空值过滤器
      const cleanFilters = {}
      if (filters.status && filters.status.trim()) {
        cleanFilters.status = filters.status.trim()
      }
      if (filters.type && filters.type.trim()) {
        cleanFilters.type = filters.type.trim()
      }
      if (filters.code && filters.code.trim()) {
        cleanFilters.code = filters.code.trim()
      }
      if (filters.apiKey && filters.apiKey.trim()) {
        cleanFilters.apiKey = filters.apiKey.trim()
      }

      logger.debug(`🔍 [兑换码服务] 清理后的过滤器:`, cleanFilters)

      if (cleanFilters.status) {
        const beforeCount = filteredCodes.length
        filteredCodes = filteredCodes.filter((code) => code.status === cleanFilters.status)
        logger.debug(
          `📝 [兑换码服务] 状态过滤 (${cleanFilters.status}): ${beforeCount} -> ${filteredCodes.length}`
        )
      }
      if (cleanFilters.type) {
        const beforeCount = filteredCodes.length
        filteredCodes = filteredCodes.filter((code) => code.type === cleanFilters.type)
        logger.debug(
          `📝 [兑换码服务] 类型过滤 (${cleanFilters.type}): ${beforeCount} -> ${filteredCodes.length}`
        )
      }
      if (cleanFilters.code) {
        const beforeCount = filteredCodes.length
        filteredCodes = filteredCodes.filter(
          (code) => code.code && code.code.toLowerCase().includes(cleanFilters.code.toLowerCase())
        )
        logger.debug(
          `📝 [兑换码服务] 兑换码过滤 (${cleanFilters.code}): ${beforeCount} -> ${filteredCodes.length}`
        )
      }
      if (cleanFilters.apiKey) {
        const beforeCount = filteredCodes.length
        filteredCodes = filteredCodes.filter(
          (code) =>
            code.usedByApiKey &&
            code.usedByApiKey.toLowerCase().includes(cleanFilters.apiKey.toLowerCase())
        )
        logger.debug(
          `📝 [兑换码服务] API Key过滤 (${cleanFilters.apiKey}): ${beforeCount} -> ${filteredCodes.length}`
        )
      }

      // 按创建时间倒序排列
      filteredCodes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      logger.debug(`📊 [兑换码服务] 过滤后的兑换码数量: ${filteredCodes.length}`)

      // 如果没有分页参数，返回所有数据（向后兼容）
      if (!pagination) {
        logger.debug(`📄 [兑换码服务] 无分页参数，返回所有数据`)
        return filteredCodes
      }

      // 分页处理
      const totalCount = filteredCodes.length
      const totalPages = Math.ceil(totalCount / pagination.pageSize)
      const startIndex = (pagination.page - 1) * pagination.pageSize
      const endIndex = startIndex + pagination.pageSize
      const items = filteredCodes.slice(startIndex, endIndex)

      const paginationResult = {
        currentPage: pagination.page,
        pageSize: pagination.pageSize,
        totalCount,
        totalPages
      }

      logger.debug(`📄 [兑换码服务] 分页结果:`, {
        ...paginationResult,
        startIndex,
        endIndex,
        itemsCount: items.length
      })

      return {
        items,
        pagination: paginationResult
      }
    } catch (error) {
      logger.error('❌ Failed to get redemption codes:', error)
      throw error
    }
  }

  // 获取可用的兑换码（用于提取）
  async getAvailableRedemptionCodes(type, count = 20) {
    try {
      const allCodes = await this.getAllRedemptionCodes({ status: 'unused', type })
      return allCodes.slice(0, count)
    } catch (error) {
      logger.error('❌ Failed to get available redemption codes:', error)
      throw error
    }
  }

  // 兑换码
  async redeemCode(code) {
    try {
      const client = redis.getClientSafe()

      // 查找兑换码ID
      const codeId = await client.get(`redemption_code_lookup:${code}`)
      if (!codeId) {
        return { success: false, error: '兑换码不存在' }
      }

      // 获取兑换码详情
      const codeData = await client.hgetall(`redemption_code:${codeId}`)
      if (Object.keys(codeData).length === 0) {
        return { success: false, error: '兑换码不存在' }
      }

      // 检查兑换码状态
      if (codeData.status === 'used') {
        // 如果兑换码已被使用，返回对应的API Key信息
        const cardName = codeData.type === 'daily' ? '日卡' : '月卡'
        const duration = parseInt(codeData.duration)
        const costLimit = parseFloat(codeData.costLimit)

        // 计算原始过期时间（基于使用时间）
        let originalExpiresAt = null
        if (codeData.usedAt) {
          const usedDate = new Date(codeData.usedAt)
          originalExpiresAt = new Date(usedDate.getTime() + duration * 24 * 60 * 60 * 1000)
        }

        return {
          success: true,
          alreadyUsed: true,
          message: `此兑换码已被使用，对应的${cardName} API Key信息如下`,
          data: {
            apiKey: codeData.usedByApiKey || '信息不完整',
            name: codeData.generatedApiKeyName || `${cardName}-${code}`,
            usedAt: codeData.usedAt,
            expiresAt: originalExpiresAt ? originalExpiresAt.toISOString() : null,
            dailyCostLimit: costLimit,
            duration
          }
        }
      }

      const now = new Date()
      const duration = parseInt(codeData.duration)
      const costLimit = parseFloat(codeData.costLimit)
      const expiresAt = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000)

      // 生成新的API Key
      const cardName = codeData.type === 'daily' ? '日卡' : '月卡'
      const apiKeyName = `${cardName}-${code}`

      let newApiKey
      try {
        newApiKey = await apiKeyService.generateApiKey({
          name: apiKeyName,
          description: `通过兑换码 ${code} 生成的${cardName}`,
          dailyCostLimit: costLimit,
          expiresAt: expiresAt.toISOString(),
          isActive: true,
          tags: [codeData.type === 'daily' ? 'daily-card' : 'monthly-card', 'redeemed']
        })
      } catch (generateError) {
        logger.error('❌ Failed to generate API key during redemption:', generateError)
        return { success: false, error: '生成API Key失败' }
      }

      if (!newApiKey || !newApiKey.success || !newApiKey.apiKey) {
        logger.error('❌ Generated API key is invalid or missing apiKey property')
        return { success: false, error: '生成API Key失败' }
      }

      // 标记兑换码为已使用
      await client.hset(`redemption_code:${codeId}`, {
        status: 'used',
        usedAt: now.toISOString(),
        usedByApiKey: newApiKey.apiKey,
        generatedApiKeyName: apiKeyName
      })

      // 集成策略绑定功能
      try {
        await this._bindRedemptionPolicy(newApiKey.apiKey, {
          codeId,
          codeType: codeData.type,
          code,
          templateId: null, // 将使用策略配置中的初始模板
          groupId: null // 将使用策略配置中的初始分组
        })

        logger.info(`✅ API Key ${newApiKey.apiKey} 策略绑定成功`)
      } catch (policyError) {
        logger.warn(`⚠️ API Key ${newApiKey.apiKey} 策略绑定失败: ${policyError.message}`)
        // 策略绑定失败不影响兑换成功，仅记录警告
      }

      logger.info(`✅ Redemption code ${code} used, generated API Key: ${newApiKey.apiKey}`)

      return {
        success: true,
        message: `兑换成功！已生成${cardName} API Key`,
        data: {
          apiKey: newApiKey.apiKey,
          name: apiKeyName,
          expiresAt: expiresAt.toISOString(),
          dailyCostLimit: costLimit,
          duration
        }
      }
    } catch (error) {
      logger.error('❌ Failed to redeem code:', error)
      return { success: false, error: '兑换失败，请稍后重试' }
    }
  }

  // 策略绑定私有方法
  async _bindRedemptionPolicy(apiKeyId, redemptionData) {
    try {
      // 调用策略服务进行绑定
      await redemptionPolicyService.bindApiKeyPolicy(apiKeyId, redemptionData)

      // 记录策略绑定日志
      await keyLogsService.logPolicyBinding(
        apiKeyId,
        redemptionData.codeType,
        redemptionData.codeId,
        true,
        {
          bindingType: 'redemption_auto',
          code: redemptionData.code,
          timestamp: new Date().toISOString()
        }
      )

      logger.info(`[兑换码服务] API Key ${apiKeyId} 策略绑定成功 - 兑换码: ${redemptionData.code}`)
    } catch (error) {
      logger.error(`[兑换码服务] API Key ${apiKeyId} 策略绑定失败: ${error.message}`)

      // 记录失败日志
      await keyLogsService.logPolicyBinding(
        apiKeyId,
        redemptionData.codeType,
        redemptionData.codeId,
        false,
        {
          bindingType: 'redemption_auto',
          code: redemptionData.code,
          error: error.message,
          timestamp: new Date().toISOString()
        }
      )

      throw error
    }
  }

  // 获取兑换码统计
  async getRedemptionStats() {
    try {
      const allCodes = await this.getAllRedemptionCodes()

      const stats = {
        total: allCodes.length,
        unused: allCodes.filter((code) => code.status === 'unused').length,
        used: allCodes.filter((code) => code.status === 'used').length,
        daily: {
          total: allCodes.filter((code) => code.type === 'daily').length,
          unused: allCodes.filter((code) => code.type === 'daily' && code.status === 'unused')
            .length,
          used: allCodes.filter((code) => code.type === 'daily' && code.status === 'used').length
        },
        monthly: {
          total: allCodes.filter((code) => code.type === 'monthly').length,
          unused: allCodes.filter((code) => code.type === 'monthly' && code.status === 'unused')
            .length,
          used: allCodes.filter((code) => code.type === 'monthly' && code.status === 'used').length
        }
      }

      return stats
    } catch (error) {
      logger.error('❌ Failed to get redemption stats:', error)
      throw error
    }
  }
}

module.exports = new RedemptionCodeService()
