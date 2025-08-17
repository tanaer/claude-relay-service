const https = require('https')
const { SocksProxyAgent } = require('socks-proxy-agent')
const { HttpsProxyAgent } = require('https-proxy-agent')
const logger = require('../utils/logger')
const config = require('../../config/config')
const claudeConsoleAccountService = require('./claudeConsoleAccountService')

class ClaudeConsoleRelayService {
  constructor() {
    this.apiVersion = config.claude.apiVersion
  }

  _createProxyAgent(proxyConfig) {
    if (!proxyConfig) {
      return null
    }
    try {
      const proxy = typeof proxyConfig === 'string' ? JSON.parse(proxyConfig) : proxyConfig
      if (proxy.type === 'socks5') {
        const auth = proxy.username && proxy.password ? `${proxy.username}:${proxy.password}@` : ''
        const socksUrl = `socks5://${auth}${proxy.host}:${proxy.port}`
        return new SocksProxyAgent(socksUrl)
      }
      if (proxy.type === 'http' || proxy.type === 'https') {
        const auth = proxy.username && proxy.password ? `${proxy.username}:${proxy.password}@` : ''
        const httpUrl = `${proxy.type}://${auth}${proxy.host}:${proxy.port}`
        return new HttpsProxyAgent(httpUrl)
      }
    } catch (error) {
      logger.warn('⚠️ Invalid proxy configuration for console account:', error)
    }
    return null
  }

  _buildUpstreamHeaders(clientHeaders = {}, account = {}) {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${account.apiKey || ''}`,
      'anthropic-version': this.apiVersion
    }

    // 透传客户端部分头，避免冲突
    const passThrough = ['anthropic-beta', 'x-request-id']
    passThrough.forEach((key) => {
      const v =
        clientHeaders[key] || clientHeaders[key.toLowerCase()] || clientHeaders[key.toUpperCase()]
      if (v !== undefined) {
        headers[key] = v
      }
    })

    // SSE避免压缩，便于解析usage
    headers['Accept-Encoding'] = 'identity'

    // User-Agent 优先使用客户端的，否则用账号配置，否则默认
    const userAgent =
      clientHeaders['user-agent'] ||
      clientHeaders['User-Agent'] ||
      account.userAgent ||
      'claude-cli/1.0.71 (external, cli)'
    headers['User-Agent'] = userAgent

    return headers
  }

  _mapRequestedModel(requestBody, account) {
    try {
      const mapping = account.supportedModels
      if (!mapping || (Array.isArray(mapping) && mapping.length === 0)) {
        return requestBody
      }
      const cloned = { ...requestBody }
      if (typeof mapping === 'object' && !Array.isArray(mapping)) {
        // 新格式：映射表
        const target = mapping[cloned.model]
        if (target) {
          cloned.model = target
        }
      } else if (Array.isArray(mapping)) {
        // 旧格式：数组（仅校验存在，不做替换）
        if (mapping.length > 0 && !mapping.includes(cloned.model)) {
          // 不支持则原样返回，由上游报错或调度层已拦截
        }
      }
      return cloned
    } catch (e) {
      return requestBody
    }
  }

  async relayRequest(
    requestBody,
    apiKeyData,
    clientRequest,
    clientResponse,
    clientHeaders,
    accountId
  ) {
    let upstreamReq = null
    try {
      if (!accountId) {
        throw new Error('Missing accountId for Claude Console relay')
      }

      const account = await claudeConsoleAccountService.getAccount(accountId)
      if (!account || account.isActive !== true || account.status !== 'active') {
        return {
          statusCode: 503,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Console account unavailable' }),
          accountId
        }
      }

      const body = this._mapRequestedModel(requestBody, account)
      const headers = this._buildUpstreamHeaders(clientHeaders, account)
      const agent = this._createProxyAgent(account.proxy)

      const url = new URL(account.apiUrl)

      // 客户端断开时中止上游请求
      const handleClientDisconnect = () => {
        if (upstreamReq && !upstreamReq.destroyed) {
          upstreamReq.destroy()
        }
      }
      if (clientRequest) {
        clientRequest.once('close', handleClientDisconnect)
      }
      if (clientResponse) {
        clientResponse.once('close', handleClientDisconnect)
      }

      const response = await new Promise((resolve, reject) => {
        const options = {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + (url.search || ''),
          method: 'POST',
          headers,
          agent,
          timeout: config.proxy.timeout
        }

        const req = https.request(options, (res) => {
          let data = ''
          res.on('data', (chunk) => (data += chunk.toString()))
          res.on('end', () => {
            resolve({ statusCode: res.statusCode || 500, headers: res.headers || {}, body: data })
          })
        })

        upstreamReq = req

        req.on('error', (err) => {
          reject(err)
        })
        req.on('timeout', () => {
          req.destroy(new Error('Request timeout'))
        })

        req.write(JSON.stringify(body))
        req.end()
      })

      if (clientRequest) {
        clientRequest.removeListener('close', handleClientDisconnect)
      }
      if (clientResponse) {
        clientResponse.removeListener('close', handleClientDisconnect)
      }

      return { ...response, accountId }
    } catch (error) {
      logger.error('❌ Claude Console non-stream relay failed:', error)
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Console relay error',
          message: error.message || String(error)
        }),
        accountId
      }
    }
  }

  async relayStreamRequestWithUsageCapture(
    requestBody,
    apiKeyData,
    responseStream,
    clientHeaders,
    usageCallback,
    accountId
  ) {
    try {
      if (!accountId) {
        throw new Error('Missing accountId for Claude Console stream relay')
      }

      const account = await claudeConsoleAccountService.getAccount(accountId)
      if (!account || account.isActive !== true || account.status !== 'active') {
        responseStream.writeHead(503, { 'Content-Type': 'application/json' })
        responseStream.end(JSON.stringify({ error: 'Console account unavailable' }))
        return
      }

      const body = this._mapRequestedModel(requestBody, account)
      const headers = this._buildUpstreamHeaders(clientHeaders, account)
      // SSE相关
      headers.Accept = 'text/event-stream'
      const agent = this._createProxyAgent(account.proxy)

      const url = new URL(account.apiUrl)

      await new Promise((resolve, reject) => {
        const options = {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + (url.search || ''),
          method: 'POST',
          headers,
          agent,
          timeout: config.proxy.timeout
        }

        const req = https.request(options, (res) => {
          if (res.statusCode !== 200) {
            let errorData = ''
            res.on('data', (chunk) => (errorData += chunk.toString()))
            res.on('end', () => {
              try {
                responseStream.writeHead(res.statusCode || 500, {
                  'Content-Type': 'application/json'
                })
              } catch (e) {
                /* ignore writeHead errors when client closed */
                void 0
              }
              responseStream.end(errorData || JSON.stringify({ error: 'Upstream error' }))
              resolve()
            })
            return
          }

          let buffer = ''
          res.on('data', (chunk) => {
            const text = chunk.toString()
            buffer += text

            // 直接转发到客户端
            try {
              responseStream.write(text)
            } catch (e) {
              /* ignore streaming write errors (client may disconnect) */
              void 0
            }

            // 尝试解析完整的SSE事件
            const events = buffer.split('\n\n')
            buffer = events.pop() || ''
            for (const evt of events) {
              const lines = evt.split('\n')
              for (const line of lines) {
                if (!line.startsWith('data:')) {
                  continue
                }
                const jsonStr = line.replace(/^data:\s*/, '')
                try {
                  const payload = JSON.parse(jsonStr)
                  // 查找usage信息
                  if (payload && payload.usage) {
                    usageCallback({ ...payload.usage, accountId })
                  } else if (payload?.type === 'message_stop' && payload?.usage) {
                    usageCallback({ ...payload.usage, accountId })
                  } else if (payload?.type === 'message_delta' && payload?.usage) {
                    usageCallback({ ...payload.usage, accountId })
                  }
                } catch (e) {
                  /* ignore malformed SSE JSON chunk */
                  void 0
                }
              }
            }
          })

          res.on('end', () => {
            // 尾部缓冲可能还包含最后一个事件
            try {
              const lines = buffer.split('\n')
              for (const line of lines) {
                if (!line.startsWith('data:')) {
                  continue
                }
                const jsonStr = line.replace(/^data:\s*/, '')
                try {
                  const payload = JSON.parse(jsonStr)
                  if (payload && payload.usage) {
                    usageCallback({ ...payload.usage, accountId })
                  }
                } catch (e) {
                  /* ignore malformed trailing JSON */
                  void 0
                }
              }
            } catch (e) {
              /* ignore trailing buffer parse errors */
              void 0
            }
            try {
              responseStream.end('\n')
            } catch (e) {
              /* ignore end errors if client already closed */
              void 0
            }
            resolve()
          })
        })

        req.on('error', (err) => {
          reject(err)
        })
        req.on('timeout', () => {
          req.destroy(new Error('Request timeout'))
        })

        req.write(JSON.stringify(body))
        req.end()
      })
    } catch (error) {
      logger.error('❌ Claude Console stream relay failed:', error)
      try {
        responseStream.writeHead(502, { 'Content-Type': 'application/json' })
        responseStream.end(
          JSON.stringify({ error: 'Console relay error', message: error.message || String(error) })
        )
      } catch (e) {
        /* ignore client write errors */
        void 0
      }
    }
  }
}

module.exports = new ClaudeConsoleRelayService()
