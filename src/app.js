const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const path = require('path')
const fs = require('fs')
const bcrypt = require('bcryptjs')

const config = require('../config/config')
const logger = require('./utils/logger')
const redis = require('./models/redis')
const pricingService = require('./services/pricingService')

// Import routes
const apiRoutes = require('./routes/api')
const adminRoutes = require('./routes/admin')
const webRoutes = require('./routes/web')
const apiStatsRoutes = require('./routes/apiStats')
const geminiRoutes = require('./routes/geminiRoutes')
const openaiGeminiRoutes = require('./routes/openaiGeminiRoutes')
const openaiClaudeRoutes = require('./routes/openaiClaudeRoutes')
const openaiRoutes = require('./routes/openaiRoutes')
const adminPricingRoutes = require('./routes/adminPricingRoutes')

// Import middleware
const {
  corsMiddleware,
  requestLogger,
  securityMiddleware,
  errorHandler,
  globalRateLimit,
  requestSizeLimit
} = require('./middleware/auth')

class Application {
  constructor() {
    this.app = express()
    this.server = null
  }

  async initialize() {
    try {
      // 🔗 连接Redis
      logger.info('🔄 Connecting to Redis...')
      await redis.connect()
      logger.success('✅ Redis connected successfully')

      // 🚦 初始化智能限流（依赖已连接的 Redis）
      try {
        const smartRateLimitService = require('./services/smartRateLimitService')
        await smartRateLimitService.initialize()
        logger.success('✅ Smart rate limit service initialized')
      } catch (e) {
        logger.error('❌ Failed to initialize smart rate limit service:', e)
      }

      // 💰 初始化价格服务
      logger.info('🔄 Initializing pricing service...')
      await pricingService.initialize()

      // 🔧 初始化管理员凭据
      logger.info('🔄 Initializing admin credentials...')
      await this.initializeAdmin()

      // 💰 初始化费用数据
      logger.info('💰 Checking cost data initialization...')
      const costInitService = require('./services/costInitService')
      const needsInit = await costInitService.needsInitialization()
      if (needsInit) {
        logger.info('💰 Initializing cost data for all API Keys...')
        const result = await costInitService.initializeAllCosts()
        logger.info(
          `💰 Cost initialization completed: ${result.processed} processed, ${result.errors} errors`
        )
      }

      // 🕐 初始化Claude账户会话窗口
      logger.info('🕐 Initializing Claude account session windows...')
      const claudeAccountService = require('./services/claudeAccountService')
      await claudeAccountService.initializeSessionWindows()

      // 超早期拦截 /admin-next/ 请求 - 在所有中间件之前
      this.app.use((req, res, next) => {
        if (req.path === '/admin-next/' && req.method === 'GET') {
          logger.warn('🚨 INTERCEPTING /admin-next/ request at the very beginning!')
          const adminSpaPath = path.join(__dirname, '..', 'web', 'admin-spa', 'dist')
          const indexPath = path.join(adminSpaPath, 'index.html')

          if (fs.existsSync(indexPath)) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
            return res.sendFile(indexPath)
          } else {
            logger.error('❌ index.html not found at:', indexPath)
            return res.status(404).send('index.html not found')
          }
        }
        next()
      })

      // 🛡️ 安全中间件
      this.app.use(
        helmet({
          contentSecurityPolicy: false, // 允许内联样式和脚本
          crossOriginEmbedderPolicy: false
        })
      )

      // 🌐 CORS
      if (config.web.enableCors) {
        this.app.use(cors())
      } else {
        this.app.use(corsMiddleware)
      }

      // 📦 压缩 - 排除流式响应（SSE）
      this.app.use(
        compression({
          filter: (req, res) => {
            // 不压缩 Server-Sent Events
            if (res.getHeader('Content-Type') === 'text/event-stream') {
              return false
            }
            // 使用默认的压缩判断
            return compression.filter(req, res)
          }
        })
      )

      // 🚦 全局速率限制（仅在生产环境启用）
      if (process.env.NODE_ENV === 'production') {
        this.app.use(globalRateLimit)
      }

      // 📏 请求大小限制
      this.app.use(requestSizeLimit)

      // 📝 请求日志（使用自定义logger而不是morgan）
      this.app.use(requestLogger)

      // 🔧 基础中间件
      this.app.use(
        express.json({
          limit: '10mb',
          verify: (req, res, buf, encoding) => {
            // 验证JSON格式
            if (buf && buf.length && !buf.toString(encoding || 'utf8').trim()) {
              throw new Error('Invalid JSON: empty body')
            }
          }
        })
      )
      this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))
      this.app.use(securityMiddleware)

      // 🎯 信任代理
      if (config.server.trustProxy) {
        this.app.set('trust proxy', 1)
      }

      // 调试中间件 - 拦截所有 /admin-next 请求
      this.app.use((req, res, next) => {
        if (req.path.startsWith('/admin-next')) {
          logger.info(
            `🔍 DEBUG: Incoming request - method: ${req.method}, path: ${req.path}, originalUrl: ${req.originalUrl}`
          )
        }
        next()
      })

      // 🎨 新版管理界面静态文件服务（必须在其他路由之前）
      const adminSpaPath = path.join(__dirname, '..', 'web', 'admin-spa', 'dist')
      if (fs.existsSync(adminSpaPath)) {
        // 处理不带斜杠的路径，重定向到带斜杠的路径
        this.app.get('/admin-next', (req, res) => {
          res.redirect(301, '/admin-next/')
        })

        // 使用 all 方法确保捕获所有 HTTP 方法
        this.app.all('/admin-next/', (req, res) => {
          logger.info('🎯 HIT: /admin-next/ route handler triggered!')
          logger.info(`Method: ${req.method}, Path: ${req.path}, URL: ${req.url}`)

          if (req.method !== 'GET' && req.method !== 'HEAD') {
            return res.status(405).send('Method Not Allowed')
          }

          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
          res.sendFile(path.join(adminSpaPath, 'index.html'))
        })

        // 处理所有其他 /admin-next/* 路径（但排除根路径）
        this.app.get('/admin-next/*', (req, res) => {
          // 如果是根路径，跳过（应该由上面的路由处理）
          if (req.path === '/admin-next/') {
            logger.error('❌ ERROR: /admin-next/ should not reach here!')
            return res.status(500).send('Route configuration error')
          }

          const requestPath = req.path.replace('/admin-next/', '')

          // 安全检查
          if (
            requestPath.includes('..') ||
            requestPath.includes('//') ||
            requestPath.includes('\\')
          ) {
            return res.status(400).json({ error: 'Invalid path' })
          }

          // 检查是否为静态资源
          const filePath = path.join(adminSpaPath, requestPath)

          // 如果文件存在且是静态资源
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            // 设置缓存头
            if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
            } else if (filePath.endsWith('.html')) {
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
            }
            return res.sendFile(filePath)
          }

          // 如果是静态资源但文件不存在
          if (requestPath.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf)$/i)) {
            return res.status(404).send('Not found')
          }

          // 其他所有路径返回 index.html（SPA 路由）
          res.sendFile(path.join(adminSpaPath, 'index.html'))
        })

        logger.info('✅ Admin SPA (next) static files mounted at /admin-next/')
      } else {
        logger.warn('⚠️ Admin SPA dist directory not found, skipping /admin-next route')
      }

      // 🎫 用户兑换码功能 (直接挂载到根路径，用户友好)
      this.app.post('/redeem', async (req, res) => {
        try {
          const redemptionCodeService = require('./services/redemptionCodeService')

          // 统一清洗兑换码：去除各种空白/零宽字符，规范连字符，并仅保留允许字符
          const sanitizeRedemptionCode = (raw) => {
            if (typeof raw !== 'string') {
              return ''
            }
            const normalized = raw.normalize('NFKC')
            const withoutSpaces = normalized.replace(
              /[\s\u00A0\u2000-\u200A\u202F\u205F\u3000\u200B-\u200D\u2060\uFEFF]/g,
              ''
            )
            const unifiedDash = withoutSpaces.replace(/[\u2010-\u2015\u2212\uFE63\uFF0D]/g, '-')
            const allowedOnly = unifiedDash.replace(/[^A-Za-z0-9-]/g, '')
            return allowedOnly.trim()
          }

          const rawCode = req.body?.code
          const code = sanitizeRedemptionCode(rawCode)

          if (!code) {
            return res.status(400).json({
              success: false,
              error: '兑换码不能为空'
            })
          }

          // 如果兑换码是纯数字 返回错误“这是拼多多的核销码，请发给拼多多店铺客服，客服会给您兑换码”
          if (/^\d+$/.test(code)) {
            return res.status(400).json({
              success: false,
              error: '这是拼多多的核销码，请发给拼多多店铺客服，客服会给您兑换码'
            })
          }

          const result = await redemptionCodeService.redeemCode(code)

          if (result.success) {
            try {
              const baseUrl = `${req.protocol}://${req.get('host')}`
              const downloadUrl = `${baseUrl}/download/muskapi_com_setup.cmd?apiKey=${encodeURIComponent(
                result.data.apiKey
              )}`
              return res.json({
                success: true,
                message: result.message,
                data: { ...result.data, downloadUrl },
                targetUrl: 'https://free.yourapi.cn/'
              })
            } catch (e) {
              return res.json({
                success: true,
                message: result.message,
                data: result.data,
                targetUrl: 'https://free.yourapi.cn/'
              })
            }
          } else {
            return res.status(400).json({
              success: false,
              error: result.error
            })
          }
        } catch (error) {
          logger.error('❌ Redemption failed:', error)
          return res.status(500).json({
            success: false,
            error: '兑换失败，请稍后重试'
          })
        }
      })

      // 📥 动态生成并下载安装脚本（muskapi_com_setup.cmd），将兑换得到的 API Key 注入脚本
      this.app.get('/download/muskapi_com_setup.cmd', async (req, res) => {
        try {
          const { apiKey = '' } = req.query

          const templatePath = path.join(
            __dirname,
            '..',
            'resources',
            'scripts',
            'muskapi_com_setup.cmd'
          )

          if (!fs.existsSync(templatePath)) {
            return res.status(404).send('muskapi_com_setup.cmd template not found')
          }

          let content = fs.readFileSync(templatePath, 'utf8')

          // 对 CMD 变量赋值做基础转义：百分号与感叹号
          // 注意：令牌一般为 cr_ 开头的字母数字，不含特殊字符，此处为防御性处理
          const safeApiKey = String(apiKey).replace(/%/g, '%%').replace(/!/g, '^^!')
          content = content.replace(/__API_TOKEN__/g, safeApiKey)

          res.setHeader('Content-Type', 'application/octet-stream')
          res.setHeader('Content-Disposition', 'attachment; filename="muskapi_com_setup.cmd"')
          return res.status(200).send(content)
        } catch (error) {
          logger.error('❌ Failed to generate muskapi_com_setup.cmd:', error)
          return res.status(500).send('Failed to generate setup script')
        }
      })

      // 📥 PowerShell 在线安装脚本（支持 irm 直接执行，并可注入 API Key/BaseUrl）
      this.app.get('/install.ps1', async (req, res) => {
        try {
          const { apiKey = '', baseUrl = '' } = req.query

          const templatePath = path.join(__dirname, '..', 'resources', 'scripts', 'install.ps1')

          if (!fs.existsSync(templatePath)) {
            return res.status(404).send('install.ps1 template not found')
          }

          let content = fs.readFileSync(templatePath, 'utf8')

          const safeApiKey = String(apiKey).replace(/`/g, '``')
          const defaultBase = 'https://ccapi.muskapi.com/api/'
          const selectedBase = baseUrl && typeof baseUrl === 'string' ? baseUrl : defaultBase
          const safeBaseUrl = String(selectedBase).replace(/`/g, '``')

          content = content
            .replace(/__API_TOKEN__/g, safeApiKey)
            .replace(/__BASE_URL__/g, safeBaseUrl)

          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
          res.setHeader('Pragma', 'no-cache')
          res.setHeader('Expires', '0')
          return res.status(200).send(content)
        } catch (error) {
          logger.error('❌ Failed to generate install.ps1:', error)
          return res.status(500).send('Failed to generate powershell install script')
        }
      })

      // 📥 Bash 安装脚本（支持通过 curl 下载，并可注入 API Key/BaseUrl）
      this.app.get('/install.sh', async (req, res) => {
        try {
          const { apiKey = '', baseUrl = '' } = req.query

          const templatePath = path.join(__dirname, '..', 'resources', 'scripts', 'install.sh')

          if (!fs.existsSync(templatePath)) {
            return res.status(404).send('install.sh template not found')
          }

          let content = fs.readFileSync(templatePath, 'utf8')

          // 若提供 apiKey/baseUrl，则在 shebang 后注入对应环境变量，兼容脚本内读取逻辑
          const lines = content.split('\n')
          const injections = []
          if (apiKey) {
            const safeKey = String(apiKey)
              .replace(/\\/g, '\\\\')
              .replace(/\$/g, '\\$')
              .replace(/"/g, '\\"')
            injections.push(`export CLAUDE_API_KEY="${safeKey}"`)
          }
          if (baseUrl) {
            const safeUrl = String(baseUrl)
              .replace(/\\/g, '\\\\')
              .replace(/\$/g, '\\$')
              .replace(/"/g, '\\"')
            injections.push(`export CLAUDE_API_URL="${safeUrl}"`)
          }

          if (injections.length > 0) {
            // 在 shebang 后插入注入行，并带上注释
            const header = [
              '',
              '# --- injected by server: begin ---',
              ...injections,
              '# --- injected by server: end ---',
              ''
            ]
            if (lines[0].startsWith('#!')) {
              lines.splice(1, 0, ...header)
            } else {
              lines.splice(0, 0, ...header)
            }
            content = lines.join('\n')
          }

          res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8')
          res.setHeader('Cache-Control', 'no-cache')
          return res.status(200).send(content)
        } catch (error) {
          logger.error('❌ Failed to generate install.sh:', error)
          return res.status(500).send('Failed to generate bash install script')
        }
      })

      // 🛣️ 路由
      this.app.use('/api', apiRoutes)
      this.app.use('/claude', apiRoutes) // /claude 路由别名，与 /api 功能相同
      this.app.use('/admin', adminRoutes)
      this.app.use('/admin/pricing', adminPricingRoutes)
      // 使用 web 路由（包含 auth 和页面重定向）
      this.app.use('/web', webRoutes)
      this.app.use('/apiStats', apiStatsRoutes)
      this.app.use('/gemini', geminiRoutes)
      this.app.use('/openai/gemini', openaiGeminiRoutes)
      this.app.use('/openai/claude', openaiClaudeRoutes)
      this.app.use('/openai', openaiRoutes)

      // 🏠 根路径重定向到新版管理界面
      this.app.get('/', (req, res) => {
        res.redirect('/admin-next/api-stats')
      })

      // 🏥 增强的健康检查端点
      this.app.get('/health', async (req, res) => {
        try {
          const timer = logger.timer('health-check')

          // 检查各个组件健康状态
          const [redisHealth, loggerHealth] = await Promise.all([
            this.checkRedisHealth(),
            this.checkLoggerHealth()
          ])

          const memory = process.memoryUsage()

          // 获取版本号：优先使用环境变量，其次VERSION文件，再次package.json，最后使用默认值
          let version = process.env.APP_VERSION || process.env.VERSION
          if (!version) {
            try {
              const versionFile = path.join(__dirname, '..', 'VERSION')
              if (fs.existsSync(versionFile)) {
                version = fs.readFileSync(versionFile, 'utf8').trim()
              }
            } catch (error) {
              // 忽略错误，继续尝试其他方式
            }
          }
          if (!version) {
            try {
              const { version: packageVersion } = require('../package.json')
              version = packageVersion
            } catch (error) {
              version = '1.0.0'
            }
          }

          const health = {
            status: 'healthy',
            service: 'claude-relay-service',
            version,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
              used: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
              total: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`,
              external: `${Math.round(memory.external / 1024 / 1024)}MB`
            },
            components: {
              redis: redisHealth,
              logger: loggerHealth
            },
            stats: logger.getStats()
          }

          timer.end('completed')
          res.json(health)
        } catch (error) {
          logger.error('❌ Health check failed:', { error: error.message, stack: error.stack })
          res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
          })
        }
      })

      // 📊 指标端点
      this.app.get('/metrics', async (req, res) => {
        try {
          const stats = await redis.getSystemStats()
          const metrics = {
            ...stats,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
          }

          res.json(metrics)
        } catch (error) {
          logger.error('❌ Metrics collection failed:', error)
          res.status(500).json({ error: 'Failed to collect metrics' })
        }
      })

      // 🚫 404 处理
      this.app.use('*', (req, res) => {
        res.status(404).json({
          error: 'Not Found',
          message: `Route ${req.originalUrl} not found`,
          timestamp: new Date().toISOString()
        })
      })

      // 🚨 错误处理
      this.app.use(errorHandler)

      logger.success('✅ Application initialized successfully')
    } catch (error) {
      logger.error('💥 Application initialization failed:', error)
      throw error
    }
  }

  // 🔧 初始化管理员凭据（总是从 init.json 加载，确保数据一致性）
  async initializeAdmin() {
    try {
      const initFilePath = path.join(__dirname, '..', 'data', 'init.json')

      if (!fs.existsSync(initFilePath)) {
        logger.warn('⚠️ No admin credentials found. Please run npm run setup first.')
        return
      }

      // 从 init.json 读取管理员凭据（作为唯一真实数据源）
      const initData = JSON.parse(fs.readFileSync(initFilePath, 'utf8'))

      // 将明文密码哈希化
      const saltRounds = 10
      const passwordHash = await bcrypt.hash(initData.adminPassword, saltRounds)

      // 存储到Redis（每次启动都覆盖，确保与 init.json 同步）
      const adminCredentials = {
        username: initData.adminUsername,
        passwordHash,
        createdAt: initData.initializedAt || new Date().toISOString(),
        lastLogin: null,
        updatedAt: initData.updatedAt || null
      }

      await redis.setSession('admin_credentials', adminCredentials)

      logger.success('✅ Admin credentials loaded from init.json (single source of truth)')
      logger.info(`📋 Admin username: ${adminCredentials.username}`)
    } catch (error) {
      logger.error('❌ Failed to initialize admin credentials:', {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  // 🔍 Redis健康检查
  async checkRedisHealth() {
    try {
      const start = Date.now()
      await redis.getClient().ping()
      const latency = Date.now() - start

      return {
        status: 'healthy',
        connected: redis.isConnected,
        latency: `${latency}ms`
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message
      }
    }
  }

  // 📝 Logger健康检查
  async checkLoggerHealth() {
    try {
      const health = logger.healthCheck()
      return {
        status: health.healthy ? 'healthy' : 'unhealthy',
        ...health
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      }
    }
  }

  async start() {
    try {
      await this.initialize()

      this.server = this.app.listen(config.server.port, config.server.host, () => {
        logger.start(
          `🚀 Claude Relay Service started on ${config.server.host}:${config.server.port}`
        )
        logger.info(
          `🌐 Web interface: http://${config.server.host}:${config.server.port}/admin-next/api-stats`
        )
        logger.info(
          `🔗 API endpoint: http://${config.server.host}:${config.server.port}/api/v1/messages`
        )
        logger.info(`⚙️  Admin API: http://${config.server.host}:${config.server.port}/admin`)
        logger.info(`🏥 Health check: http://${config.server.host}:${config.server.port}/health`)
        logger.info(`📊 Metrics: http://${config.server.host}:${config.server.port}/metrics`)
      })

      const serverTimeout = 600000 // 默认10分钟
      this.server.timeout = serverTimeout
      this.server.keepAliveTimeout = serverTimeout + 5000 // keepAlive 稍长一点
      logger.info(`⏱️  Server timeout set to ${serverTimeout}ms (${serverTimeout / 1000}s)`)

      // 🔄 定期清理任务
      this.startCleanupTasks()

      // 🎯 启动策略调度服务
      this.startPolicyScheduler()

      // 🛑 优雅关闭
      this.setupGracefulShutdown()
    } catch (error) {
      logger.error('💥 Failed to start server:', error)
      process.exit(1)
    }
  }

  startCleanupTasks() {
    // 🧹 每小时清理一次过期数据
    setInterval(async () => {
      try {
        logger.info('🧹 Starting scheduled cleanup...')

        const apiKeyService = require('./services/apiKeyService')
        const claudeAccountService = require('./services/claudeAccountService')

        const [expiredKeys, errorAccounts] = await Promise.all([
          apiKeyService.cleanupExpiredKeys(),
          claudeAccountService.cleanupErrorAccounts()
        ])

        await redis.cleanup()

        logger.success(
          `🧹 Cleanup completed: ${expiredKeys} expired keys, ${errorAccounts} error accounts reset`
        )
      } catch (error) {
        logger.error('❌ Cleanup task failed:', error)
      }
    }, config.system.cleanupInterval)

    logger.info(
      `🔄 Cleanup tasks scheduled every ${config.system.cleanupInterval / 1000 / 60} minutes`
    )
  }

  startPolicyScheduler() {
    try {
      const policySchedulerService = require('./services/policySchedulerService')
      policySchedulerService.start()
      logger.success('🎯 Policy scheduler service started successfully')
    } catch (error) {
      logger.error('❌ Failed to start policy scheduler service:', error)
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`🛑 Received ${signal}, starting graceful shutdown...`)

      if (this.server) {
        this.server.close(async () => {
          logger.info('🚪 HTTP server closed')

          // 清理 pricing service 的文件监听器
          try {
            pricingService.cleanup()
            logger.info('💰 Pricing service cleaned up')
          } catch (error) {
            logger.error('❌ Error cleaning up pricing service:', error)
          }

          // 停止策略调度服务
          try {
            const policySchedulerService = require('./services/policySchedulerService')
            policySchedulerService.stop()
            logger.info('🎯 Policy scheduler service stopped')
          } catch (error) {
            logger.error('❌ Error stopping policy scheduler service:', error)
          }

          try {
            await redis.disconnect()
            logger.info('👋 Redis disconnected')
          } catch (error) {
            logger.error('❌ Error disconnecting Redis:', error)
          }

          logger.success('✅ Graceful shutdown completed')
          process.exit(0)
        })

        // 强制关闭超时
        setTimeout(() => {
          logger.warn('⚠️ Forced shutdown due to timeout')
          process.exit(1)
        }, 10000)
      } else {
        process.exit(0)
      }
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

    // 处理未捕获异常
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught exception:', error)
      shutdown('uncaughtException')
    })

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled rejection at:', promise, 'reason:', reason)
      shutdown('unhandledRejection')
    })
  }
}

// 启动应用
if (require.main === module) {
  const app = new Application()
  app.start().catch((error) => {
    logger.error('💥 Application startup failed:', error)
    process.exit(1)
  })
}

module.exports = Application
