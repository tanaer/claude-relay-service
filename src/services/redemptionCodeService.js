const { v4: uuidv4 } = require('uuid')
const redis = require('../models/redis')
const logger = require('../utils/logger')
const apiKeyService = require('./apiKeyService')

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
  async getAllRedemptionCodes(filters = {}) {
    try {
      const client = redis.getClientSafe()
      const keys = await client.keys('redemption_code:*')
      const codes = []

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

      // 应用过滤器
      let filteredCodes = codes
      if (filters.status) {
        filteredCodes = filteredCodes.filter((code) => code.status === filters.status)
      }
      if (filters.type) {
        filteredCodes = filteredCodes.filter((code) => code.type === filters.type)
      }
      if (filters.code) {
        filteredCodes = filteredCodes.filter((code) =>
          code.code.toLowerCase().includes(filters.code.toLowerCase())
        )
      }
      if (filters.apiKey) {
        filteredCodes = filteredCodes.filter(
          (code) =>
            code.usedByApiKey &&
            code.usedByApiKey.toLowerCase().includes(filters.apiKey.toLowerCase())
        )
      }

      // 按创建时间倒序排列
      filteredCodes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      return filteredCodes
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
  async redeemCode(code, apiKeyId) {
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
        return { success: false, error: '兑换码已被使用' }
      }

      // 获取API Key信息
      const apiKey = await apiKeyService.getApiKeyById(apiKeyId)
      if (!apiKey) {
        return { success: false, error: 'API Key不存在' }
      }

      // 计算新的过期时间
      const now = new Date()
      const duration = parseInt(codeData.duration)
      const newExpiresAt = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000)

      // 更新API Key的费用限制和过期时间
      const updateData = {
        dailyCostLimit: parseFloat(codeData.costLimit),
        expiresAt: newExpiresAt.toISOString()
      }

      await apiKeyService.updateApiKey(apiKeyId, updateData)

      // 标记兑换码为已使用
      await client.hset(`redemption_code:${codeId}`, {
        status: 'used',
        usedAt: now.toISOString(),
        usedByApiKey: apiKey.name || apiKeyId
      })

      logger.info(`✅ Redemption code ${code} used by API Key ${apiKey.name}`)
      return {
        success: true,
        message: `兑换成功！${this.codeTypes[codeData.type].name}已激活，有效期${duration}天，每日费用限制$${codeData.costLimit}`
      }
    } catch (error) {
      logger.error('❌ Failed to redeem code:', error)
      return { success: false, error: '兑换失败，请稍后重试' }
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
