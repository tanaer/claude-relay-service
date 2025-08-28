const http = require('http')
const https = require('https')
const logger = require('./logger')

/**
 * 连接池管理器 - 优化HTTP/HTTPS连接复用
 */
class ConnectionPoolManager {
  constructor() {
    // HTTP Agent配置
    this.httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 100, // 增加最大连接数
      maxFreeSockets: 20, // 增加空闲连接数
      timeout: 60000, // 60秒超时
      scheduling: 'fifo' // 先进先出调度
    })

    // HTTPS Agent配置
    this.httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 100, // 增加最大连接数
      maxFreeSockets: 20, // 增加空闲连接数
      timeout: 60000, // 60秒超时
      scheduling: 'fifo', // 先进先出调度
      rejectUnauthorized: process.env.NODE_ENV === 'production'
    })

    // 监控连接池状态
    this.startMonitoring()
  }

  /**
   * 获取HTTP Agent
   */
  getHttpAgent() {
    return this.httpAgent
  }

  /**
   * 获取HTTPS Agent
   */
  getHttpsAgent() {
    return this.httpsAgent
  }

  /**
   * 获取适合的Agent
   * @param {string} url - 请求URL
   */
  getAgent(url) {
    return url.startsWith('https') ? this.httpsAgent : this.httpAgent
  }

  /**
   * 监控连接池状态
   */
  startMonitoring() {
    setInterval(() => {
      const httpStatus = this.getAgentStatus(this.httpAgent)
      const httpsStatus = this.getAgentStatus(this.httpsAgent)

      if (httpStatus.sockets > 50 || httpsStatus.sockets > 50) {
        logger.warn('⚠️ High connection pool usage detected', {
          http: httpStatus,
          https: httpsStatus
        })
      }
    }, 30000) // 每30秒检查一次
  }

  /**
   * 获取Agent状态
   * @param {Agent} agent - HTTP/HTTPS Agent
   */
  getAgentStatus(agent) {
    const sockets = Object.keys(agent.sockets).reduce(
      (sum, key) => sum + (agent.sockets[key]?.length || 0),
      0
    )

    const freeSockets = Object.keys(agent.freeSockets).reduce(
      (sum, key) => sum + (agent.freeSockets[key]?.length || 0),
      0
    )

    const requests = Object.keys(agent.requests).reduce(
      (sum, key) => sum + (agent.requests[key]?.length || 0),
      0
    )

    // 按主机统计连接
    const hostStats = {}
    Object.keys(agent.sockets).forEach((key) => {
      const connections = agent.sockets[key]?.length || 0
      if (connections > 0) {
        hostStats[key] = {
          active: connections,
          free: agent.freeSockets[key]?.length || 0
        }
      }
    })

    return {
      sockets,
      freeSockets,
      requests,
      totalConnections: sockets + freeSockets,
      hostStats
    }
  }

  /**
   * 获取完整的连接池统计信息
   */
  getPoolStats() {
    const httpStatus = this.getAgentStatus(this.httpAgent)
    const httpsStatus = this.getAgentStatus(this.httpsAgent)

    return {
      http: {
        ...httpStatus,
        maxSockets: this.httpAgent.maxSockets,
        maxFreeSockets: this.httpAgent.maxFreeSockets,
        timeout: this.httpAgent.timeout
      },
      https: {
        ...httpsStatus,
        maxSockets: this.httpsAgent.maxSockets,
        maxFreeSockets: this.httpsAgent.maxFreeSockets,
        timeout: this.httpsAgent.timeout
      },
      total: {
        activeSockets: httpStatus.sockets + httpsStatus.sockets,
        freeSockets: httpStatus.freeSockets + httpsStatus.freeSockets,
        pendingRequests: httpStatus.requests + httpsStatus.requests,
        totalConnections: httpStatus.totalConnections + httpsStatus.totalConnections
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 清理空闲连接
   */
  cleanup() {
    logger.info('🧹 Cleaning up connection pools')

    // 销毁所有空闲连接
    Object.keys(this.httpAgent.freeSockets).forEach((key) => {
      this.httpAgent.freeSockets[key].forEach((socket) => {
        socket.destroy()
      })
    })

    Object.keys(this.httpsAgent.freeSockets).forEach((key) => {
      this.httpsAgent.freeSockets[key].forEach((socket) => {
        socket.destroy()
      })
    })
  }

  /**
   * 优雅关闭
   */
  async gracefulShutdown() {
    logger.info('🛑 Shutting down connection pools gracefully')

    // 停止接受新连接
    this.httpAgent.destroy()
    this.httpsAgent.destroy()

    // 等待现有请求完成
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
}

// 导出单例
module.exports = new ConnectionPoolManager()
