const axios = require('axios')
const claudeConsoleAccountService = require('./claudeConsoleAccountService')
const logger = require('../utils/logger')
const config = require('../../config/config')
const upstreamErrorService = require('./upstreamErrorService')
const smartRateLimitService = require('./smartRateLimitService')
const RetryHelper = require('../utils/retryHelper')
const connectionPool = require('../utils/connectionPool')

class ClaudeConsoleRelayService {
  constructor() {
    this.defaultUserAgent = 'claude-cli/1.0.80 (external, cli)'
  }

  // 将上游HTTP状态映射为对客户端更友好的状态
  _mapErrorStatus(status) {
    if (!status) {
      return 502
    }

    // 保持原样的状态码（客户端需要明确知道的）
    if (status === 429) {
      return 429
    } // 限流
    if (status === 401) {
      return 401
    } // 未授权
    if (status === 403) {
      return 403
    } // 禁止访问
    if (status === 404) {
      return 404
    } // 未找到
    if (status === 400) {
      return 400
    } // 请求错误

    // 4xx 客户端错误映射
    if (status === 402) {
      return 402
    } // 付费要求
    if (status === 405) {
      return 405
    } // 方法不允许
    if (status === 406) {
      return 400
    } // 不可接受 -> 请求错误
    if (status === 408) {
      return 408
    } // 请求超时
    if (status === 409) {
      return 409
    } // 冲突
    if (status === 410) {
      return 404
    } // 已删除 -> 未找到
    if (status === 413) {
      return 413
    } // 载荷过大
    if (status === 414) {
      return 400
    } // URI过长 -> 请求错误
    if (status === 415) {
      return 415
    } // 不支持的媒体类型
    if (status === 422) {
      return 400
    } // 无法处理的实体 -> 请求错误
    if (status >= 400 && status < 500) {
      return 400
    } // 其他4xx -> 请求错误

    // 5xx 服务器错误统一映射为502 Bad Gateway
    if (status >= 500) {
      return 502
    }

    // 其他未知状态码
    return 502
  }

  // 🚀 转发请求到Claude Console API
  async relayRequest(
    requestBody,
    apiKeyData,
    clientRequest,
    clientResponse,
    clientHeaders,
    accountId,
    options = {}
  ) {
    let abortController = null

    try {
      // 获取账户信息
      const account = await claudeConsoleAccountService.getAccount(accountId)
      if (!account) {
        throw new Error('Claude Console Claude account not found')
      }

      logger.info(
        `📤 Processing Claude Console API request for key: ${apiKeyData.name || apiKeyData.id}, account: ${account.name} (${accountId})`
      )
      logger.debug(`🌐 Account API URL: ${account.apiUrl}`)
      logger.debug(`🔍 Account supportedModels: ${JSON.stringify(account.supportedModels)}`)
      logger.debug(`🔑 Account has apiKey: ${!!account.apiKey}`)
      logger.debug(`📝 Request model: ${requestBody.model}`)

      // 处理模型映射
      let mappedModel = requestBody.model
      if (
        account.supportedModels &&
        typeof account.supportedModels === 'object' &&
        !Array.isArray(account.supportedModels)
      ) {
        const newModel = claudeConsoleAccountService.getMappedModel(
          account.supportedModels,
          requestBody.model
        )
        if (newModel !== requestBody.model) {
          logger.info(`🔄 Mapping model from ${requestBody.model} to ${newModel}`)
          mappedModel = newModel
        }
      }

      // 创建修改后的请求体
      const modifiedRequestBody = {
        ...requestBody,
        model: mappedModel
      }

      // 模型兼容性检查已经在调度器中完成，这里不需要再检查

      // 创建代理agent
      const proxyAgent = claudeConsoleAccountService._createProxyAgent(account.proxy)

      // 创建AbortController用于取消请求
      abortController = new AbortController()

      // 设置客户端断开监听器
      const handleClientDisconnect = () => {
        logger.info('🔌 Client disconnected, aborting Claude Console Claude request')
        if (abortController && !abortController.signal.aborted) {
          abortController.abort()
        }
      }

      // 监听客户端断开事件
      if (clientRequest) {
        clientRequest.once('close', handleClientDisconnect)
      }
      if (clientResponse) {
        clientResponse.once('close', handleClientDisconnect)
      }

      // 构建完整的API URL
      const cleanUrl = account.apiUrl.replace(/\/$/, '') // 移除末尾斜杠
      const apiEndpoint = cleanUrl.endsWith('/v1/messages') ? cleanUrl : `${cleanUrl}/v1/messages`

      logger.debug(`🎯 Final API endpoint: ${apiEndpoint}`)
      logger.debug(`[DEBUG] Options passed to relayRequest: ${JSON.stringify(options)}`)
      logger.debug(`[DEBUG] Client headers received: ${JSON.stringify(clientHeaders)}`)

      // 过滤客户端请求头
      const filteredHeaders = this._filterClientHeaders(clientHeaders)
      logger.debug(`[DEBUG] Filtered client headers: ${JSON.stringify(filteredHeaders)}`)

      // 决定使用的 User-Agent：优先使用账户自定义的，否则透传客户端的，最后才使用默认值
      const userAgent =
        account.userAgent ||
        clientHeaders?.['user-agent'] ||
        clientHeaders?.['User-Agent'] ||
        this.defaultUserAgent

      // 准备请求配置
      const requestConfig = {
        method: 'POST',
        url: apiEndpoint,
        data: modifiedRequestBody,
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'User-Agent': userAgent,
          ...filteredHeaders
        },
        httpsAgent: proxyAgent,
        timeout: requestBody.stream
          ? config.proxy.streamTimeout || 120000
          : config.proxy.timeout || 60000,
        signal: abortController.signal,
        validateStatus: () => true // 接受所有状态码
      }

      // 根据 API Key 格式选择认证方式
      if (account.apiKey && account.apiKey.startsWith('sk-ant-')) {
        // Anthropic 官方 API Key 使用 x-api-key
        requestConfig.headers['x-api-key'] = account.apiKey
        logger.debug('[DEBUG] Using x-api-key authentication for sk-ant-* API key')
      } else {
        // 其他 API Key 使用 Authorization Bearer
        requestConfig.headers['Authorization'] = `Bearer ${account.apiKey}`
        logger.debug('[DEBUG] Using Authorization Bearer authentication')
      }

      logger.debug(
        `[DEBUG] Initial headers before beta: ${JSON.stringify(requestConfig.headers, null, 2)}`
      )

      // 添加beta header如果需要
      if (options.betaHeader) {
        logger.debug(`[DEBUG] Adding beta header: ${options.betaHeader}`)
        requestConfig.headers['anthropic-beta'] = options.betaHeader
      } else {
        logger.debug('[DEBUG] No beta header to add')
      }

      // 使用连接池
      requestConfig.httpAgent = connectionPool.getHttpAgent()
      requestConfig.httpsAgent = connectionPool.getHttpsAgent()

      // 发送请求（带重试）
      logger.debug(
        '📤 Sending request to Claude Console API with headers:',
        JSON.stringify(requestConfig.headers, null, 2)
      )

      const response = await RetryHelper.withRetry(() => axios(requestConfig), {
        maxRetries: config.proxy.maxRetries || 3,
        initialDelay: config.proxy.retryDelay || 1000,
        exponentialBackoff: config.proxy.enableExponentialBackoff !== false,
        retryCondition: (error) => {
          // 不重试认证错误和客户端错误
          if (error.response?.status >= 400 && error.response?.status < 500) {
            return false
          }
          return RetryHelper.shouldRetry(error)
        },
        onRetry: (attempt, error) => {
          logger.warn(`⚠️ Claude Console API retry attempt ${attempt}`, {
            account: account.name,
            error: error.message,
            status: error.response?.status
          })
        }
      })

      // 移除监听器（请求成功完成）
      if (clientRequest) {
        clientRequest.removeListener('close', handleClientDisconnect)
      }
      if (clientResponse) {
        clientResponse.removeListener('close', handleClientDisconnect)
      }

      logger.debug(`🔗 Claude Console API response: ${response.status}`)
      logger.debug(`[DEBUG] Response headers: ${JSON.stringify(response.headers)}`)
      logger.debug(`[DEBUG] Response data type: ${typeof response.data}`)
      logger.debug(
        `[DEBUG] Response data length: ${response.data ? (typeof response.data === 'string' ? response.data.length : JSON.stringify(response.data).length) : 0}`
      )
      logger.debug(
        `[DEBUG] Response data preview: ${typeof response.data === 'string' ? response.data.substring(0, 200) : JSON.stringify(response.data).substring(0, 200)}`
      )

      // 检查是否为限流错误
      if (response.status === 429) {
        logger.warn(`🚫 Rate limit detected for Claude Console account ${accountId}`)
        await claudeConsoleAccountService.markAccountRateLimited(accountId)
      } else if (response.status === 200 || response.status === 201) {
        // 如果请求成功，检查并移除限流状态
        const isRateLimited = await claudeConsoleAccountService.isAccountRateLimited(accountId)
        if (isRateLimited) {
          await claudeConsoleAccountService.removeAccountRateLimit(accountId)
        }
      }

      // 更新最后使用时间
      await this._updateLastUsedTime(accountId)

      const responseBody =
        typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
      logger.debug(`[DEBUG] Final response body to return: ${responseBody}`)

      // 如果是非2xx，统一拦截改写为自定义文案（不透传上游详细）
      if (response.status < 200 || response.status >= 300) {
        // 智能限流：根据上游错误应用规则（内部按动态配置判定是否启用）
        try {
          await smartRateLimitService.handleUpstreamError({
            accountId,
            accountName: account.name || accountId,
            accountType: 'claude-console',
            statusCode: response.status,
            errorMessage:
              typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
            errorBody: { headers: response.headers },
            apiKeyId: apiKeyData.id || apiKeyData.keyId || 'unknown',
            apiKeyName: apiKeyData.name || 'unknown',
            isFromUpstream: true // 明确标识这是来自上游 API 的错误
          })
        } catch (e) {
          logger.warn('⚠️ smartRateLimitService.handleUpstreamError failed (console):', e.message)
        }

        const { errorType } = await upstreamErrorService.recordError({
          accountId,
          status: response.status,
          message:
            typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
          provider: 'claude-console',
          accountType: 'claude-console'
        })
        const clientMessage = await upstreamErrorService.getClientMessage(accountId, errorType)
        return {
          statusCode: this._mapErrorStatus(response.status),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: clientMessage }),
          accountId
        }
      }

      return {
        statusCode: response.status,
        headers: response.headers,
        body: responseBody,
        accountId
      }
    } catch (error) {
      // 处理特定错误
      if (error.name === 'AbortError' || error.code === 'ECONNABORTED') {
        logger.info('Request aborted due to client disconnect')
        throw new Error('Client disconnected')
      }

      logger.error('❌ Claude Console Claude relay request failed:', error.message)
      // 记录网络类/异常错误并返回统一文案
      const { errorType } = await upstreamErrorService.recordError({
        accountId,
        status: error.response?.status || 0,
        code: error.code,
        message: error.message,
        data: error.response?.data,
        provider: 'claude-console',
        accountType: 'claude-console'
      })
      const clientMessage = await upstreamErrorService.getClientMessage(accountId, errorType)
      const statusCode = this._mapErrorStatus(error.response?.status)
      return {
        statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: clientMessage }),
        accountId
      }

      // 不再因为模型不支持而block账号
    }
  }

  // 🌊 处理流式响应
  async relayStreamRequestWithUsageCapture(
    requestBody,
    apiKeyData,
    responseStream,
    clientHeaders,
    usageCallback,
    accountId,
    streamTransformer = null,
    options = {}
  ) {
    try {
      // 获取账户信息
      const account = await claudeConsoleAccountService.getAccount(accountId)
      if (!account) {
        throw new Error('Claude Console Claude account not found')
      }

      logger.info(
        `📡 Processing streaming Claude Console API request for key: ${apiKeyData.name || apiKeyData.id}, account: ${account.name} (${accountId})`
      )
      logger.debug(`🌐 Account API URL: ${account.apiUrl}`)

      // 处理模型映射
      let mappedModel = requestBody.model
      if (
        account.supportedModels &&
        typeof account.supportedModels === 'object' &&
        !Array.isArray(account.supportedModels)
      ) {
        const newModel = claudeConsoleAccountService.getMappedModel(
          account.supportedModels,
          requestBody.model
        )
        if (newModel !== requestBody.model) {
          logger.info(`🔄 [Stream] Mapping model from ${requestBody.model} to ${newModel}`)
          mappedModel = newModel
        }
      }

      // 创建修改后的请求体
      const modifiedRequestBody = {
        ...requestBody,
        model: mappedModel
      }

      // 模型兼容性检查已经在调度器中完成，这里不需要再检查

      // 创建代理agent
      const proxyAgent = claudeConsoleAccountService._createProxyAgent(account.proxy)

      // 发送流式请求
      await this._makeClaudeConsoleStreamRequest(
        modifiedRequestBody,
        account,
        proxyAgent,
        clientHeaders,
        responseStream,
        accountId,
        usageCallback,
        streamTransformer,
        options
      )

      // 更新最后使用时间
      await this._updateLastUsedTime(accountId)
    } catch (error) {
      logger.error('❌ Claude Console Claude stream relay failed:', error)
      throw error
    }
  }

  // 🌊 发送流式请求到Claude Console API
  async _makeClaudeConsoleStreamRequest(
    body,
    account,
    proxyAgent,
    clientHeaders,
    responseStream,
    accountId,
    usageCallback,
    streamTransformer = null,
    requestOptions = {}
  ) {
    return new Promise((resolve, reject) => {
      let aborted = false

      // 构建完整的API URL
      const cleanUrl = account.apiUrl.replace(/\/$/, '') // 移除末尾斜杠
      const apiEndpoint = cleanUrl.endsWith('/v1/messages') ? cleanUrl : `${cleanUrl}/v1/messages`

      logger.debug(`🎯 Final API endpoint for stream: ${apiEndpoint}`)

      // 过滤客户端请求头
      const filteredHeaders = this._filterClientHeaders(clientHeaders)
      logger.debug(`[DEBUG] Filtered client headers: ${JSON.stringify(filteredHeaders)}`)

      // 决定使用的 User-Agent：优先使用账户自定义的，否则透传客户端的，最后才使用默认值
      const userAgent =
        account.userAgent ||
        clientHeaders?.['user-agent'] ||
        clientHeaders?.['User-Agent'] ||
        this.defaultUserAgent

      // 准备请求配置
      const requestConfig = {
        method: 'POST',
        url: apiEndpoint,
        data: body,
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'User-Agent': userAgent,
          ...filteredHeaders
        },
        httpsAgent: proxyAgent,
        timeout: config.proxy.streamTimeout || 120000, // 流式响应使用更长超时
        responseType: 'stream',
        validateStatus: () => true // 接受所有状态码
      }

      // 根据 API Key 格式选择认证方式
      if (account.apiKey && account.apiKey.startsWith('sk-ant-')) {
        // Anthropic 官方 API Key 使用 x-api-key
        requestConfig.headers['x-api-key'] = account.apiKey
        logger.debug('[DEBUG] Using x-api-key authentication for sk-ant-* API key')
      } else {
        // 其他 API Key 使用 Authorization Bearer
        requestConfig.headers['Authorization'] = `Bearer ${account.apiKey}`
        logger.debug('[DEBUG] Using Authorization Bearer authentication')
      }

      // 添加beta header如果需要
      if (requestOptions.betaHeader) {
        requestConfig.headers['anthropic-beta'] = requestOptions.betaHeader
      }

      // 使用连接池
      requestConfig.httpAgent = connectionPool.getHttpAgent()
      requestConfig.httpsAgent = connectionPool.getHttpsAgent()

      // 发送请求
      const request = axios(requestConfig)

      request
        .then((response) => {
          logger.debug(`🌊 Claude Console Claude stream response status: ${response.status}`)

          // 错误响应处理
          if (response.status !== 200) {
            logger.error(`❌ Claude Console API returned error status: ${response.status}`)

            if (response.status === 429) {
              claudeConsoleAccountService.markAccountRateLimited(accountId)
            }

            // 记录上游错误
            const chunks = []
            response.data.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
            response.data.on('end', async () => {
              const raw = Buffer.concat(chunks).toString('utf8')
              // 智能限流：根据上游错误应用规则（内部按动态配置判定是否启用）
              try {
                await smartRateLimitService.handleUpstreamError({
                  accountId,
                  accountName: account.name || accountId,
                  accountType: 'claude-console',
                  statusCode: response.status,
                  errorMessage: raw,
                  errorBody: { headers: response.headers },
                  apiKeyId: 'unknown',
                  apiKeyName: 'unknown',
                  isFromUpstream: true // 明确标识这是来自上游 API 的错误
                })
              } catch (e) {
                logger.warn(
                  '⚠️ smartRateLimitService.handleUpstreamError failed (console stream):',
                  e.message
                )
              }
              await upstreamErrorService.recordError({
                accountId,
                status: response.status,
                message: raw,
                provider: 'claude-console',
                accountType: 'claude-console'
              })

              // 统一自定义文案返回
              const errorType = upstreamErrorService.classifyError({
                status: response.status,
                message: raw
              })
              const clientMessage = await upstreamErrorService.getClientMessage(
                accountId,
                errorType
              )

              if (!responseStream.headersSent) {
                responseStream.writeHead(this._mapErrorStatus(response.status), {
                  'Content-Type': 'text/event-stream',
                  'Cache-Control': 'no-cache',
                  Connection: 'keep-alive'
                })
              }
              if (!responseStream.destroyed) {
                responseStream.write('event: error\n')
                responseStream.write(`data: ${JSON.stringify({ error: clientMessage })}\n\n`)
                responseStream.end()
              }
              resolve()
            })
            return
          }

          // 成功响应，检查并移除限流状态
          claudeConsoleAccountService.isAccountRateLimited(accountId).then((isRateLimited) => {
            if (isRateLimited) {
              claudeConsoleAccountService.removeAccountRateLimit(accountId)
            }
          })

          // 设置响应头
          if (!responseStream.headersSent) {
            responseStream.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
              'X-Accel-Buffering': 'no'
            })
          }

          let buffer = ''
          let finalUsageReported = false
          const collectedUsageData = {}

          // 处理流数据
          response.data.on('data', (chunk) => {
            try {
              if (aborted) {
                return
              }

              const chunkStr = chunk.toString()
              buffer += chunkStr

              // 处理完整的SSE行
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''

              // 转发数据并解析usage
              if (lines.length > 0 && !responseStream.destroyed) {
                const linesToForward = lines.join('\n') + (lines.length > 0 ? '\n' : '')

                // 应用流转换器如果有
                if (streamTransformer) {
                  const transformed = streamTransformer(linesToForward)
                  if (transformed) {
                    responseStream.write(transformed)
                  }
                } else {
                  responseStream.write(linesToForward)
                }

                // 解析SSE数据寻找usage信息
                for (const line of lines) {
                  if (line.startsWith('data: ') && line.length > 6) {
                    try {
                      const jsonStr = line.slice(6)
                      const data = JSON.parse(jsonStr)

                      // 收集usage数据
                      if (data.type === 'message_start' && data.message && data.message.usage) {
                        collectedUsageData.input_tokens = data.message.usage.input_tokens || 0
                        collectedUsageData.cache_creation_input_tokens =
                          data.message.usage.cache_creation_input_tokens || 0
                        collectedUsageData.cache_read_input_tokens =
                          data.message.usage.cache_read_input_tokens || 0
                        collectedUsageData.model = data.message.model
                      }

                      if (
                        data.type === 'message_delta' &&
                        data.usage &&
                        data.usage.output_tokens !== undefined
                      ) {
                        collectedUsageData.output_tokens = data.usage.output_tokens || 0

                        if (collectedUsageData.input_tokens !== undefined && !finalUsageReported) {
                          usageCallback({ ...collectedUsageData, accountId })
                          finalUsageReported = true
                        }
                      }

                      // 不再因为模型不支持而block账号
                    } catch (e) {
                      // 忽略解析错误
                    }
                  }
                }
              }
            } catch (error) {
              logger.error('❌ Error processing Claude Console stream data:', error)
              if (!responseStream.destroyed) {
                responseStream.write('event: error\n')
                responseStream.write(
                  `data: ${JSON.stringify({
                    error: 'Stream processing error',
                    message: error.message,
                    timestamp: new Date().toISOString()
                  })}\n\n`
                )
              }
            }
          })

          response.data.on('end', () => {
            try {
              // 处理缓冲区中剩余的数据
              if (buffer.trim() && !responseStream.destroyed) {
                if (streamTransformer) {
                  const transformed = streamTransformer(buffer)
                  if (transformed) {
                    responseStream.write(transformed)
                  }
                } else {
                  responseStream.write(buffer)
                }
              }

              // 确保流正确结束
              if (!responseStream.destroyed) {
                responseStream.end()
              }

              logger.debug('🌊 Claude Console Claude stream response completed')
              resolve()
            } catch (error) {
              logger.error('❌ Error processing stream end:', error)
              reject(error)
            }
          })

          response.data.on('error', (error) => {
            logger.error('❌ Claude Console stream error:', error)
            if (!responseStream.destroyed) {
              responseStream.write('event: error\n')
              responseStream.write(
                `data: ${JSON.stringify({
                  error: 'Stream error',
                  message: error.message,
                  timestamp: new Date().toISOString()
                })}\n\n`
              )
              responseStream.end()
            }
            reject(error)
          })
        })
        .catch((error) => {
          if (aborted) {
            return
          }

          logger.error('❌ Claude Console Claude stream request error:', error.message)

          // 检查是否是429错误
          if (error.response && error.response.status === 429) {
            claudeConsoleAccountService.markAccountRateLimited(accountId)
          }

          // 记录错误并以统一文案返回
          ;(async () => {
            const { errorType } = await upstreamErrorService.recordError({
              accountId,
              status: error.response?.status || 0,
              code: error.code,
              message: error.message,
              data: error.response?.data,
              provider: 'claude-console',
              accountType: 'claude-console'
            })
            const clientMessage = await upstreamErrorService.getClientMessage(accountId, errorType)

            if (!responseStream.headersSent) {
              responseStream.writeHead(this._mapErrorStatus(error.response?.status), {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive'
              })
            }

            if (!responseStream.destroyed) {
              responseStream.write('event: error\n')
              responseStream.write(`data: ${JSON.stringify({ error: clientMessage })}\n\n`)
              responseStream.end()
            }

            reject(error)
          })()
        })

      // 处理客户端断开连接
      responseStream.on('close', () => {
        logger.debug('🔌 Client disconnected, cleaning up Claude Console stream')
        aborted = true
      })
    })
  }

  // 🔧 过滤客户端请求头
  _filterClientHeaders(clientHeaders) {
    const sensitiveHeaders = [
      'content-type',
      'user-agent',
      'authorization',
      'x-api-key',
      'host',
      'content-length',
      'connection',
      'proxy-authorization',
      'content-encoding',
      'transfer-encoding',
      'anthropic-version'
    ]

    const filteredHeaders = {}

    Object.keys(clientHeaders || {}).forEach((key) => {
      const lowerKey = key.toLowerCase()
      if (!sensitiveHeaders.includes(lowerKey)) {
        filteredHeaders[key] = clientHeaders[key]
      }
    })

    return filteredHeaders
  }

  // 🕐 更新最后使用时间
  async _updateLastUsedTime(accountId) {
    try {
      const client = require('../models/redis').getClientSafe()
      await client.hset(
        `claude_console_account:${accountId}`,
        'lastUsedAt',
        new Date().toISOString()
      )
    } catch (error) {
      logger.warn(
        `⚠️ Failed to update last used time for Claude Console account ${accountId}:`,
        error.message
      )
    }
  }

  // 🎯 健康检查
  async healthCheck() {
    try {
      const accounts = await claudeConsoleAccountService.getAllAccounts()
      const activeAccounts = accounts.filter((acc) => acc.isActive && acc.status === 'active')

      return {
        healthy: activeAccounts.length > 0,
        activeAccounts: activeAccounts.length,
        totalAccounts: accounts.length,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      logger.error('❌ Claude Console Claude health check failed:', error)
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }
}

module.exports = new ClaudeConsoleRelayService()
