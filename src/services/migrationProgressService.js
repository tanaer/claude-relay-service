/**
 * 迁移进度跟踪服务
 *
 * 负责记录和监控迁移进度，提供实时状态更新和性能监控
 * 支持多个迁移任务并发跟踪，WebSocket 实时推送进度
 */

const redis = require('../models/redis')
const { logger } = require('../utils/logger')
const EventEmitter = require('events')

class MigrationProgressService extends EventEmitter {
  constructor() {
    super()
    this.progressChannels = new Map() // 存储进度监听通道
    this.activeMigrations = new Set() // 活跃的迁移任务
  }

  /**
   * 开始跟踪新的迁移任务
   */
  async startTracking(migrationId, options = {}) {
    try {
      const progressData = {
        migrationId,
        status: 'started',
        type: options.type || 'manual',
        startTime: Date.now(),
        endTime: null,
        totalSteps: options.totalSteps || 0,
        currentStep: 0,
        totalRecords: options.totalRecords || 0,
        processedRecords: 0,
        succeededRecords: 0,
        failedRecords: 0,
        batchInfo: {
          totalBatches: 0,
          completedBatches: 0,
          failedBatches: 0,
          currentBatch: 0
        },
        performance: {
          startTime: Date.now(),
          lastUpdateTime: Date.now(),
          recordsPerSecond: 0,
          estimatedTimeRemaining: 0,
          avgProcessingTime: 0
        },
        errors: [],
        metadata: options.metadata || {}
      }

      await redis.client.hset(
        `migration_progress:${migrationId}`,
        'data',
        JSON.stringify(progressData)
      )

      await redis.client.sadd('active_migrations', migrationId)
      await redis.client.expire(`migration_progress:${migrationId}`, 86400 * 7) // 7天过期

      this.activeMigrations.add(migrationId)

      logger.info(`Migration progress tracking started for ${migrationId}`)
      this.emit('migration_started', migrationId, progressData)

      return progressData
    } catch (error) {
      logger.error('Failed to start migration tracking:', error)
      throw error
    }
  }

  /**
   * 更新迁移进度
   */
  async updateProgress(migrationId, updates = {}) {
    try {
      const currentDataStr = await redis.client.hget(`migration_progress:${migrationId}`, 'data')
      if (!currentDataStr) {
        throw new Error(`Migration ${migrationId} not found`)
      }

      const currentData = JSON.parse(currentDataStr)
      const now = Date.now()

      // 更新基本信息
      const updatedData = {
        ...currentData,
        ...updates,
        performance: {
          ...currentData.performance,
          lastUpdateTime: now,
          ...updates.performance
        }
      }

      // 计算性能指标
      if (updates.processedRecords !== undefined) {
        updatedData.processedRecords = updates.processedRecords

        const elapsedTime = (now - currentData.performance.startTime) / 1000 // 转为秒
        if (elapsedTime > 0) {
          updatedData.performance.recordsPerSecond = Math.round(
            updatedData.processedRecords / elapsedTime
          )

          // 估算剩余时间
          if (updatedData.totalRecords > 0) {
            const remainingRecords = updatedData.totalRecords - updatedData.processedRecords
            updatedData.performance.estimatedTimeRemaining = Math.round(
              remainingRecords / updatedData.performance.recordsPerSecond
            )
          }
        }
      }

      // 更新批次信息
      if (updates.batchInfo) {
        updatedData.batchInfo = {
          ...currentData.batchInfo,
          ...updates.batchInfo
        }
      }

      // 添加错误信息
      if (updates.error) {
        updatedData.errors.push({
          timestamp: now,
          message: updates.error.message || updates.error,
          type: updates.error.type || 'general',
          context: updates.error.context || {}
        })
      }

      await redis.client.hset(
        `migration_progress:${migrationId}`,
        'data',
        JSON.stringify(updatedData)
      )

      // 发出进度更新事件
      this.emit('progress_updated', migrationId, updatedData)

      // 如果有 WebSocket 连接，推送实时更新
      if (this.progressChannels.has(migrationId)) {
        this.progressChannels.get(migrationId).forEach((callback) => {
          callback(updatedData)
        })
      }

      return updatedData
    } catch (error) {
      logger.error(`Failed to update migration progress for ${migrationId}:`, error)
      throw error
    }
  }

  /**
   * 完成迁移跟踪
   */
  async completeTracking(migrationId, finalStatus = 'completed', summary = {}) {
    try {
      const updates = {
        status: finalStatus,
        endTime: Date.now(),
        summary: {
          duration: 0,
          totalProcessed: 0,
          successRate: 0,
          ...summary
        }
      }

      const finalData = await this.updateProgress(migrationId, updates)

      // 计算最终统计
      const duration = finalData.endTime - finalData.startTime
      finalData.summary.duration = duration

      if (finalData.totalRecords > 0) {
        finalData.summary.successRate = Math.round(
          (finalData.succeededRecords / finalData.totalRecords) * 100
        )
      }

      // 更新最终数据
      await redis.client.hset(
        `migration_progress:${migrationId}`,
        'data',
        JSON.stringify(finalData)
      )

      // 从活跃迁移列表中移除
      await redis.client.srem('active_migrations', migrationId)
      this.activeMigrations.delete(migrationId)

      // 保存到历史记录
      await this.saveToHistory(migrationId, finalData)

      logger.info(`Migration tracking completed for ${migrationId}`, {
        duration,
        status: finalStatus,
        processed: finalData.processedRecords,
        succeeded: finalData.succeededRecords
      })

      this.emit('migration_completed', migrationId, finalData)

      return finalData
    } catch (error) {
      logger.error(`Failed to complete migration tracking for ${migrationId}:`, error)
      throw error
    }
  }

  /**
   * 获取迁移进度
   */
  async getProgress(migrationId) {
    try {
      const dataStr = await redis.client.hget(`migration_progress:${migrationId}`, 'data')
      if (!dataStr) {
        throw new Error(`Migration ${migrationId} not found`)
      }

      return JSON.parse(dataStr)
    } catch (error) {
      logger.error(`Failed to get migration progress for ${migrationId}:`, error)
      throw error
    }
  }

  /**
   * 获取所有活跃的迁移
   */
  async getActiveMigrations() {
    try {
      const migrationIds = await redis.client.smembers('active_migrations')
      const migrations = []

      for (const migrationId of migrationIds) {
        try {
          const progress = await this.getProgress(migrationId)
          migrations.push(progress)
        } catch (error) {
          // 如果获取失败，从活跃列表中移除
          await redis.client.srem('active_migrations', migrationId)
          logger.warn(`Removed invalid migration ${migrationId} from active list`)
        }
      }

      return migrations
    } catch (error) {
      logger.error('Failed to get active migrations:', error)
      throw error
    }
  }

  /**
   * 获取迁移历史记录
   */
  async getMigrationHistory(limit = 50, offset = 0) {
    try {
      const historyItems = await redis.client.zrevrange(
        'migration_history',
        offset,
        offset + limit - 1,
        'WITHSCORES'
      )

      const history = []
      for (let i = 0; i < historyItems.length; i += 2) {
        const migrationId = historyItems[i]
        const timestamp = parseInt(historyItems[i + 1])

        try {
          const dataStr = await redis.client.hget(`migration_history:${migrationId}`, 'data')
          if (dataStr) {
            const data = JSON.parse(dataStr)
            data.historyTimestamp = timestamp
            history.push(data)
          }
        } catch (error) {
          logger.warn(`Failed to load history for ${migrationId}:`, error)
        }
      }

      return history
    } catch (error) {
      logger.error('Failed to get migration history:', error)
      throw error
    }
  }

  /**
   * 订阅迁移进度更新
   */
  subscribeToProgress(migrationId, callback) {
    if (!this.progressChannels.has(migrationId)) {
      this.progressChannels.set(migrationId, new Set())
    }

    this.progressChannels.get(migrationId).add(callback)

    // 返回取消订阅的函数
    return () => {
      const channels = this.progressChannels.get(migrationId)
      if (channels) {
        channels.delete(callback)
        if (channels.size === 0) {
          this.progressChannels.delete(migrationId)
        }
      }
    }
  }

  /**
   * 取消迁移
   */
  async cancelMigration(migrationId, reason = 'User cancelled') {
    try {
      const currentData = await this.getProgress(migrationId)

      const _updates = {
        status: 'cancelled',
        endTime: Date.now(),
        cancellationReason: reason
      }

      await this.completeTracking(migrationId, 'cancelled', {
        cancellationReason: reason,
        processedBeforeCancellation: currentData.processedRecords
      })

      this.emit('migration_cancelled', migrationId, reason)

      logger.info(`Migration ${migrationId} cancelled:`, reason)
    } catch (error) {
      logger.error(`Failed to cancel migration ${migrationId}:`, error)
      throw error
    }
  }

  /**
   * 清理过期的进度数据
   */
  async cleanup(daysToKeep = 30) {
    try {
      const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000

      // 清理历史记录
      await redis.client.zremrangebyscore('migration_history', 0, cutoffTime)

      // 获取所有进度键并检查是否过期
      const progressKeys = await redis.client.keys('migration_progress:*')
      let cleanedCount = 0

      for (const key of progressKeys) {
        try {
          const ttl = await redis.client.ttl(key)
          if (ttl === -1) {
            // 没有过期时间的键
            const dataStr = await redis.client.hget(key, 'data')
            if (dataStr) {
              const data = JSON.parse(dataStr)
              if (data.endTime && data.endTime < cutoffTime) {
                await redis.client.del(key)
                cleanedCount++
              }
            }
          }
        } catch (error) {
          logger.warn(`Failed to check expiration for ${key}:`, error)
        }
      }

      logger.info(`Migration progress cleanup completed: ${cleanedCount} keys cleaned`)
      return cleanedCount
    } catch (error) {
      logger.error('Migration progress cleanup failed:', error)
      throw error
    }
  }

  /**
   * 保存到历史记录
   */
  async saveToHistory(migrationId, data) {
    try {
      const historyKey = `migration_history:${migrationId}`
      const timestamp = data.endTime || Date.now()

      await redis.client.hset(historyKey, 'data', JSON.stringify(data))
      await redis.client.zadd('migration_history', timestamp, migrationId)
      await redis.client.expire(historyKey, 86400 * 90) // 历史记录保留90天
    } catch (error) {
      logger.error('Failed to save migration to history:', error)
      throw error
    }
  }

  /**
   * 生成进度报告
   */
  async generateProgressReport(migrationId) {
    try {
      const progress = await this.getProgress(migrationId)

      const report = {
        migrationId,
        status: progress.status,
        timeline: {
          startTime: new Date(progress.startTime).toISOString(),
          endTime: progress.endTime ? new Date(progress.endTime).toISOString() : null,
          duration: progress.endTime
            ? progress.endTime - progress.startTime
            : Date.now() - progress.startTime
        },
        statistics: {
          totalRecords: progress.totalRecords,
          processedRecords: progress.processedRecords,
          succeededRecords: progress.succeededRecords,
          failedRecords: progress.failedRecords,
          successRate:
            progress.totalRecords > 0
              ? Math.round((progress.succeededRecords / progress.totalRecords) * 100)
              : 0
        },
        performance: progress.performance,
        batchInfo: progress.batchInfo,
        errors: progress.errors,
        metadata: progress.metadata
      }

      return report
    } catch (error) {
      logger.error(`Failed to generate progress report for ${migrationId}:`, error)
      throw error
    }
  }

  /**
   * 获取系统整体迁移统计
   */
  async getSystemMigrationStats() {
    try {
      const activeMigrations = await this.getActiveMigrations()
      const recentHistory = await this.getMigrationHistory(20)

      const stats = {
        active: {
          count: activeMigrations.length,
          migrations: activeMigrations
        },
        recent: {
          count: recentHistory.length,
          successful: recentHistory.filter((m) => m.status === 'completed').length,
          failed: recentHistory.filter((m) => m.status === 'failed').length,
          cancelled: recentHistory.filter((m) => m.status === 'cancelled').length
        },
        performance: {
          totalRecordsProcessed: recentHistory.reduce(
            (sum, m) => sum + (m.processedRecords || 0),
            0
          ),
          averageSuccessRate:
            recentHistory.length > 0
              ? recentHistory.reduce((sum, m) => sum + (m.summary?.successRate || 0), 0) /
                recentHistory.length
              : 0,
          averageDuration:
            recentHistory.length > 0
              ? recentHistory.reduce((sum, m) => sum + (m.summary?.duration || 0), 0) /
                recentHistory.length
              : 0
        }
      }

      return stats
    } catch (error) {
      logger.error('Failed to get system migration stats:', error)
      throw error
    }
  }
}

// 创建单例实例
const migrationProgressService = new MigrationProgressService()

module.exports = migrationProgressService
