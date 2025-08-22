const express = require('express')
const { authenticateAdmin } = require('../middleware/auth')
const CostCalculator = require('../utils/costCalculator')

const router = express.Router()

/**
 * 获取定价套餐配置
 * 返回预定义的套餐配置和动态价格计算
 */
router.get('/packages', authenticateAdmin, async (req, res) => {
  try {
    // 获取所有模型定价
    const modelPricing = CostCalculator.getAllModelPricing()

    // 预定义套餐配置 - 使用用户最新要求的价格
    // 按照用户要求的 $1=100万TOKENS 标准设计
    const packages = [
      {
        id: 'monthly',
        name: '月卡',
        type: 'M',
        duration: 30, // 天
        priceUsd: 2100, // 美元 ($70/天 × 30天)
        description: '有效期30天，每日$80限制，共$2400基于$1=100万TOKENS计算'
      },
      {
        id: 'daily',
        name: '日卡',
        type: 'D',
        duration: 1, // 天
        priceUsd: 10, // 美元 (用户最新要求)
        description: '有效期1天，每日用量限制基于$1=100万TOKENS计算'
      }
    ]

    // 为每个套餐计算token数量 - 使用用户要求的 $1=100万TOKENS 标准
    const packagesWithTokens = packages.map((pkg) => {
      const tokenLimits = {}

      // 按照用户标准：$1 = 100万TOKENS (1,000,000 tokens)
      const tokensPerUsd = 1000000 // 用户要求的固定比率
      const totalTokens = tokensPerUsd * pkg.priceUsd // 该套餐总tokens
      const dailyTokens = Math.floor(totalTokens / pkg.duration) // 每日限制

      // 为每个模型设置相同的token数量（统一标准）
      Object.keys(modelPricing).forEach((model) => {
        if (model === 'unknown') {
          return
        }

        tokenLimits[model] = {
          tokensPerUsd,
          totalTokens,
          dailyTokens,
          formattedDaily: formatTokenCount(dailyTokens)
        }
      })

      // 使用固定的token数量作为默认显示
      const defaultTokens = {
        tokensPerUsd,
        totalTokens,
        dailyTokens,
        formattedDaily: formatTokenCount(dailyTokens)
      }

      return {
        ...pkg,
        tokenLimits,
        defaultDailyTokens: defaultTokens.dailyTokens,
        defaultFormattedDaily: defaultTokens.formattedDaily
      }
    })

    res.json({
      success: true,
      data: {
        packages: packagesWithTokens,
        modelPricing,
        lastUpdated: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('获取定价套餐失败:', error)
    res.status(500).json({
      success: false,
      message: '获取定价套餐失败'
    })
  }
})

/**
 * 计算特定金额能购买的tokens数量 - 使用用户标准 $1=100万TOKENS
 */
router.post('/calculate-tokens', authenticateAdmin, async (req, res) => {
  try {
    const { amount, model = 'claude-3-5-sonnet-20241022' } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: '金额必须大于0'
      })
    }

    // 使用用户要求的固定比率：$1 = 100万TOKENS
    const tokensPerUsd = 1000000
    const totalTokens = tokensPerUsd * amount

    // 获取真实模型定价用于显示（但不用于计算）
    const pricing = CostCalculator.getModelPricing(model)

    res.json({
      success: true,
      data: {
        model,
        amount,
        tokensPerUsd, // 固定为100万
        totalTokens,
        formatted: formatTokenCount(totalTokens),
        pricingStandard: '$1 = 100万TOKENS（统一标准）',
        pricing: pricing
          ? {
              input: pricing.input,
              output: pricing.output,
              inputPerToken: pricing.input / 1000000,
              outputPerToken: pricing.output / 1000000
            }
          : null
      }
    })
  } catch (error) {
    console.error('计算token数量失败:', error)
    res.status(500).json({
      success: false,
      message: '计算token数量失败'
    })
  }
})

/**
 * 获取所有模型的价格信息
 */
router.get('/models', authenticateAdmin, async (req, res) => {
  try {
    const modelPricing = CostCalculator.getAllModelPricing()

    // 转换格式，添加更多信息
    const modelsInfo = Object.entries(modelPricing).map(([model, pricing]) => {
      const tokensPerUsd = Math.floor(1000000 / pricing.input)

      return {
        model,
        pricing,
        tokensPerUsd,
        costPerToken: {
          input: pricing.input / 1000000,
          output: pricing.output / 1000000,
          cacheWrite: pricing.cacheWrite / 1000000,
          cacheRead: pricing.cacheRead / 1000000
        },
        isDefault: model === 'claude-3-5-sonnet-20241022'
      }
    })

    res.json({
      success: true,
      data: {
        models: modelsInfo,
        lastUpdated: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('获取模型价格失败:', error)
    res.status(500).json({
      success: false,
      message: '获取模型价格失败'
    })
  }
})

/**
 * 格式化token数量显示
 */
function formatTokenCount(tokens) {
  if (typeof tokens !== 'number') {
    tokens = parseInt(tokens) || 0
  }

  if (tokens === 0) {
    return '0'
  }

  // 大数字使用简化格式
  if (tokens >= 100000000) {
    // 1亿以上
    return `${Math.floor(tokens / 10000000)}千万`
  } else if (tokens >= 10000000) {
    // 1千万以上
    return `${Math.floor(tokens / 10000000)}千万`
  } else if (tokens >= 1000000) {
    // 百万以上
    return `${Math.floor(tokens / 1000000)}百万`
  } else if (tokens >= 10000) {
    // 万以上
    return `${Math.floor(tokens / 10000)}万`
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`
  } else {
    return tokens.toLocaleString()
  }
}

module.exports = router
