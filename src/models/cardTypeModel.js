const { v4: uuidv4 } = require('uuid')

/**
 * 卡类型数据模型
 * 定义卡类型的数据结构和验证规则
 */
class CardTypeModel {
  constructor() {
    // 卡类型分类枚举
    this.CATEGORIES = {
      DAILY: 'daily',
      MONTHLY: 'monthly',
      UNLIMITED: 'unlimited'
    }

    // 系统内置卡类型标识符
    this.BUILTIN_TYPES = {
      DAILY: 'builtin_daily',
      MONTHLY: 'builtin_monthly'
    }

    // 数据验证规则
    this.VALIDATION_RULES = {
      name: {
        required: true,
        minLength: 1,
        maxLength: 50
      },
      description: {
        required: false,
        maxLength: 200
      },
      category: {
        required: true,
        enum: Object.values(this.CATEGORIES)
      },
      duration: {
        required: true,
        min: -1, // -1 表示不限时
        max: 36500 // 最长100年
      },
      totalTokens: {
        required: true,
        min: 0
      },
      dailyTokens: {
        required: true,
        min: 0
      },
      priceUsd: {
        required: true,
        min: 0
      }
    }
  }

  /**
   * 创建新的卡类型数据对象
   * @param {Object} data - 卡类型数据
   * @returns {Object} 标准化的卡类型对象
   */
  create(data) {
    const now = new Date().toISOString()

    return {
      // 基础信息
      id: data.id || uuidv4(),
      name: data.name,
      description: data.description || '',
      category: data.category,

      // 容量配置
      duration: parseInt(data.duration),
      dailyReset: Boolean(data.dailyReset),
      totalTokens: parseInt(data.totalTokens),
      dailyTokens: parseInt(data.dailyTokens),
      priceUsd: parseFloat(data.priceUsd),

      // 分组配置
      defaultGroup: data.defaultGroup || '',

      // 策略配置（简化版 - 专属策略）
      rateTemplateId: data.rateTemplateId || '',
      customRates: data.customRates || {},
      policyConfig: data.policyConfig || {},

      // 系统字段
      isBuiltIn: Boolean(data.isBuiltIn),
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
      migrationSource: data.migrationSource || '',

      // 时间戳
      createdAt: data.createdAt || now,
      updatedAt: now
    }
  }

  /**
   * 更新卡类型数据对象
   * @param {Object} existing - 现有数据
   * @param {Object} updates - 更新数据
   * @returns {Object} 更新后的卡类型对象
   */
  update(existing, updates) {
    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    }

    // 不允许修改的字段
    delete updated.id
    delete updated.createdAt
    delete updated.migrationSource

    return updated
  }

  /**
   * 验证卡类型数据
   * @param {Object} data - 待验证的数据
   * @returns {Object} 验证结果 {valid: boolean, errors: Array}
   */
  validate(data) {
    const errors = []

    // 验证必填字段
    Object.entries(this.VALIDATION_RULES).forEach(([field, rules]) => {
      if (rules.required && (!data[field] || data[field] === '')) {
        errors.push(`${field} 为必填字段`)
        return
      }

      const value = data[field]
      if (value === undefined || value === null || value === '') {
        return // 可选字段为空时跳过验证
      }

      // 字符串长度验证
      if (typeof value === 'string') {
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`${field} 长度不能少于 ${rules.minLength} 个字符`)
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`${field} 长度不能超过 ${rules.maxLength} 个字符`)
        }
      }

      // 数值范围验证
      if (typeof value === 'number' || !isNaN(Number(value))) {
        const numValue = Number(value)
        if (rules.min !== undefined && numValue < rules.min) {
          errors.push(`${field} 不能小于 ${rules.min}`)
        }
        if (rules.max !== undefined && numValue > rules.max) {
          errors.push(`${field} 不能大于 ${rules.max}`)
        }
      }

      // 枚举值验证
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${field} 必须是以下值之一: ${rules.enum.join(', ')}`)
      }
    })

    // 业务逻辑验证
    this._validateBusinessLogic(data, errors)

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * 业务逻辑验证
   * @param {Object} data - 数据
   * @param {Array} errors - 错误数组
   * @private
   */
  _validateBusinessLogic(data, errors) {
    // 验证不限时卡的duration必须为-1
    if (data.category === this.CATEGORIES.UNLIMITED && data.duration !== -1) {
      errors.push('不限时卡的有效期必须设置为-1')
    }

    // 验证有限期卡的duration必须大于0
    if (data.category !== this.CATEGORIES.UNLIMITED && data.duration <= 0) {
      errors.push('限时卡的有效期必须大于0天')
    }

    // 验证每日token不能超过总token（针对限时卡）
    if (data.category !== this.CATEGORIES.UNLIMITED) {
      const totalTokens = parseInt(data.totalTokens) || 0
      const dailyTokens = parseInt(data.dailyTokens) || 0
      const duration = parseInt(data.duration) || 1

      if (dailyTokens > 0 && totalTokens > 0) {
        const maxDailyForTotal = Math.ceil(totalTokens / duration)
        if (dailyTokens > maxDailyForTotal) {
          errors.push(`每日token限制(${dailyTokens})超过了总额度平均值(${maxDailyForTotal})`)
        }
      }
    }

    // 验证价格与token比例（$1=100万TOKENS标准）
    const priceUsd = parseFloat(data.priceUsd) || 0
    const totalTokens = parseInt(data.totalTokens) || 0
    if (priceUsd > 0 && totalTokens > 0) {
      const expectedTokens = priceUsd * 1000000 // $1=100万TOKENS
      const deviation = Math.abs(totalTokens - expectedTokens) / expectedTokens
      if (deviation > 0.1) {
        // 允许10%的偏差
        errors.push(
          `价格与token数量不符合$1=100万TOKENS标准 (当前: $${priceUsd}=${totalTokens}TOKENS, 期望: ${expectedTokens}TOKENS)`
        )
      }
    }
  }

  /**
   * 序列化为Redis存储格式
   * @param {Object} cardType - 卡类型对象
   * @returns {Object} Redis Hash格式数据
   */
  toRedisHash(cardType) {
    return {
      id: cardType.id,
      name: cardType.name,
      description: cardType.description,
      category: cardType.category,
      duration: cardType.duration.toString(),
      dailyReset: cardType.dailyReset ? '1' : '0',
      totalTokens: cardType.totalTokens.toString(),
      dailyTokens: cardType.dailyTokens.toString(),
      priceUsd: cardType.priceUsd.toString(),
      defaultGroup: cardType.defaultGroup,
      rateTemplateId: cardType.rateTemplateId,
      customRates: JSON.stringify(cardType.customRates),
      policyConfig: JSON.stringify(cardType.policyConfig),
      isBuiltIn: cardType.isBuiltIn ? '1' : '0',
      isActive: cardType.isActive ? '1' : '0',
      migrationSource: cardType.migrationSource,
      createdAt: cardType.createdAt,
      updatedAt: cardType.updatedAt
    }
  }

  /**
   * 从Redis Hash格式反序列化
   * @param {Object} redisData - Redis Hash数据
   * @returns {Object} 卡类型对象
   */
  fromRedisHash(redisData) {
    if (!redisData || !redisData.id) {
      return null
    }

    return {
      id: redisData.id,
      name: redisData.name,
      description: redisData.description,
      category: redisData.category,
      duration: parseInt(redisData.duration),
      dailyReset: redisData.dailyReset === '1',
      totalTokens: parseInt(redisData.totalTokens),
      dailyTokens: parseInt(redisData.dailyTokens),
      priceUsd: parseFloat(redisData.priceUsd),
      defaultGroup: redisData.defaultGroup || '',
      rateTemplateId: redisData.rateTemplateId || '',
      customRates: redisData.customRates ? JSON.parse(redisData.customRates) : {},
      policyConfig: redisData.policyConfig ? JSON.parse(redisData.policyConfig) : {},
      isBuiltIn: redisData.isBuiltIn === '1',
      isActive: redisData.isActive === '1',
      migrationSource: redisData.migrationSource || '',
      createdAt: redisData.createdAt,
      updatedAt: redisData.updatedAt
    }
  }

  /**
   * 创建内置日卡类型
   * @returns {Object} 内置日卡配置
   */
  createBuiltinDaily() {
    return this.create({
      id: this.BUILTIN_TYPES.DAILY,
      name: '日卡',
      description: '有效期1天，1500万tokens限制，基于$1=100万TOKENS计算',
      category: this.CATEGORIES.DAILY,
      duration: 1,
      dailyReset: true,
      totalTokens: 15000000, // 1500万tokens
      dailyTokens: 15000000, // 每日1500万tokens
      priceUsd: 15, // $15
      defaultGroup: '',
      isBuiltIn: true,
      migrationSource: 'hardcoded-daily'
    })
  }

  /**
   * 创建内置月卡类型
   * @returns {Object} 内置月卡配置
   */
  createBuiltinMonthly() {
    return this.create({
      id: this.BUILTIN_TYPES.MONTHLY,
      name: '月卡',
      description: '有效期30天，每日8000万tokens限制，基于$1=100万TOKENS计算',
      category: this.CATEGORIES.MONTHLY,
      duration: 30,
      dailyReset: true,
      totalTokens: 2400000000, // 24亿tokens (30天 * 8000万)
      dailyTokens: 80000000, // 每日8000万tokens
      priceUsd: 2400, // $2400
      defaultGroup: '',
      isBuiltIn: true,
      migrationSource: 'hardcoded-monthly'
    })
  }
}

module.exports = new CardTypeModel()
