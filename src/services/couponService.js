const redis = require('../models/redis')
const apiKeyService = require('./apiKeyService')
const logger = require('../utils/logger')

class CouponService {
  constructor() {
    this.indexKey = 'coupon:index'
  }

  _generateCodeWithPrefix(prefix = 'U', length = 16) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let body = ''
    for (let i = 0; i < length; i++) {
      body += alphabet.charAt(Math.floor(Math.random() * alphabet.length))
    }
    return `${prefix}${body}`
  }

  async createLifetimeCoupon(tokens, code = null) {
    if (!Number.isInteger(tokens) || tokens <= 0) {
      throw new Error('Tokens must be a positive integer')
    }

    const client = redis.getClientSafe()
    let finalCode =
      code && code.trim().toUpperCase().startsWith('U') ? code.trim().toUpperCase() : null

    // 生成唯一code
    for (let i = 0; i < 5 && !finalCode; i++) {
      const candidate = this._generateCodeWithPrefix('U', 14)
      const exists = await client.exists(`coupon:${candidate}`)
      if (!exists) {
        finalCode = candidate
      }
    }

    if (!finalCode) {
      throw new Error('Failed to generate unique coupon code')
    }

    const data = {
      code: finalCode,
      type: 'lifetime',
      tokens: String(tokens),
      status: 'unused',
      createdAt: new Date().toISOString(),
      usedAt: '',
      usedByApiKeyId: ''
    }

    await client.hset(`coupon:${finalCode}`, data)
    await client.sadd(this.indexKey, finalCode)

    logger.success(`🎟️ Created lifetime coupon: ${finalCode} (+${tokens} tokens)`)
    return { code: finalCode, tokens }
  }

  async listCoupons() {
    const client = redis.getClientSafe()
    const codes = await client.smembers(this.indexKey)
    const list = []
    for (const code of codes) {
      const data = await client.hgetall(`coupon:${code}`)
      if (data && Object.keys(data).length > 0) {
        list.push({
          code,
          type: data.type || 'unknown',
          tokens: parseInt(data.tokens || '0'),
          status: data.status || 'unused',
          createdAt: data.createdAt || '',
          usedAt: data.usedAt || '',
          usedByApiKeyId: data.usedByApiKeyId || ''
        })
      }
    }
    // 按创建时间倒序
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return list
  }

  async redeemToApiKey(code, { namePrefix = 'Lifetime Key' } = {}) {
    const client = redis.getClientSafe()
    const key = `coupon:${(code || '').trim().toUpperCase()}`
    const data = await client.hgetall(key)
    if (!data || Object.keys(data).length === 0) {
      throw new Error('兑换码不存在')
    }
    if (data.status === 'used') {
      throw new Error('兑换码已被使用')
    }
    if (data.type !== 'lifetime') {
      throw new Error('不支持的兑换码类型')
    }

    const tokens = parseInt(data.tokens || '0')
    if (!Number.isInteger(tokens) || tokens <= 0) {
      throw new Error('兑换码余额无效')
    }

    // 生成 API Key：永不过期 + 一次性余额
    const keyName = `${namePrefix}-${data.code.slice(-6)}`
    const newKey = await apiKeyService.generateApiKey({
      name: keyName,
      description: `Redeemed from coupon ${data.code}`,
      expiresAt: null,
      // 一次性余额
      lifetimeTokenBalance: tokens
    })

    // 标记兑换码已使用
    await client.hset(key, {
      status: 'used',
      usedAt: new Date().toISOString(),
      usedByApiKeyId: newKey.id
    })

    logger.success(`✅ Coupon redeemed: ${data.code} -> API Key ${newKey.id}`)
    return newKey
  }
}

module.exports = new CouponService()
