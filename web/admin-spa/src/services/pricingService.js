import { apiClient } from '@/config/api'

// 定价相关的 API 服务
export const pricingService = {
  // 获取套餐配置
  async getPackages() {
    try {
      const response = await apiClient.get('/admin/pricing/packages')
      return response
    } catch (error) {
      console.error('获取套餐配置失败:', error)
      throw error
    }
  },

  // 计算特定金额能购买的 tokens 数量
  async calculateTokens(amount, model = 'claude-3-5-sonnet-20241022') {
    try {
      const response = await apiClient.post('/admin/pricing/calculate-tokens', {
        amount,
        model
      })
      return response
    } catch (error) {
      console.error('计算tokens数量失败:', error)
      throw error
    }
  },

  // 获取所有模型价格信息
  async getModels() {
    try {
      const response = await apiClient.get('/admin/pricing/models')
      return response
    } catch (error) {
      console.error('获取模型价格失败:', error)
      throw error
    }
  },

  // 格式化token数量显示
  formatTokenCount(tokens) {
    if (typeof tokens !== 'number') {
      tokens = parseInt(tokens) || 0
    }

    if (tokens === 0) return '0'

    // 大数字使用简化格式，与后端保持一致
    if (tokens >= 100000000) {
      // 1亿以上
      return Math.floor(tokens / 10000000) + '千万'
    } else if (tokens >= 10000000) {
      // 1千万以上
      return Math.floor(tokens / 10000000) + '千万'
    } else if (tokens >= 1000000) {
      // 百万以上
      return Math.floor(tokens / 1000000) + '百万'
    } else if (tokens >= 10000) {
      // 万以上
      return Math.floor(tokens / 10000) + '万'
    } else if (tokens >= 1000) {
      return (tokens / 1000).toFixed(1) + 'K'
    } else {
      return tokens.toLocaleString()
    }
  },

  // 计算默认套餐的token限制（用于显示）- 使用用户标准 $1=100万TOKENS
  calculateDefaultPackageTokens() {
    // 使用用户要求的标准：$1 = 100万TOKENS
    const tokensPerUsd = 1000000

    // 日卡：$15 = 1500万tokens（1天）
    const dailyCardTokens = tokensPerUsd * 15
    const dailyTokens = dailyCardTokens

    // 月卡：$80/天 × 30天 = $2400，每日8000万tokens
    const monthlyCardTokens = tokensPerUsd * 2400 // 24亿tokens总量
    const monthlyDailyTokens = tokensPerUsd * 80 // 每日8000万tokens

    return {
      tokensPerUsd,
      dailyCard: {
        totalTokens: dailyCardTokens,
        dailyTokens,
        formattedDaily: this.formatTokenCount(dailyTokens)
      },
      monthlyCard: {
        totalTokens: monthlyCardTokens,
        dailyTokens: monthlyDailyTokens,
        formattedDaily: this.formatTokenCount(monthlyDailyTokens)
      }
    }
  }
}
