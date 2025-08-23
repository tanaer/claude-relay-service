const cardTypeIntegrationService = require('../services/cardTypeIntegrationService')
const logger = require('../utils/logger')

/**
 * 卡类型集成中间件
 * 自动为现有API响应添加卡类型相关信息
 */

/**
 * API Key响应增强中间件
 * 为API Key相关的响应自动添加卡类型信息
 */
function enhanceApiKeyResponse(req, res, next) {
  // 保存原始的json方法
  const originalJson = res.json

  // 重写json方法
  res.json = async function (data) {
    try {
      // 检查响应数据中是否包含API Key信息
      if (data && data.success && data.data) {
        if (Array.isArray(data.data)) {
          // 处理API Key列表
          const hasApiKeys = data.data.some(
            (item) => item.id && item.name && (item.apiKey || item.encryptedApiKey)
          )
          if (hasApiKeys) {
            logger.debug('🔗 增强API Key列表响应')
            data.data = await cardTypeIntegrationService.enhanceApiKeyList(data.data)
          }
        } else if (
          data.data.id &&
          data.data.name &&
          (data.data.apiKey || data.data.encryptedApiKey)
        ) {
          // 处理单个API Key
          logger.debug('🔗 增强API Key单项响应')
          data.data = await cardTypeIntegrationService.enhanceApiKeyData(data.data)
        }
      }
    } catch (error) {
      logger.warn('⚠️ API Key响应增强失败:', error)
      // 增强失败不影响原始响应
    }

    // 调用原始的json方法
    return originalJson.call(this, data)
  }

  next()
}

/**
 * 兑换码响应增强中间件
 * 为兑换码相关的响应自动添加卡类型信息
 */
function enhanceRedemptionCodeResponse(req, res, next) {
  // 保存原始的json方法
  const originalJson = res.json

  // 重写json方法
  res.json = async function (data) {
    try {
      // 检查响应数据中是否包含兑换码信息
      if (data && data.success && data.data) {
        if (Array.isArray(data.data)) {
          // 处理兑换码列表
          const hasRedemptionCodes = data.data.some((item) => item.id && item.code && item.type)
          if (hasRedemptionCodes) {
            logger.debug('🔗 增强兑换码列表响应')
            const enhanced = []
            for (const code of data.data) {
              const enhancedCode = await cardTypeIntegrationService.enhanceRedemptionCodeData(code)
              enhanced.push(enhancedCode)
            }
            data.data = enhanced
          }
        } else if (data.data.id && data.data.code && data.data.type) {
          // 处理单个兑换码
          logger.debug('🔗 增强兑换码单项响应')
          data.data = await cardTypeIntegrationService.enhanceRedemptionCodeData(data.data)
        }
      }
    } catch (error) {
      logger.warn('⚠️ 兑换码响应增强失败:', error)
      // 增强失败不影响原始响应
    }

    // 调用原始的json方法
    return originalJson.call(this, data)
  }

  next()
}

/**
 * 通用卡类型集成中间件
 * 同时处理API Key和兑换码的响应增强
 */
function enhanceCardTypeResponses(req, res, next) {
  // 保存原始的json方法
  const originalJson = res.json

  // 重写json方法
  res.json = async function (data) {
    try {
      // 检查响应数据中是否需要增强
      if (data && data.success && data.data) {
        let enhanced = false

        if (Array.isArray(data.data)) {
          // 检查是否为API Key列表
          const hasApiKeys = data.data.some(
            (item) => item.id && item.name && (item.apiKey || item.encryptedApiKey)
          )
          if (hasApiKeys) {
            logger.debug('🔗 增强API Key列表响应')
            data.data = await cardTypeIntegrationService.enhanceApiKeyList(data.data)
            enhanced = true
          }

          // 检查是否为兑换码列表
          const hasRedemptionCodes = data.data.some((item) => item.id && item.code && item.type)
          if (hasRedemptionCodes && !enhanced) {
            logger.debug('🔗 增强兑换码列表响应')
            const enhancedCodes = []
            for (const code of data.data) {
              const enhancedCode = await cardTypeIntegrationService.enhanceRedemptionCodeData(code)
              enhancedCodes.push(enhancedCode)
            }
            data.data = enhancedCodes
            enhanced = true
          }
        } else {
          // 检查是否为单个API Key
          if (data.data.id && data.data.name && (data.data.apiKey || data.data.encryptedApiKey)) {
            logger.debug('🔗 增强API Key单项响应')
            data.data = await cardTypeIntegrationService.enhanceApiKeyData(data.data)
            enhanced = true
          }

          // 检查是否为单个兑换码
          if (data.data.id && data.data.code && data.data.type && !enhanced) {
            logger.debug('🔗 增强兑换码单项响应')
            data.data = await cardTypeIntegrationService.enhanceRedemptionCodeData(data.data)
            enhanced = true
          }
        }

        // 为增强的响应添加元数据
        if (enhanced && data.meta) {
          data.meta.cardTypeIntegration = {
            enabled: true,
            timestamp: new Date().toISOString()
          }
        }
      }
    } catch (error) {
      logger.warn('⚠️ 卡类型响应增强失败:', error)
      // 增强失败不影响原始响应
    }

    // 调用原始的json方法
    return originalJson.call(this, data)
  }

  next()
}

/**
 * 卡类型创建/更新请求预处理中间件
 * 自动处理从现有格式到卡类型系统的转换
 */
function preprocessCardTypeRequests(req, res, next) {
  try {
    const { body, path, method } = req

    // 处理API Key创建/更新请求
    if (path.includes('/api-keys') && (method === 'POST' || method === 'PUT') && body) {
      if (body.tags && !body.cardTypeId) {
        // 尝试从标签推断卡类型
        cardTypeIntegrationService
          .inferCardTypeFromTags(body.tags)
          .then((cardTypeId) => {
            if (cardTypeId) {
              req.body.cardTypeId = cardTypeId
              logger.info(`🔗 从标签推断卡类型: ${body.tags.join(', ')} -> ${cardTypeId}`)
            }
          })
          .catch((error) => {
            logger.warn('⚠️ 推断卡类型失败:', error)
          })
      }
    }

    // 处理兑换码创建/更新请求
    if (path.includes('/redemption-codes') && (method === 'POST' || method === 'PUT') && body) {
      if (body.type && !body.cardTypeId) {
        // 从类型推断卡类型
        const cardTypeId = cardTypeIntegrationService.inferCardTypeFromRedemptionType(body.type)
        if (cardTypeId) {
          req.body.cardTypeId = cardTypeId
          logger.info(`🔗 从类型推断卡类型: ${body.type} -> ${cardTypeId}`)
        }
      }
    }
  } catch (error) {
    logger.warn('⚠️ 卡类型请求预处理失败:', error)
  }

  next()
}

/**
 * 条件性应用中间件的辅助函数
 * @param {string} pathPattern 路径模式
 * @param {Function} middleware 要应用的中间件
 * @returns {Function} Express中间件
 */
function conditionalMiddleware(pathPattern, middleware) {
  return (req, res, next) => {
    if (req.path.includes(pathPattern)) {
      return middleware(req, res, next)
    }
    next()
  }
}

module.exports = {
  enhanceApiKeyResponse,
  enhanceRedemptionCodeResponse,
  enhanceCardTypeResponses,
  preprocessCardTypeRequests,
  conditionalMiddleware,

  // 便捷方法
  forApiKeys: () => conditionalMiddleware('/api-keys', enhanceApiKeyResponse),
  forRedemptionCodes: () =>
    conditionalMiddleware('/redemption-codes', enhanceRedemptionCodeResponse),
  forAll: () => enhanceCardTypeResponses
}
