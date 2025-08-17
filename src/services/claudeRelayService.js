const https = require('https')
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')
const { SocksProxyAgent } = require('socks-proxy-agent')
const { HttpsProxyAgent } = require('https-proxy-agent')
const claudeAccountService = require('./claudeAccountService')
const unifiedClaudeScheduler = require('./unifiedClaudeScheduler')
const sessionHelper = require('../utils/sessionHelper')
const logger = require('../utils/logger')
const config = require('../../config/config')
const claudeCodeHeadersService = require('./claudeCodeHeadersService')
const smartRateLimitService = require('./smartRateLimitService')

class ClaudeRelayService {
  constructor() {
    this.claudeApiUrl = config.claude.apiUrl
    this.apiVersion = config.claude.apiVersion
    this.betaHeader = config.claude.betaHeader
    this.systemPrompt = config.claude.systemPrompt
    this.claudeCodeSystemPrompt = "You are Claude Code, Anthropic's official CLI for Claude."
  }

  // 判断是否是真实的 Claude Code 请求
  isRealClaudeCodeRequest(requestBody, clientHeaders) {
    // 检查 user-agent 是否匹配 Claude Code 格式
    const userAgent = clientHeaders?.['user-agent'] || clientHeaders?.['User-Agent'] || ''
    const isClaudeCodeUserAgent = /claude-cli\/\d+\.\d+\.\d+/.test(userAgent)

    // 检查系统提示词是否包含 Claude Code 标识
    const hasClaudeCodeSystemPrompt = this._hasClaudeCodeSystemPrompt(requestBody)

    // 只有当 user-agent 匹配且系统提示词正确时，才认为是真实的 Claude Code 请求
    return isClaudeCodeUserAgent && hasClaudeCodeSystemPrompt
  }

  // 检查请求中是否包含 Claude Code 系统提示词
  _hasClaudeCodeSystemPrompt(requestBody) {
    if (!requestBody || !requestBody.system) {
      return false
    }

    // 如果是字符串格式，一定不是真实的 Claude Code 请求
    if (typeof requestBody.system === 'string') {
      return false
    }

    // 处理数组格式
    if (Array.isArray(requestBody.system) && requestBody.system.length > 0) {
      const firstItem = requestBody.system[0]
      // 检查第一个元素是否包含 Claude Code 提示词
      return (
        firstItem &&
        firstItem.type === 'text' &&
        firstItem.text &&
        firstItem.text === this.claudeCodeSystemPrompt
      )
    }

    return false
  }

  // 转发请求到Claude API
  async relayRequest(
    requestBody,
    apiKeyData,
    clientRequest,
    clientResponse,
    clientHeaders,
    options = {}
  ) {
    let upstreamRequest = null

    try {
      // 调试日志：查看API Key数据
      logger.info('[信息] 接收到 API Key 数据：', {
        apiKeyName: apiKeyData.name,
        enableModelRestriction: apiKeyData.enableModelRestriction,
        restrictedModels: apiKeyData.restrictedModels,
        requestedModel: requestBody.model
      })

      // 检查模型限制
      if (
        apiKeyData.enableModelRestriction &&
        apiKeyData.restrictedModels &&
        apiKeyData.restrictedModels.length > 0
      ) {
        const requestedModel = requestBody.model
        logger.info(
          `[信息] 模型限制检查 - 请求模型: ${requestedModel}, 限制模型: ${JSON.stringify(apiKeyData.restrictedModels)}`
        )

        if (requestedModel && apiKeyData.restrictedModels.includes(requestedModel)) {
          logger.warn(`[警告] API Key ${apiKeyData.name} 试图使用受限模型 ${requestedModel}`)
          return {
            statusCode: 403,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              error: {
                type: 'forbidden',
                message: '暂无该模型访问权限'
              }
            })
          }
        }
      }

      // 生成会话哈希用于sticky会话
      const sessionHash = sessionHelper.generateSessionHash(requestBody)

      // 选择可用的Claude账户（支持专属绑定和sticky会话）
      const accountSelection = await unifiedClaudeScheduler.selectAccountForApiKey(
        apiKeyData,
        sessionHash,
        requestBody.model
      )
      const { accountId } = accountSelection
      const { accountType } = accountSelection

      logger.info(
        `[信息] 处理请求 - Key: ${apiKeyData.name || apiKeyData.id}, 账户: ${accountId}（${accountType}）${sessionHash ? `, 会话: ${sessionHash}` : ''}`
      )

      // 获取有效的访问token
      const accessToken = await claudeAccountService.getValidAccessToken(accountId)

      // 处理请求体（传递 clientHeaders 以判断是否需要设置 Claude Code 系统提示词）
      const processedBody = this._processRequestBody(requestBody, clientHeaders)

      // 获取代理配置
      const proxyAgent = await this._getProxyAgent(accountId)

      // 设置客户端断开监听器
      const handleClientDisconnect = () => {
        logger.info('[信息] 客户端已断开，正在中止上游请求')
        if (upstreamRequest && !upstreamRequest.destroyed) {
          upstreamRequest.destroy()
        }
      }

      // 监听客户端断开事件
      if (clientRequest) {
        clientRequest.once('close', handleClientDisconnect)
      }
      if (clientResponse) {
        clientResponse.once('close', handleClientDisconnect)
      }

      // 发送请求到Claude API（传入回调以获取请求对象）
      const response = await this._makeClaudeRequest(
        processedBody,
        accessToken,
        proxyAgent,
        clientHeaders,
        accountId,
        (req) => {
          upstreamRequest = req
        },
        options,
        apiKeyData // 添加apiKeyData参数
      )

      // 移除监听器（请求成功完成）
      if (clientRequest) {
        clientRequest.removeListener('close', handleClientDisconnect)
      }
      if (clientResponse) {
        clientResponse.removeListener('close', handleClientDisconnect)
      }

      // 智能限流和传统限流的错误处理
      if (response.statusCode !== 200 && response.statusCode !== 201) {
        // 构建错误信息对象
        const errorInfo = {
          statusCode: response.statusCode,
          error: response.body || '未知错误',
          headers: response.headers,
          timestamp: new Date().toISOString()
        }

        // 使用新的智能限流系统（服务内部根据动态配置决定是否启用）
        const rateLimitResult = await smartRateLimitService.handleUpstreamError({
          accountId,
          accountName: accountId,
          accountType: 'claude',
          statusCode: response.statusCode,
          errorMessage: response.body || '',
          errorBody: errorInfo,
          apiKeyId: apiKeyData.id,
          apiKeyName: apiKeyData.name || 'unknown'
        })

        if (rateLimitResult.shouldLimit) {
          logger.warn(`[智能限流] 触发限流 - 账户 ${accountId}，原因: ${rateLimitResult.reason}`)
          // 删除会话映射
          if (sessionHash) {
            await unifiedClaudeScheduler._deleteSessionMapping(sessionHash)
          }
        }

        // 401 错误阈值记录（保持原逻辑）
        if (response.statusCode === 401) {
          try {
            await this.recordUnauthorizedError(accountId)
            const errorCount = await this.getUnauthorizedErrorCount(accountId)
            if (errorCount >= 3) {
              logger.warn(
                `[警告] 账户 ${accountId} 连续 401 错误达到阈值（${errorCount} 次），标记为未授权`
              )
            }
          } catch (e) {
            logger.warn(`[警告] 记录401错误失败 - 账户 ${accountId}：`, e.message)
          }
        }

        // 429 传统限流处理（保持原逻辑片段）
        if (response.statusCode === 429) {
          let rateLimitResetTimestamp = null
          if (response.headers && response.headers['anthropic-ratelimit-unified-reset']) {
            rateLimitResetTimestamp = parseInt(
              response.headers['anthropic-ratelimit-unified-reset']
            )
            logger.info(
              `[信息] 解析到限流重置时间戳：${rateLimitResetTimestamp}（${new Date(
                rateLimitResetTimestamp * 1000
              ).toISOString()}）`
            )
          }

          // 传统限流检测
          let isRateLimited = false
          try {
            const parsed = JSON.parse(response.body || '{}')
            if (
              parsed &&
              parsed.error &&
              typeof parsed.error.message === 'string' &&
              parsed.error.message.toLowerCase().includes("exceed your account's rate limit")
            ) {
              isRateLimited = true
            }
          } catch (e) {
            if (
              response.body &&
              response.body.toLowerCase().includes("exceed your account's rate limit")
            ) {
              isRateLimited = true
            }
          }

          if (isRateLimited) {
            logger.warn(`[警告] 检测到传统限流 - 账户 ${accountId}，状态: ${response.statusCode}`)
            await unifiedClaudeScheduler.markAccountRateLimited(
              accountId,
              accountType,
              sessionHash,
              rateLimitResetTimestamp
            )
          }
        }
      } else {
        // 请求成功，清除401错误计数
        await this.clearUnauthorizedErrors(accountId)

        // 如果请求成功，检查并移除限流状态（智能限流由服务自动处理恢复）
        const isRateLimited = await smartRateLimitService.isRateLimited(accountId)
        if (isRateLimited) {
          logger.info(`[智能限流] 账户 ${accountId} 请求成功，但仍在限流中`)
        }

        // 只有真实的 Claude Code 请求才更新 headers（原逻辑保留）
      }

      return response
    } catch (error) {
      // 记录详细的错误信息到关键日志
      const errorDetails = {
        apiKeyName: apiKeyData.name || apiKeyData.id,
        errorMessage: error.message,
        errorCode: error.code,
        upstream: this.claudeApiUrl,
        timestamp: new Date().toISOString(),
        requestDuration: Date.now() - (clientRequest?._startTime || Date.now()),
        stackTrace: error.stack
      }

      logger.error(`[错误] Claude 转发请求失败，Key: ${apiKeyData.name || apiKeyData.id}：`, error)
      logger.error('❌  Claude relay error:', errorDetails)

      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: { type: 'internal_error', message: '转发请求失败' } })
      }
    }
  }

  // 处理请求体（保留原实现，以下仅修改日志）
  _processRequestBody(body, clientHeaders = {}) {
    try {
      // 深拷贝请求体
      const processedBody = JSON.parse(JSON.stringify(body))

      // 验证并限制max_tokens参数
      this._validateMaxTokens(processedBody)

      // 移除cache_control中的ttl字段
      this._stripTtlFromCacheControl(processedBody)

      // 判断是否是真实的 Claude Code 请求
      const isRealClaudeCode = this.isRealClaudeCodeRequest(processedBody, clientHeaders)

      // 如果不是真实的 Claude Code 请求，需要设置 Claude Code 系统提示词
      if (!isRealClaudeCode) {
        const claudeCodePrompt = {
          type: 'text',
          text: this.claudeCodeSystemPrompt,
          cache_control: {
            type: 'ephemeral'
          }
        }

        if (processedBody.system) {
          if (typeof processedBody.system === 'string') {
            // 字符串格式：转换为数组，Claude Code 提示词在第一位
            const userSystemPrompt = {
              type: 'text',
              text: processedBody.system
            }
            // 如果用户的提示词与 Claude Code 提示词相同，只保留一个
            if (processedBody.system.trim() === this.claudeCodeSystemPrompt) {
              processedBody.system = [claudeCodePrompt]
            } else {
              processedBody.system = [claudeCodePrompt, userSystemPrompt]
            }
          } else if (Array.isArray(processedBody.system)) {
            // 检查第一个元素是否是 Claude Code 系统提示词
            const firstItem = processedBody.system[0]
            const isFirstItemClaudeCode =
              firstItem &&
              firstItem.type === 'text' &&
              firstItem.text === this.claudeCodeSystemPrompt

            if (!isFirstItemClaudeCode) {
              // 如果第一个不是 Claude Code 提示词，需要在开头插入
              // 同时检查数组中是否有其他位置包含 Claude Code 提示词，如果有则移除
              const filteredSystem = processedBody.system.filter(
                (item) =>
                  !(item && item.type === 'text' && item.text === this.claudeCodeSystemPrompt)
              )
              processedBody.system = [claudeCodePrompt, ...filteredSystem]
            }
          } else {
            // 其他格式，记录警告但不抛出错误，尝试处理
            logger.warn('[警告] 意外的 system 字段类型：', typeof processedBody.system)
            processedBody.system = [claudeCodePrompt]
          }
        } else {
          // 用户没有传递 system，需要添加 Claude Code 提示词
          processedBody.system = [claudeCodePrompt]
        }
      }

      // 处理原有的系统提示（如果配置了）
      if (this.systemPrompt && this.systemPrompt.trim()) {
        const systemPrompt = {
          type: 'text',
          text: this.systemPrompt
        }

        // 经过上面的处理，system 现在应该总是数组格式
        if (processedBody.system && Array.isArray(processedBody.system)) {
          // 不要重复添加相同的系统提示
          const hasSystemPrompt = processedBody.system.some(
            (item) => item && item.text && item.text === this.systemPrompt
          )
          if (!hasSystemPrompt) {
            processedBody.system.push(systemPrompt)
          }
        } else {
          // 理论上不应该走到这里，但为了安全起见
          processedBody.system = [systemPrompt]
        }
      } else {
        // 如果没有配置系统提示，且system字段为空，则删除它
        if (processedBody.system && Array.isArray(processedBody.system)) {
          const hasValidContent = processedBody.system.some(
            (item) => item && item.text && item.text.trim()
          )
          if (!hasValidContent) {
            delete processedBody.system
          }
        }
      }

      // Claude API只允许temperature或top_p其中之一，优先使用temperature
      if (processedBody.top_p !== undefined && processedBody.top_p !== null) {
        delete processedBody.top_p
      }

      return processedBody
    } catch (error) {
      logger.error('[错误] 处理请求体失败：', error)
      return body
    }
  }

  // 验证 max_tokens（仅日志翻译）
  _validateMaxTokens(body) {
    try {
      // 如果没有设置 max_tokens，跳过验证
      if (body.max_tokens === undefined || body.max_tokens === null) {
        return
      }

      // 确保 max_tokens 是数字
      if (typeof body.max_tokens !== 'number' || isNaN(body.max_tokens)) {
        logger.warn('[警告] max_tokens 不是有效数字，使用默认值')
        body.max_tokens = config.claude?.maxTokens || 4096
        return
      }

      // 从配置获取最大限制，默认 4096
      const configMaxTokens = config.claude?.maxTokens || 4096

      // 尝试从定价文件获取更精确的限制
      let modelMaxLimit = configMaxTokens
      try {
        const pricingFilePath = path.join(__dirname, '../../data/model_pricing.json')
        if (fs.existsSync(pricingFilePath)) {
          const pricingData = JSON.parse(fs.readFileSync(pricingFilePath, 'utf8'))
          const model = body.model || 'claude-sonnet-4-20250514'
          const modelConfig = pricingData[model]

          if (modelConfig) {
            const pricingLimit = modelConfig.max_tokens || modelConfig.max_output_tokens
            if (pricingLimit && typeof pricingLimit === 'number') {
              modelMaxLimit = pricingLimit
            }
          }
        }
      } catch (error) {
        logger.debug('[调试] 无法从定价文件读取限制，使用配置默认值：', error.message)
      }

      // 使用两个限制中的较小值
      const effectiveMaxLimit = Math.min(configMaxTokens, modelMaxLimit)

      // 检查并调整max_tokens
      if (body.max_tokens > effectiveMaxLimit) {
        logger.warn(
          `[警告] max_tokens ${body.max_tokens} 超出限制 ${effectiveMaxLimit}，调整为 ${effectiveMaxLimit}`
        )
        body.max_tokens = effectiveMaxLimit
      } else if (body.max_tokens <= 0) {
        logger.warn('[警告] max_tokens 必须大于 0，使用默认值')
        body.max_tokens = effectiveMaxLimit
      }
    } catch (error) {
      logger.error('[错误] 验证 max_tokens 失败：', error)
      // 如果验证失败，设置安全的默认值
      if (body.max_tokens && typeof body.max_tokens === 'number' && body.max_tokens > 0) {
        // 保持用户的值，但限制在安全范围内
        body.max_tokens = Math.min(body.max_tokens, 4096)
      }
    }
  }

  // 兼容性别名方法（防止其他地方可能调用）
  _validateAndLimitMaxTokens(body) {
    return this._validateMaxTokens(body)
  }

  // 🧹 移除TTL字段
  _stripTtlFromCacheControl(body) {
    if (!body || typeof body !== 'object') {
      return
    }

    const processContentArray = (contentArray) => {
      if (!Array.isArray(contentArray)) {
        return
      }

      contentArray.forEach((item) => {
        if (item && typeof item === 'object' && item.cache_control) {
          if (item.cache_control.ttl) {
            delete item.cache_control.ttl
            logger.debug('[调试] 从 cache_control 移除 ttl')
          }
        }
      })
    }

    if (Array.isArray(body.system)) {
      processContentArray(body.system)
    }

    if (Array.isArray(body.messages)) {
      body.messages.forEach((message) => {
        if (message && Array.isArray(message.content)) {
          processContentArray(message.content)
        }
      })
    }
  }

  // 🌐 获取代理Agent
  async _getProxyAgent(accountId) {
    try {
      const accountData = await claudeAccountService.getAllAccounts()
      const account = accountData.find((acc) => acc.id === accountId)

      if (!account || !account.proxy) {
        return null
      }

      const { proxy } = account

      if (proxy.type === 'socks5') {
        const auth = proxy.username && proxy.password ? `${proxy.username}:${proxy.password}@` : ''
        const socksUrl = `socks5://${auth}${proxy.host}:${proxy.port}`
        return new SocksProxyAgent(socksUrl)
      } else if (proxy.type === 'http' || proxy.type === 'https') {
        const auth = proxy.username && proxy.password ? `${proxy.username}:${proxy.password}@` : ''
        const httpUrl = `${proxy.type}://${auth}${proxy.host}:${proxy.port}`
        return new HttpsProxyAgent(httpUrl)
      }
    } catch (error) {
      logger.warn('[警告] 创建代理 Agent 失败：', error)
    }

    return null
  }

  // 🔧 过滤客户端请求头
  _filterClientHeaders(clientHeaders) {
    // 需要移除的敏感 headers
    const sensitiveHeaders = [
      'content-type',
      'user-agent',
      'x-api-key',
      'authorization',
      'host',
      'content-length',
      'connection',
      'proxy-authorization',
      'content-encoding',
      'transfer-encoding'
    ]

    // 应该保留的 headers（用于会话一致性和追踪）
    const allowedHeaders = ['x-request-id']

    const filteredHeaders = {}

    // 转发客户端的非敏感 headers
    Object.keys(clientHeaders || {}).forEach((key) => {
      const lowerKey = key.toLowerCase()
      // 如果在允许列表中，直接保留
      if (allowedHeaders.includes(lowerKey)) {
        filteredHeaders[key] = clientHeaders[key]
      }
      // 如果不在敏感列表中，也保留
      else if (!sensitiveHeaders.includes(lowerKey)) {
        filteredHeaders[key] = clientHeaders[key]
      }
    })

    return filteredHeaders
  }

  // 🔗 发送请求到Claude API
  async _makeClaudeRequest(
    body,
    accessToken,
    proxyAgent,
    clientHeaders,
    accountId,
    onRequest,
    requestOptions = {},
    apiKeyData = {} // 添加apiKeyData参数
  ) {
    const _requestStartTime = Date.now() // 标记为未使用但保留
    // 如该官方账户存在自定义官网 API 地址，则优先使用
    let baseUrl = this.claudeApiUrl
    try {
      const accountData = await claudeAccountService.getAccount(accountId)
      if (accountData && accountData.officialApiUrl && accountData.officialApiUrl.trim()) {
        baseUrl = accountData.officialApiUrl.trim()
      }
    } catch (e) {
      // 忽略获取失败，继续使用默认地址
    }
    const url = new URL(baseUrl)

    // 获取过滤后的客户端 headers
    const filteredHeaders = this._filterClientHeaders(clientHeaders)

    // 判断是否是真实的 Claude Code 请求
    const isRealClaudeCode = this.isRealClaudeCodeRequest(body, clientHeaders)

    // 如果不是真实的 Claude Code 请求，需要使用从账户获取的 Claude Code headers
    const finalHeaders = { ...filteredHeaders }

    if (!isRealClaudeCode) {
      // 获取该账号存储的 Claude Code headers
      const claudeCodeHeaders = await claudeCodeHeadersService.getAccountHeaders(accountId)

      // 只添加客户端没有提供的 headers
      Object.keys(claudeCodeHeaders).forEach((key) => {
        const lowerKey = key.toLowerCase()
        if (!finalHeaders[key] && !finalHeaders[lowerKey]) {
          finalHeaders[key] = claudeCodeHeaders[key]
        }
      })
    }

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'anthropic-version': this.apiVersion,
          ...finalHeaders
        },
        agent: proxyAgent,
        timeout: config.proxy.timeout
      }

      // 如果客户端没有提供 User-Agent，使用默认值
      if (!options.headers['User-Agent'] && !options.headers['user-agent']) {
        options.headers['User-Agent'] = 'claude-cli/1.0.57 (external, cli)'
      }

      // 使用自定义的 betaHeader 或默认值
      const betaHeader =
        requestOptions?.betaHeader !== undefined ? requestOptions.betaHeader : this.betaHeader
      if (betaHeader) {
        options.headers['anthropic-beta'] = betaHeader
      }

      const req = https.request(options, (res) => {
        let responseData = Buffer.alloc(0)

        res.on('data', (chunk) => {
          responseData = Buffer.concat([responseData, chunk])
        })

        res.on('end', () => {
          try {
            let bodyString = ''

            // 根据Content-Encoding处理响应数据
            const contentEncoding = res.headers['content-encoding']
            if (contentEncoding === 'gzip') {
              try {
                bodyString = zlib.gunzipSync(responseData).toString('utf8')
              } catch (unzipError) {
                logger.error('[错误] 解压 gzip 响应失败：', unzipError)
                bodyString = responseData.toString('utf8')
              }
            } else if (contentEncoding === 'deflate') {
              try {
                bodyString = zlib.inflateSync(responseData).toString('utf8')
              } catch (unzipError) {
                logger.error('[错误] 解压 deflate 响应失败：', unzipError)
                bodyString = responseData.toString('utf8')
              }
            } else {
              bodyString = responseData.toString('utf8')
            }

            const response = {
              statusCode: res.statusCode,
              headers: res.headers,
              body: bodyString
            }

            logger.debug(`[调试] Claude API 响应：${res.statusCode}`)

            resolve(response)
          } catch (error) {
            logger.error('[错误] 解析 Claude API 响应失败：', error)
            reject(error)
          }
        })
      })

      // 如果提供了 onRequest 回调，传递请求对象
      if (onRequest && typeof onRequest === 'function') {
        onRequest(req)
      }

      req.on('error', (error) => {
        logger.error('[错误] Claude 流式请求错误：', error.message)
        logger.error('[错误] Claude API 请求错误：', error.message, {
          code: error.code,
          errno: error.errno,
          syscall: error.syscall,
          address: error.address,
          port: error.port,
          upstream: baseUrl,
          accountId,
          apiKeyName: apiKeyData?.name || 'unknown'
        })

        // 根据错误类型提供更具体的错误信息
        let errorMessage = 'Upstream request failed'
        if (error.code === 'ECONNRESET') {
          errorMessage = 'Connection reset by Claude API server'
        } else if (error.code === 'ENOTFOUND') {
          errorMessage = 'Unable to resolve Claude API hostname'
        } else if (error.code === 'ECONNREFUSED') {
          errorMessage = 'Connection refused by Claude API server'
        } else if (error.code === 'ETIMEDOUT') {
          errorMessage = 'Connection timed out to Claude API server'
        }

        reject(new Error(errorMessage))
      })

      req.on('timeout', () => {
        req.destroy()
        logger.error('[错误] Claude API 请求超时', {
          upstream: baseUrl,
          timeout: config.proxy.timeout,
          accountId,
          apiKeyName: apiKeyData?.name || 'unknown',
          timestamp: new Date().toISOString()
        })
        reject(new Error('Request timeout'))
      })

      // 写入请求体
      req.write(JSON.stringify(body))
      req.end()
    })
  }

  // 🌊 处理流式响应（带usage数据捕获）
  async relayStreamRequestWithUsageCapture(
    requestBody,
    apiKeyData,
    responseStream,
    clientHeaders,
    usageCallback,
    streamTransformer = null,
    _options = {}
  ) {
    try {
      // 调试日志：查看API Key数据（流式请求）
      logger.info('[信息] [流式请求] 接收到 API Key 数据：', {
        apiKeyName: apiKeyData.name,
        enableModelRestriction: apiKeyData.enableModelRestriction,
        restrictedModels: apiKeyData.restrictedModels,
        requestedModel: requestBody.model
      })

      // 检查模型限制
      if (
        apiKeyData.enableModelRestriction &&
        apiKeyData.restrictedModels &&
        apiKeyData.restrictedModels.length > 0
      ) {
        const requestedModel = requestBody.model
        logger.info(
          `[信息] [流式请求] 模型限制检查 - 请求模型: ${requestedModel}, 限制模型: ${JSON.stringify(apiKeyData.restrictedModels)}`
        )

        if (requestedModel && apiKeyData.restrictedModels.includes(requestedModel)) {
          logger.warn(
            `[警告] 模型限制违反 - Key ${apiKeyData.name}: 尝试使用受限模型 ${requestedModel}`
          )

          // 对于流式响应，需要写入错误并结束流
          const errorResponse = JSON.stringify({
            error: {
              type: 'forbidden',
              message: '暂无该模型访问权限'
            }
          })

          responseStream.writeHead(403, { 'Content-Type': 'application/json' })
          responseStream.end(errorResponse)
          return
        }
      }

      // 生成会话哈希用于sticky会话
      const sessionHash = sessionHelper.generateSessionHash(requestBody)

      // 选择可用的Claude账户（支持专属绑定和sticky会话）
      const accountSelection = await unifiedClaudeScheduler.selectAccountForApiKey(
        apiKeyData,
        sessionHash,
        requestBody.model
      )
      const { accountId } = accountSelection
      const { accountType } = accountSelection

      logger.info(
        `[信息] [流式请求] 处理带 usage 捕获的流式 API 请求 - Key: ${apiKeyData.name || apiKeyData.id}, 账户: ${accountId}（${accountType}）${sessionHash ? `, 会话: ${sessionHash}` : ''}`
      )

      // 获取有效的访问token
      const accessToken = await claudeAccountService.getValidAccessToken(accountId)

      // 处理请求体（传递 clientHeaders 以判断是否需要设置 Claude Code 系统提示词）
      const processedBody = this._processRequestBody(requestBody, clientHeaders)

      // 获取代理配置
      const proxyAgent = await this._getProxyAgent(accountId)

      // 发送流式请求并捕获usage数据
      await this._makeClaudeStreamRequestWithUsageCapture(
        processedBody,
        accessToken,
        proxyAgent,
        clientHeaders,
        responseStream,
        (usageData) => {
          // 在usageCallback中添加accountId
          usageCallback({ ...usageData, accountId })
        },
        accountId,
        accountType,
        sessionHash,
        streamTransformer,
        {}, // requestOptions
        apiKeyData // 传递API Key数据
      )
    } catch (error) {
      logger.error('[错误] Claude 流式请求带 usage 捕获失败：', error)
      throw error
    }
  }

  // 🌊 发送流式请求到Claude API（带usage数据捕获）
  async _makeClaudeStreamRequestWithUsageCapture(
    body,
    accessToken,
    proxyAgent,
    clientHeaders,
    responseStream,
    usageCallback,
    accountId,
    accountType,
    sessionHash,
    streamTransformer = null,
    requestOptions = {},
    apiKeyData = {} // 接收API Key数据
  ) {
    const requestStartTime = Date.now() // 被使用，保持原名
    // 获取过滤后的客户端 headers
    const filteredHeaders = this._filterClientHeaders(clientHeaders)

    // 判断是否是真实的 Claude Code 请求
    const isRealClaudeCode = this.isRealClaudeCodeRequest(body, clientHeaders)

    // 如果不是真实的 Claude Code 请求，需要使用从账户获取的 Claude Code headers
    const finalHeaders = { ...filteredHeaders }

    if (!isRealClaudeCode) {
      // 获取该账号存储的 Claude Code headers
      const claudeCodeHeaders = await claudeCodeHeadersService.getAccountHeaders(accountId)

      // 只添加客户端没有提供的 headers
      Object.keys(claudeCodeHeaders).forEach((key) => {
        const lowerKey = key.toLowerCase()
        if (!finalHeaders[key] && !finalHeaders[lowerKey]) {
          finalHeaders[key] = claudeCodeHeaders[key]
        }
      })
    }

    // 如该官方账户存在自定义官网 API 地址，则优先使用
    let baseUrl = this.claudeApiUrl
    try {
      const accountData = await claudeAccountService.getAccount(accountId)
      if (accountData && accountData.officialApiUrl && accountData.officialApiUrl.trim()) {
        baseUrl = accountData.officialApiUrl.trim()
      }
    } catch (e) {
      // 忽略获取失败
    }

    return new Promise((resolve, reject) => {
      const url = new URL(baseUrl)

      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'anthropic-version': this.apiVersion,
          ...finalHeaders
        },
        agent: proxyAgent,
        timeout: config.proxy.timeout
      }

      // 如果客户端没有提供 User-Agent，使用默认值
      if (!options.headers['User-Agent'] && !options.headers['user-agent']) {
        options.headers['User-Agent'] = 'claude-cli/1.0.57 (external, cli)'
      }

      // 使用自定义的 betaHeader 或默认值
      const betaHeader =
        requestOptions?.betaHeader !== undefined ? requestOptions.betaHeader : this.betaHeader
      if (betaHeader) {
        options.headers['anthropic-beta'] = betaHeader
      }

      const req = https.request(options, (res) => {
        logger.debug(`[调试] Claude 流响应状态：${res.statusCode}`)

        // 智能限流和传统限流的错误响应处理
        if (res.statusCode !== 200) {
          logger.error(`[错误] Claude API 返回错误状态：${res.statusCode}`)
          let errorData = ''

          res.on('data', (chunk) => {
            errorData += chunk.toString()
          })

          res.on('end', async () => {
            logger.error('[错误] Claude API 错误响应：', errorData)

            // 构建错误信息对象
            const errorInfo = {
              statusCode: res.statusCode,
              error: errorData,
              headers: res.headers,
              timestamp: new Date().toISOString()
            }

            // 应用智能限流（服务内部根据动态配置决定是否启用）
            const rateLimitResult = await smartRateLimitService.handleUpstreamError({
              accountId,
              accountName: accountId, // 使用accountId作为名称
              accountType: 'claude',
              statusCode: res.statusCode,
              errorMessage: errorData,
              errorBody: errorInfo,
              apiKeyId: apiKeyData.id || apiKeyData.keyId,
              apiKeyName: apiKeyData.name || 'unknown'
            })

            if (rateLimitResult.shouldLimit) {
              logger.warn(
                `[智能限流] 流式请求触发限流 - 账户 ${accountId}，原因: ${rateLimitResult.reason}`
              )
              // 删除会话映射
              if (sessionHash) {
                await unifiedClaudeScheduler._deleteSessionMapping(sessionHash)
              }
            }

            if (!responseStream.destroyed) {
              // 发送错误事件
              responseStream.write('event: error\n')
              responseStream.write(
                `data: ${JSON.stringify({
                  error: 'Claude API 错误',
                  status: res.statusCode,
                  details: errorData,
                  timestamp: new Date().toISOString()
                })}\n\n`
              )
              responseStream.end()
            }
            reject(new Error(`Claude API 错误: ${res.statusCode}`))
          })
          return
        }

        let buffer = ''
        let finalUsageReported = false // 防止重复统计的标志
        const collectedUsageData = {} // 收集来自不同事件的usage数据
        let rateLimitDetected = false // 限流检测标志

        // 监听数据块，解析SSE并寻找usage信息
        res.on('data', (chunk) => {
          try {
            const chunkStr = chunk.toString()

            buffer += chunkStr

            // 处理完整的SSE行
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // 保留最后的不完整行

            // 转发已处理的完整行到客户端
            if (lines.length > 0 && !responseStream.destroyed) {
              const linesToForward = lines.join('\n') + (lines.length > 0 ? '\n' : '')
              // 如果有流转换器，应用转换
              if (streamTransformer) {
                const transformed = streamTransformer(linesToForward)
                if (transformed) {
                  responseStream.write(transformed)
                }
              } else {
                responseStream.write(linesToForward)
              }
            }

            for (const line of lines) {
              // 解析SSE数据寻找usage信息
              if (line.startsWith('data: ') && line.length > 6) {
                try {
                  const jsonStr = line.slice(6)
                  const data = JSON.parse(jsonStr)

                  // 收集来自不同事件的usage数据
                  if (data.type === 'message_start' && data.message && data.message.usage) {
                    // message_start包含input tokens、cache tokens和模型信息
                    collectedUsageData.input_tokens = data.message.usage.input_tokens || 0
                    collectedUsageData.cache_creation_input_tokens =
                      data.message.usage.cache_creation_input_tokens || 0
                    collectedUsageData.cache_read_input_tokens =
                      data.message.usage.cache_read_input_tokens || 0
                    collectedUsageData.model = data.message.model

                    logger.info(
                      '[信息] 从 message_start 收集输入/缓存数据：',
                      JSON.stringify(collectedUsageData)
                    )
                  }

                  // message_delta包含最终的output tokens
                  if (
                    data.type === 'message_delta' &&
                    data.usage &&
                    data.usage.output_tokens !== undefined
                  ) {
                    collectedUsageData.output_tokens = data.usage.output_tokens || 0

                    logger.info(
                      '[信息] 从 message_delta 收集输出数据：',
                      JSON.stringify(collectedUsageData)
                    )

                    // 如果已经收集到了input数据，现在有了output数据，可以统计了
                    if (collectedUsageData.input_tokens !== undefined && !finalUsageReported) {
                      logger.info('[信息] 收集到完整 usage 数据，触发回调')
                      usageCallback(collectedUsageData)
                      finalUsageReported = true
                    }
                  }

                  // 检查是否有限流错误
                  if (
                    data.type === 'error' &&
                    data.error &&
                    data.error.message &&
                    data.error.message.toLowerCase().includes("exceed your account's rate limit")
                  ) {
                    rateLimitDetected = true
                    logger.warn(`[警告] 流式请求检测到限流 - 账户 ${accountId}`)
                  }
                } catch (parseError) {
                  // 忽略JSON解析错误，继续处理
                  logger.debug('[调试] SSE 行不是 JSON 或没有 usage 数据：', line.slice(0, 100))
                }
              }
            }
          } catch (error) {
            logger.error('[错误] 处理流数据失败：', error)
            // 发送错误但不破坏流，让它自然结束
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

        res.on('end', async () => {
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
          } catch (error) {
            logger.error('[错误] 处理流结束失败：', error)
          }

          // 检查是否捕获到usage数据
          if (!finalUsageReported) {
            logger.warn(
              '[警告] 流式请求完成但未捕获到 usage 数据！这表明 SSE 解析或 Claude API 响应格式存在问题。'
            )
          }

          // 处理限流状态和恢复检测
          if (rateLimitDetected || res.statusCode === 429) {
            // 提取限流重置时间戳
            let rateLimitResetTimestamp = null
            if (res.headers && res.headers['anthropic-ratelimit-unified-reset']) {
              rateLimitResetTimestamp = parseInt(res.headers['anthropic-ratelimit-unified-reset'])
              logger.info(
                `[信息] 从流式响应解析到限流重置时间戳：${rateLimitResetTimestamp}（${new Date(rateLimitResetTimestamp * 1000).toISOString()}）`
              )
            }

            // 始终调用智能限流服务（内部根据动态配置决定是否启用）；
            // 如需传统限流，可在服务内部扩展或在此处添加回退逻辑
            await smartRateLimitService.handleUpstreamError({
              accountId,
              accountName: accountId,
              accountType: 'claude',
              statusCode: 429,
              errorMessage: 'Rate limit detected in stream',
              errorBody: { headers: res.headers },
              apiKeyId: apiKeyData.id || 'unknown',
              apiKeyName: apiKeyData.name || 'unknown'
            })
          } else if (res.statusCode === 200) {
            // 如果请求成功，检查限流状态（智能限流由服务自动处理恢复）
            const isRateLimited = await smartRateLimitService.isRateLimited(accountId)
            if (isRateLimited) {
              logger.info(`[智能限流] 账户 ${accountId} 流式请求成功，但仍在限流中`)
            }

            // 只有真实的 Claude Code 请求才更新 headers（流式请求）
            if (
              clientHeaders &&
              Object.keys(clientHeaders).length > 0 &&
              this.isRealClaudeCodeRequest(body, clientHeaders)
            ) {
              await claudeCodeHeadersService.storeAccountHeaders(accountId, clientHeaders)
            }
          }

          logger.debug('[调试] Claude 流响应带 usage 捕获完成')
          resolve()
        })
      })

      req.on('error', (error) => {
        logger.error('[错误] Claude 流式请求错误：', error.message, {
          code: error.code,
          errno: error.errno,
          syscall: error.syscall
        })

        // 根据错误类型提供更具体的错误信息
        let errorMessage = 'Upstream request failed'
        let statusCode = 500
        if (error.code === 'ECONNRESET') {
          errorMessage = 'Connection reset by Claude API server'
          statusCode = 502
        } else if (error.code === 'ENOTFOUND') {
          errorMessage = 'Unable to resolve Claude API hostname'
          statusCode = 502
        } else if (error.code === 'ECONNREFUSED') {
          errorMessage = 'Connection refused by Claude API server'
          statusCode = 502
        } else if (error.code === 'ETIMEDOUT') {
          errorMessage = 'Connection timed out to Claude API server'
          statusCode = 504
        }

        if (!responseStream.headersSent) {
          responseStream.writeHead(statusCode, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive'
          })
        }

        if (!responseStream.destroyed) {
          // 发送 SSE 错误事件
          responseStream.write('event: error\n')
          responseStream.write(
            `data: ${JSON.stringify({
              error: errorMessage,
              code: error.code,
              timestamp: new Date().toISOString()
            })}\n\n`
          )
          responseStream.end()
        }
        reject(error)
      })

      req.on('timeout', () => {
        req.destroy()
        const timeoutDetails = {
          upstream: baseUrl,
          timeout: config.proxy.timeout,
          accountId,
          apiKeyName: apiKeyData?.name || 'unknown',
          duration: Date.now() - requestStartTime,
          timestamp: new Date().toISOString()
        }
        logger.error('[错误] Claude 流式请求超时', timeoutDetails)
        logger.error('❌  Claude relay error: STREAM_TIMEOUT', timeoutDetails)

        if (!responseStream.headersSent) {
          responseStream.writeHead(504, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive'
          })
        }
        if (!responseStream.destroyed) {
          // 发送 SSE 错误事件
          responseStream.write('event: error\n')
          responseStream.write(
            `data: ${JSON.stringify({
              error: 'Request timeout',
              code: 'TIMEOUT',
              upstream: baseUrl,
              duration: Date.now() - requestStartTime,
              timestamp: new Date().toISOString()
            })}\n\n`
          )
          responseStream.end()
        }
        reject(new Error('Request timeout'))
      })

      // 处理客户端断开连接
      responseStream.on('close', () => {
        logger.debug('[调试] 客户端已断开，清理流')
        if (!req.destroyed) {
          req.destroy()
        }
      })

      // 写入请求体
      req.write(JSON.stringify(body))
      req.end()
    })
  }

  // 🌊 发送流式请求到Claude API
  async _makeClaudeStreamRequest(
    body,
    accessToken,
    proxyAgent,
    clientHeaders,
    responseStream,
    requestOptions = {}
  ) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.claudeApiUrl)

      // 获取过滤后的客户端 headers
      const filteredHeaders = this._filterClientHeaders(clientHeaders)

      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'anthropic-version': this.apiVersion,
          ...filteredHeaders
        },
        agent: proxyAgent,
        timeout: config.proxy.timeout
      }

      // 如果客户端没有提供 User-Agent，使用默认值
      if (!filteredHeaders['User-Agent'] && !filteredHeaders['user-agent']) {
        options.headers['User-Agent'] = 'claude-cli/1.0.53 (external, cli)'
      }

      // 使用自定义的 betaHeader 或默认值
      const betaHeader =
        requestOptions?.betaHeader !== undefined ? requestOptions.betaHeader : this.betaHeader
      if (betaHeader) {
        options.headers['anthropic-beta'] = betaHeader
      }

      const req = https.request(options, (res) => {
        // 设置响应头
        responseStream.statusCode = res.statusCode
        Object.keys(res.headers).forEach((key) => {
          responseStream.setHeader(key, res.headers[key])
        })

        // 管道响应数据
        res.pipe(responseStream)

        res.on('end', () => {
          logger.debug('[调试] Claude 流响应完成')
          resolve()
        })
      })

      req.on('error', (error) => {
        logger.error('[错误] Claude 流式请求错误：', error.message, {
          code: error.code,
          errno: error.errno,
          syscall: error.syscall
        })

        // 根据错误类型提供更具体的错误信息
        let errorMessage = 'Upstream request failed'
        let statusCode = 500
        if (error.code === 'ECONNRESET') {
          errorMessage = 'Connection reset by Claude API server'
          statusCode = 502
        } else if (error.code === 'ENOTFOUND') {
          errorMessage = 'Unable to resolve Claude API hostname'
          statusCode = 502
        } else if (error.code === 'ECONNREFUSED') {
          errorMessage = 'Connection refused by Claude API server'
          statusCode = 502
        } else if (error.code === 'ETIMEDOUT') {
          errorMessage = 'Connection timed out to Claude API server'
          statusCode = 504
        }

        if (!responseStream.headersSent) {
          responseStream.writeHead(statusCode, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive'
          })
        }

        if (!responseStream.destroyed) {
          // 发送 SSE 错误事件
          responseStream.write('event: error\n')
          responseStream.write(
            `data: ${JSON.stringify({
              error: errorMessage,
              code: error.code,
              timestamp: new Date().toISOString()
            })}\n\n`
          )
          responseStream.end()
        }
        reject(error)
      })

      req.on('timeout', () => {
        req.destroy()
        logger.error('[错误] Claude 流式请求超时')
        if (!responseStream.headersSent) {
          responseStream.writeHead(504, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive'
          })
        }
        if (!responseStream.destroyed) {
          // 发送 SSE 错误事件
          responseStream.write('event: error\n')
          responseStream.write(
            `data: ${JSON.stringify({
              error: 'Request timeout',
              code: 'TIMEOUT',
              timestamp: new Date().toISOString()
            })}\n\n`
          )
          responseStream.end()
        }
        reject(new Error('Request timeout'))
      })

      // 处理客户端断开连接
      responseStream.on('close', () => {
        logger.debug('[调试] 客户端已断开，清理流')
        if (!req.destroyed) {
          req.destroy()
        }
      })

      // 写入请求体
      req.write(JSON.stringify(body))
      req.end()
    })
  }

  // 🔄 重试逻辑
  async _retryRequest(requestFunc, maxRetries = 3) {
    let lastError

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await requestFunc()
      } catch (error) {
        lastError = error

        if (i < maxRetries - 1) {
          const delay = Math.pow(2, i) * 1000 // 指数退避
          logger.warn(`[重试] 第 ${i + 1}/${maxRetries} 次重试，延迟 ${delay}ms：${error.message}`)
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError
  }

  // 🔐 记录401未授权错误
  async recordUnauthorizedError(accountId) {
    try {
      const key = `claude_account:${accountId}:401_errors`
      const redis = require('../models/redis')

      // 增加错误计数，设置5分钟过期时间
      await redis.client.incr(key)
      await redis.client.expire(key, 300) // 5分钟

      logger.info(`[信息] 记录 401 错误 - 账户 ${accountId}`)
    } catch (error) {
      logger.error(`[错误] 记录 401 错误失败 - 账户 ${accountId}：`, error)
    }
  }

  // 🔍 获取401错误计数
  async getUnauthorizedErrorCount(accountId) {
    try {
      const key = `claude_account:${accountId}:401_errors`
      const redis = require('../models/redis')

      const count = await redis.client.get(key)
      return parseInt(count) || 0
    } catch (error) {
      logger.error(`[错误] 获取 401 错误计数失败 - 账户 ${accountId}：`, error)
      return 0
    }
  }

  // 🧹 清除401错误计数
  async clearUnauthorizedErrors(accountId) {
    try {
      const key = `claude_account:${accountId}:401_errors`
      const redis = require('../models/redis')

      await redis.client.del(key)
      logger.info(`[成功] 清除 401 错误计数 - 账户 ${accountId}`)
    } catch (error) {
      logger.error(`[错误] 清除 401 错误计数失败 - 账户 ${accountId}：`, error)
    }
  }

  // 🎯 健康检查
  async healthCheck() {
    try {
      const accounts = await claudeAccountService.getAllAccounts()
      const activeAccounts = accounts.filter((acc) => acc.isActive && acc.status === 'active')

      return {
        healthy: activeAccounts.length > 0,
        activeAccounts: activeAccounts.length,
        totalAccounts: accounts.length,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      logger.error('[错误] 健康检查失败：', error)
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }

  // 🏷️ 错误分类（与智能限流服务保持一致）
  _categorizeError(errorInfo) {
    const error = errorInfo.error || errorInfo.message || ''
    const statusCode = errorInfo.statusCode || errorInfo.status

    if (statusCode === 429 || error.includes('rate limit')) {
      return 'rate_limit'
    } else if (statusCode === 401 || error.includes('unauthorized') || error.includes('token')) {
      return 'authentication'
    } else if (statusCode >= 500 || error.includes('server error') || error.includes('internal')) {
      return 'server_error'
    } else if (
      error.includes('network') ||
      error.includes('timeout') ||
      error.includes('connection')
    ) {
      return 'network_error'
    } else if (statusCode >= 400 && statusCode < 500) {
      return 'client_error'
    } else {
      return 'unknown'
    }
  }
}

module.exports = new ClaudeRelayService()
