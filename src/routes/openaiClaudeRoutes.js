/**
 * OpenAI 兼容的 Claude API 路由
 * 提供 OpenAI 格式的 API 接口，内部转发到 Claude
 */

const express = require('express')
const router = express.Router()
const fs = require('fs')
const path = require('path')
const logger = require('../utils/logger')
const { authenticateApiKey } = require('../middleware/auth')
const claudeRelayService = require('../services/claudeRelayService')
const claudeConsoleRelayService = require('../services/claudeConsoleRelayService')
const openaiToClaude = require('../services/openaiToClaude')
const apiKeyService = require('../services/apiKeyService')
const unifiedClaudeScheduler = require('../services/unifiedClaudeScheduler')
const claudeCodeHeadersService = require('../services/claudeCodeHeadersService')
const sessionHelper = require('../utils/sessionHelper')

// 加载模型定价数据
let modelPricingData = {}
try {
  const pricingPath = path.join(__dirname, '../../data/model_pricing.json')
  const pricingContent = fs.readFileSync(pricingPath, 'utf8')
  modelPricingData = JSON.parse(pricingContent)
  logger.info('✅ Model pricing data loaded successfully')
} catch (error) {
  logger.error('❌ Failed to load model pricing data:', error)
}

// 🔧 辅助函数：检查 API Key 权限
function checkPermissions(apiKeyData, requiredPermission = 'claude') {
  const permissions = apiKeyData.permissions || 'all'
  return permissions === 'all' || permissions === requiredPermission
}

// 📋 OpenAI 兼容的模型列表端点
router.get('/v1/models', authenticateApiKey, async (req, res) => {
  try {
    const apiKeyData = req.apiKey

    // 检查权限
    if (!checkPermissions(apiKeyData, 'claude')) {
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access Claude',
          type: 'permission_denied',
          code: 'permission_denied'
        }
      })
    }

    // Claude 模型列表 - 只返回 opus-4.1 和 sonnet-4
    let models = [
      {
        id: 'claude-opus-4-1-20250805',
        object: 'model',
        created: 1736726400, // 2025-01-13
        owned_by: 'anthropic'
      },
      {
        id: 'claude-sonnet-4-20250514',
        object: 'model',
        created: 1736726400, // 2025-01-13
        owned_by: 'anthropic'
      }
    ]

    // 如果启用了模型限制，过滤模型列表
    if (apiKeyData.enableModelRestriction && apiKeyData.restrictedModels?.length > 0) {
      models = models.filter((model) => apiKeyData.restrictedModels.includes(model.id))
    }

    res.json({
      object: 'list',
      data: models
    })
  } catch (error) {
    logger.error('❌ Failed to get OpenAI-Claude models:', error)
    res.status(500).json({
      error: {
        message: 'Failed to retrieve models',
        type: 'server_error',
        code: 'internal_error'
      }
    })
  }
  return undefined
})

// 📄 OpenAI 兼容的模型详情端点
router.get('/v1/models/:model', authenticateApiKey, async (req, res) => {
  try {
    const apiKeyData = req.apiKey
    const modelId = req.params.model

    // 检查权限
    if (!checkPermissions(apiKeyData, 'claude')) {
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access Claude',
          type: 'permission_denied',
          code: 'permission_denied'
        }
      })
    }

    // 检查模型限制
    if (apiKeyData.enableModelRestriction && apiKeyData.restrictedModels?.length > 0) {
      if (!apiKeyData.restrictedModels.includes(modelId)) {
        return res.status(404).json({
          error: {
            message: `Model '${modelId}' not found`,
            type: 'invalid_request_error',
            code: 'model_not_found'
          }
        })
      }
    }

    // 从 model_pricing.json 获取模型信息
    const modelData = modelPricingData[modelId]

    // 构建标准 OpenAI 格式的模型响应
    let modelInfo

    if (modelData) {
      // 如果在 pricing 文件中找到了模型
      modelInfo = {
        id: modelId,
        object: 'model',
        created: 1736726400, // 2025-01-13
        owned_by: 'anthropic',
        permission: [],
        root: modelId,
        parent: null
      }
    } else {
      // 如果没找到，返回默认信息（但仍保持正确格式）
      modelInfo = {
        id: modelId,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'anthropic',
        permission: [],
        root: modelId,
        parent: null
      }
    }

    res.json(modelInfo)
  } catch (error) {
    logger.error('❌ Failed to get model details:', error)
    res.status(500).json({
      error: {
        message: 'Failed to retrieve model details',
        type: 'server_error',
        code: 'internal_error'
      }
    })
  }
  return undefined
})

// 🔧 处理聊天完成请求的核心函数
async function handleChatCompletion(req, res, apiKeyData) {
  const startTime = Date.now()
  let abortController = null

  try {
    // 🔍 详细记录请求信息
    logger.info('🌊 [OpenAI路由] 开始处理聊天完成请求', {
      apiKeyId: apiKeyData.id,
      apiKeyName: apiKeyData.name,
      userAgent: req.headers['user-agent'],
      referer: req.headers.referer,
      contentType: req.headers['content-type'],
      authorization: req.headers.authorization ? 'Bearer ***' : 'none'
    })

    // 🔍 记录API Key详细信息
    logger.info('🔑 [OpenAI路由] API Key详细信息', {
      id: apiKeyData.id,
      name: apiKeyData.name,
      claudeAccountId: apiKeyData.claudeAccountId,
      claudeConsoleAccountId: apiKeyData.claudeConsoleAccountId,
      bedrockAccountId: apiKeyData.bedrockAccountId,
      groupId: apiKeyData.groupId,
      isActive: apiKeyData.isActive
    })

    // 检查权限
    if (!checkPermissions(apiKeyData, 'claude')) {
      logger.warn('❌ [OpenAI路由] 权限检查失败', { apiKeyId: apiKeyData.id })
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access Claude',
          type: 'permission_denied',
          code: 'permission_denied'
        }
      })
    }

    // 记录原始请求
    logger.info('📥 [OpenAI路由] 收到OpenAI格式请求', {
      model: req.body.model,
      messageCount: req.body.messages?.length,
      stream: req.body.stream,
      maxTokens: req.body.max_tokens,
      temperature: req.body.temperature,
      firstMessage: req.body.messages?.[0]
        ? {
            role: req.body.messages[0].role,
            contentPreview: `${req.body.messages[0].content?.substring(0, 100)}...`
          }
        : null
    })

    // 转换 OpenAI 请求为 Claude 格式
    const claudeRequest = openaiToClaude.convertRequest(req.body)
    logger.info('🔄 [OpenAI路由] 请求格式转换完成', {
      originalModel: req.body.model,
      claudeModel: claudeRequest.model,
      claudeStream: claudeRequest.stream,
      claudeMaxTokens: claudeRequest.max_tokens,
      systemLength: claudeRequest.system?.length || 0,
      messagesCount: claudeRequest.messages?.length || 0
    })

    // 检查模型限制
    if (apiKeyData.enableModelRestriction && apiKeyData.restrictedModels?.length > 0) {
      if (!apiKeyData.restrictedModels.includes(claudeRequest.model)) {
        logger.warn('❌ [OpenAI路由] 模型受限', {
          requestedModel: req.body.model,
          allowedModels: apiKeyData.restrictedModels
        })
        return res.status(403).json({
          error: {
            message: `Model ${req.body.model} is not allowed for this API key`,
            type: 'invalid_request_error',
            code: 'model_not_allowed'
          }
        })
      }
    }

    // 生成会话哈希用于sticky会话
    const sessionHash = sessionHelper.generateSessionHash(claudeRequest)
    logger.info('🎯 [OpenAI路由] 会话哈希生成', { sessionHash })

    // 选择可用的Claude账户
    logger.info('🔍 [OpenAI路由] 开始选择Claude账户', {
      apiKeyId: apiKeyData.id,
      sessionHash,
      requestedModel: claudeRequest.model
    })

    const accountSelection = await unifiedClaudeScheduler.selectAccountForApiKey(
      apiKeyData,
      sessionHash,
      claudeRequest.model
    )
    const { accountId, accountType } = accountSelection

    logger.info('✅ [OpenAI路由] Claude账户选择完成', {
      accountId,
      accountType,
      apiKeyId: apiKeyData.id
    })

    // 获取该账号存储的 Claude Code headers
    const claudeCodeHeaders = await claudeCodeHeadersService.getAccountHeaders(accountId)

    logger.info('📋 [OpenAI路由] Claude Code headers获取', {
      accountId,
      userAgent: claudeCodeHeaders['user-agent'],
      hasHeaders: Object.keys(claudeCodeHeaders).length > 0
    })

    // 处理流式请求
    if (claudeRequest.stream) {
      logger.info('🌊 [OpenAI路由] 处理流式请求', {
        model: req.body.model,
        accountType,
        accountId
      })

      // 设置 SSE 响应头
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')

      // 创建中止控制器
      abortController = new AbortController()

      // 处理客户端断开
      req.on('close', () => {
        if (abortController && !abortController.signal.aborted) {
          logger.info('🔌 [OpenAI路由] 客户端断开连接，取消Claude请求')
          abortController.abort()
        }
      })

      // 根据账户类型选择合适的转发服务
      if (accountType === 'claude-official') {
        logger.info('🔄 [OpenAI路由] 使用官方Claude服务处理流式请求', { accountId })
        // 使用转换后的响应流 (使用 OAuth-only beta header，添加 Claude Code 必需的 headers)
        await claudeRelayService.relayStreamRequestWithUsageCapture(
          claudeRequest,
          apiKeyData,
          res,
          claudeCodeHeaders,
          (usage) => {
            // 记录使用统计
            if (usage && usage.input_tokens !== undefined && usage.output_tokens !== undefined) {
              const inputTokens = usage.input_tokens || 0
              const outputTokens = usage.output_tokens || 0
              const cacheCreateTokens = usage.cache_creation_input_tokens || 0
              const cacheReadTokens = usage.cache_read_input_tokens || 0
              const { model } = claudeRequest // 统一使用原始请求模型计费，确保模型映射不影响计费

              apiKeyService
                .recordUsage(
                  apiKeyData.id,
                  inputTokens,
                  outputTokens,
                  cacheCreateTokens,
                  cacheReadTokens,
                  model,
                  accountId
                )
                .catch((error) => {
                  logger.error('❌ Failed to record usage:', error)
                })
            }
          },
          // 流转换器
          (() => {
            // 为每个请求创建独立的会话ID
            const sessionId = `chatcmpl-${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`
            return (chunk) => openaiToClaude.convertStreamChunk(chunk, req.body.model, sessionId)
          })(),
          {
            betaHeader:
              'oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14'
          }
        )
      } else if (accountType === 'claude-console') {
        logger.info('🔄 [OpenAI路由] 使用Console服务处理流式请求', {
          accountId,
          requestHeaders: {
            userAgent: req.headers['user-agent'],
            referer: req.headers.referer,
            contentType: req.headers['content-type']
          }
        })
        // Console账户使用Console转发服务
        await claudeConsoleRelayService.relayStreamRequestWithUsageCapture(
          claudeRequest,
          apiKeyData,
          res,
          req.headers,
          (usage) => {
            // 记录使用统计
            if (usage && usage.input_tokens !== undefined && usage.output_tokens !== undefined) {
              const inputTokens = usage.input_tokens || 0
              const outputTokens = usage.output_tokens || 0
              const cacheCreateTokens = usage.cache_creation_input_tokens || 0
              const cacheReadTokens = usage.cache_read_input_tokens || 0
              const { model } = claudeRequest // 统一使用原始请求模型计费

              apiKeyService
                .recordUsage(
                  apiKeyData.id,
                  inputTokens,
                  outputTokens,
                  cacheCreateTokens,
                  cacheReadTokens,
                  model,
                  accountId
                )
                .catch((error) => {
                  logger.error('❌ Failed to record usage:', error)
                })
            }
          },
          // 流转换器
          (() => {
            // 为每个请求创建独立的会话ID
            const sessionId = `chatcmpl-${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`
            return (chunk) => openaiToClaude.convertStreamChunk(chunk, req.body.model, sessionId)
          })(),
          accountId,
          null, // streamTransformer
          {
            betaHeader:
              'claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14'
          }
        )
      } else {
        throw new Error(`Unsupported account type: ${accountType}`)
      }
    } else {
      // 非流式请求
      logger.info('📄 [OpenAI路由] 处理非流式请求', {
        model: req.body.model,
        accountType,
        accountId
      })

      // 根据账户类型选择合适的转发服务
      let claudeResponse
      if (accountType === 'claude-official') {
        logger.info('🔄 [OpenAI路由] 使用官方Claude服务处理非流式请求', { accountId })
        // 发送请求到 Claude (使用 OAuth-only beta header，添加 Claude Code 必需的 headers)
        claudeResponse = await claudeRelayService.relayRequest(
          claudeRequest,
          apiKeyData,
          req,
          res,
          claudeCodeHeaders,
          { betaHeader: 'oauth-2025-04-20' }
        )
      } else if (accountType === 'claude-console') {
        logger.info('🔄 [OpenAI路由] 使用Console服务处理非流式请求', {
          accountId,
          requestHeaders: {
            userAgent: req.headers['user-agent'],
            referer: req.headers.referer,
            contentType: req.headers['content-type']
          }
        })
        // Console账户使用Console转发服务
        claudeResponse = await claudeConsoleRelayService.relayRequest(
          claudeRequest,
          apiKeyData,
          req,
          res,
          req.headers,
          accountId,
          {
            betaHeader:
              'claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14'
          }
        )
        logger.info('✅ [OpenAI路由] Console服务响应完成', {
          statusCode: claudeResponse?.statusCode || 'unknown',
          hasBody: !!claudeResponse?.body,
          bodyLength: claudeResponse?.body?.length || 0
        })
      } else {
        logger.error('❌ [OpenAI路由] 不支持的账户类型', { accountType })
        throw new Error(`Unsupported account type: ${accountType}`)
      }

      // 解析 Claude 响应
      let claudeData
      try {
        logger.info('🔍 [OpenAI路由] 开始解析Claude响应')
        claudeData = JSON.parse(claudeResponse.body)
        logger.info('✅ [OpenAI路由] Claude响应解析成功', {
          hasId: !!claudeData?.id,
          hasContent: !!claudeData?.content,
          hasUsage: !!claudeData?.usage
        })
      } catch (error) {
        logger.error('❌ [OpenAI路由] Claude响应解析失败', {
          error: error.message,
          responseBody: claudeResponse.body?.substring(0, 500)
        })
        return res.status(502).json({
          error: {
            message: 'Invalid response from Claude API',
            type: 'api_error',
            code: 'invalid_response'
          }
        })
      }

      // 处理错误响应
      if (claudeResponse.statusCode >= 400) {
        logger.warn('⚠️ [OpenAI路由] Claude API返回错误响应', {
          statusCode: claudeResponse.statusCode,
          errorMessage: claudeData.error?.message || 'Claude API error',
          errorType: claudeData.error?.type || 'api_error',
          errorCode: claudeData.error?.code || 'unknown_error',
          accountId,
          accountType
        })
        return res.status(claudeResponse.statusCode).json({
          error: {
            message: claudeData.error?.message || 'Claude API error',
            type: claudeData.error?.type || 'api_error',
            code: claudeData.error?.code || 'unknown_error'
          }
        })
      }

      // 转换为 OpenAI 格式
      logger.info('🔄 [OpenAI路由] 开始转换Claude响应为OpenAI格式', {
        claudeModelInResponse: claudeData.model,
        requestedModel: req.body.model,
        hasContent: !!claudeData.content,
        contentLength: claudeData.content?.length || 0
      })
      const openaiResponse = openaiToClaude.convertResponse(claudeData, req.body.model)
      logger.info('✅ [OpenAI路由] OpenAI格式转换完成', {
        responseId: openaiResponse.id,
        finishReason: openaiResponse.choices?.[0]?.finish_reason,
        messageLength: openaiResponse.choices?.[0]?.message?.content?.length || 0
      })

      // 记录使用统计
      if (claudeData.usage) {
        const { usage } = claudeData
        logger.info('📊 [OpenAI路由] 开始记录使用统计', {
          apiKeyId: apiKeyData.id,
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
          cacheCreateTokens: usage.cache_creation_input_tokens || 0,
          cacheReadTokens: usage.cache_read_input_tokens || 0,
          model: claudeRequest.model,
          accountId
        })
        apiKeyService
          .recordUsage(
            apiKeyData.id,
            usage.input_tokens || 0,
            usage.output_tokens || 0,
            usage.cache_creation_input_tokens || 0,
            usage.cache_read_input_tokens || 0,
            claudeRequest.model, // 使用原始请求模型计费，与流式请求保持一致
            accountId
          )
          .then(() => {
            logger.info('✅ [OpenAI路由] 使用统计记录成功')
          })
          .catch((error) => {
            logger.error('❌ [OpenAI路由] 使用统计记录失败:', error)
          })
      } else {
        logger.warn('⚠️ [OpenAI路由] Claude响应中没有使用统计数据')
      }

      // 返回 OpenAI 格式响应
      logger.info('📤 [OpenAI路由] 发送OpenAI格式响应给客户端', {
        responseSize: JSON.stringify(openaiResponse).length,
        usage: openaiResponse.usage
      })
      res.json(openaiResponse)
    }

    const duration = Date.now() - startTime
    logger.info(`✅ [OpenAI路由] 请求处理完成`, {
      duration: `${duration}ms`,
      apiKeyId: apiKeyData.id,
      model: req.body.model,
      accountId,
      accountType,
      wasStreaming: req.body.stream || false
    })
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error('❌ [OpenAI路由] 请求处理失败', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      apiKeyId: apiKeyData?.id || 'unknown',
      model: req.body?.model || 'unknown',
      requestId: req.headers['x-request-id'] || 'none'
    })

    const status = error.status || 500
    res.status(status).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'server_error',
        code: 'internal_error'
      }
    })
  } finally {
    // 清理资源
    if (abortController) {
      abortController = null
      logger.debug('🧹 [OpenAI路由] 清理AbortController资源')
    }
  }
  return undefined
}

// 🚀 OpenAI 兼容的聊天完成端点
router.post('/v1/chat/completions', authenticateApiKey, async (req, res) => {
  await handleChatCompletion(req, res, req.apiKey)
})

// 🔧 OpenAI 兼容的 completions 端点（传统格式，转换为 chat 格式）
router.post('/v1/completions', authenticateApiKey, async (req, res) => {
  const startTime = Date.now()
  try {
    const apiKeyData = req.apiKey

    logger.info('🔄 [OpenAI路由] 开始处理Completions请求', {
      apiKeyId: apiKeyData.id,
      apiKeyName: apiKeyData.name,
      hasPrompt: !!req.body.prompt,
      promptLength: req.body.prompt?.length || 0,
      model: req.body.model,
      maxTokens: req.body.max_tokens,
      stream: req.body.stream
    })

    // 验证必需参数
    if (!req.body.prompt) {
      logger.warn('❌ [OpenAI路由] Completions请求缺少prompt参数', {
        apiKeyId: apiKeyData.id,
        requestBody: Object.keys(req.body)
      })
      return res.status(400).json({
        error: {
          message: 'Prompt is required',
          type: 'invalid_request_error',
          code: 'invalid_request'
        }
      })
    }

    // 将传统 completions 格式转换为 chat 格式
    const originalBody = req.body
    logger.info('🔄 [OpenAI路由] 转换Completions格式为Chat格式', {
      originalModel: originalBody.model,
      originalPrompt: `${originalBody.prompt?.substring(0, 100)}...`,
      maxTokens: originalBody.max_tokens,
      temperature: originalBody.temperature,
      stream: originalBody.stream
    })

    req.body = {
      model: originalBody.model,
      messages: [
        {
          role: 'user',
          content: originalBody.prompt
        }
      ],
      max_tokens: originalBody.max_tokens,
      temperature: originalBody.temperature,
      top_p: originalBody.top_p,
      stream: originalBody.stream,
      stop: originalBody.stop,
      n: originalBody.n || 1,
      presence_penalty: originalBody.presence_penalty,
      frequency_penalty: originalBody.frequency_penalty,
      logit_bias: originalBody.logit_bias,
      user: originalBody.user
    }

    logger.info('✅ [OpenAI路由] Completions格式转换完成，调用统一处理函数', {
      convertedModel: req.body.model,
      messageCount: req.body.messages.length,
      messageRole: req.body.messages[0].role,
      contentLength: req.body.messages[0].content.length
    })

    // 使用共享的处理函数
    await handleChatCompletion(req, res, apiKeyData)

    const duration = Date.now() - startTime
    logger.info(`✅ [OpenAI路由] Completions请求处理完成`, {
      duration: `${duration}ms`,
      apiKeyId: apiKeyData.id,
      model: originalBody.model
    })
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error('❌ [OpenAI路由] Completions请求处理失败', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      apiKeyId: req.apiKey?.id || 'unknown',
      model: req.body?.model || 'unknown'
    })
    res.status(500).json({
      error: {
        message: 'Failed to process completion request',
        type: 'server_error',
        code: 'internal_error'
      }
    })
  }
  return undefined
})

module.exports = router
