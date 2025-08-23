const logger = require('../utils/logger')

/**
 * API响应格式化中间件
 * 确保所有API响应格式的一致性
 */

/**
 * 标准成功响应格式化
 */
function successResponse(data, message = null, meta = null) {
  const response = {
    success: true,
    data
  }

  if (message) {
    response.message = message
  }

  if (meta) {
    response.meta = meta
  }

  return response
}

/**
 * 标准错误响应格式化
 */
function errorResponse(message, error = null, details = null) {
  const response = {
    success: false,
    message
  }

  if (error) {
    response.error = error
  }

  if (details) {
    response.details = details
  }

  return response
}

/**
 * 分页响应格式化
 */
function paginatedResponse(data, pagination) {
  return {
    success: true,
    data,
    pagination: {
      page: pagination.page || 1,
      limit: pagination.limit || 20,
      total: pagination.total || 0,
      pages: Math.ceil((pagination.total || 0) / (pagination.limit || 20))
    }
  }
}

/**
 * 验证结果响应格式化
 */
function validationResponse(isValid, errors = [], data = null) {
  const response = {
    success: true,
    data: {
      valid: isValid,
      errors: Array.isArray(errors) ? errors : [errors].filter(Boolean)
    }
  }

  if (data) {
    response.data.result = data
  }

  return response
}

/**
 * 统计数据响应格式化
 */
function statsResponse(stats, period = null) {
  const response = {
    success: true,
    data: stats
  }

  if (period) {
    response.meta = { period }
  }

  return response
}

/**
 * 错误处理中间件
 * 统一处理API错误
 */
function errorHandler(err, req, res, _next) {
  // 日志记录
  logger.error(`API Error ${req.method} ${req.originalUrl}:`, {
    error: err.message,
    stack: err.stack,
    body: req.body,
    query: req.query,
    params: req.params
  })

  // 根据错误类型返回相应的状态码
  let statusCode = 500
  let message = '内部服务器错误'

  if (err.name === 'ValidationError') {
    statusCode = 400
    message = '数据验证失败'
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401
    message = '未授权访问'
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403
    message = '权限不足'
  } else if (err.name === 'NotFoundError') {
    statusCode = 404
    message = '资源不存在'
  } else if (err.name === 'ConflictError') {
    statusCode = 409
    message = '资源冲突'
  } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
    statusCode = 503
    message = '服务暂时不可用'
  }

  res.status(statusCode).json(errorResponse(message, err.message))
}

/**
 * 请求日志中间件
 * 记录API请求信息
 */
function requestLogger(req, res, next) {
  const start = Date.now()

  // 记录请求
  logger.info(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    admin: req.admin?.username
  })

  // 监听响应结束
  res.on('finish', () => {
    const duration = Date.now() - start
    const level = res.statusCode >= 400 ? 'error' : 'info'

    logger[level](`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`)
  })

  next()
}

/**
 * 响应时间中间件
 * 添加X-Response-Time头
 */
function responseTime(req, res, next) {
  const start = Date.now()

  res.on('finish', () => {
    const duration = Date.now() - start
    res.setHeader('X-Response-Time', `${duration}ms`)
  })

  next()
}

/**
 * CORS中间件
 * 处理跨域请求
 */
function cors(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  )

  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
  } else {
    next()
  }
}

/**
 * 请求体大小限制中间件
 */
function bodyLimit(limit = '10mb') {
  return (req, res, next) => {
    if (
      req.headers['content-length'] &&
      parseInt(req.headers['content-length']) > parseFloat(limit) * 1024 * 1024
    ) {
      return res.status(413).json(errorResponse('请求体过大', `最大允许 ${limit}`))
    }
    next()
  }
}

/**
 * 速率限制响应格式化
 */
function rateLimitResponse(req, res) {
  res.status(429).json(
    errorResponse('请求过于频繁', '已达到速率限制', {
      limit: req.rateLimit?.limit,
      remaining: req.rateLimit?.remaining,
      resetTime: req.rateLimit?.resetTime
    })
  )
}

module.exports = {
  // 响应格式化函数
  successResponse,
  errorResponse,
  paginatedResponse,
  validationResponse,
  statsResponse,

  // 中间件函数
  errorHandler,
  requestLogger,
  responseTime,
  cors,
  bodyLimit,
  rateLimitResponse
}
