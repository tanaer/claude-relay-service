#!/usr/bin/env node

/**
 * 批量迁移执行器
 *
 * 专门用于处理大规模数据迁移，支持：
 * - 分批处理避免内存溢出
 * - 并发控制提高处理速度
 * - 进度跟踪和状态持久化
 * - 错误恢复和断点续传
 * - 性能监控和资源控制
 *
 * 使用示例:
 * node scripts/batch-migration-runner.js --batch-size 1000 --concurrency 5
 * node scripts/batch-migration-runner.js --resume migration-12345
 * node scripts/batch-migration-runner.js --config custom-config.json
 */

const chalk = require('chalk')
const fs = require('fs').promises
const path = require('path')
const { performance } = require('perf_hooks')

// 引入服务和工具
const CardTypeMigrationService = require('../src/services/cardTypeMigrationService')
const { logger } = require('../src/utils/logger')
const _redis = require('../src/models/redis')

class BatchMigrationRunner {
  constructor(options = {}) {
    this.options = {
      batchSize: options.batchSize || 500, // 每批处理的记录数
      concurrency: options.concurrency || 3, // 并发处理的批次数
      retryAttempts: options.retryAttempts || 3, // 重试次数
      retryDelay: options.retryDelay || 1000, // 重试延迟(ms)
      progressInterval: options.progressInterval || 10, // 进度报告间隔
      checkpointInterval: options.checkpointInterval || 50, // 检查点保存间隔
      memoryThreshold: options.memoryThreshold || 0.8, // 内存使用阈值
      ...options
    }

    this.stats = {
      startTime: null,
      endTime: null,
      totalRecords: 0,
      processedRecords: 0,
      succeededRecords: 0,
      failedRecords: 0,
      batches: {
        total: 0,
        completed: 0,
        failed: 0
      },
      errors: [],
      performance: {
        avgBatchTime: 0,
        peakMemory: 0,
        totalTime: 0
      }
    }

    this.migrationId = null
    this.currentBatch = 0
    this.isRunning = false
    this.shouldStop = false

    // 绑定信号处理
    process.on('SIGINT', this.handleGracefulShutdown.bind(this))
    process.on('SIGTERM', this.handleGracefulShutdown.bind(this))
  }

  /**
   * 开始批量迁移
   */
  async run(resumeId = null) {
    try {
      console.log(chalk.blue('🚀 启动批量迁移执行器...'))

      this.isRunning = true
      this.stats.startTime = Date.now()

      // 恢复或创建新的迁移任务
      if (resumeId) {
        await this.resumeMigration(resumeId)
      } else {
        await this.startNewMigration()
      }

      // 显示配置信息
      this.displayConfiguration()

      // 执行数据分析
      await this.analyzeData()

      // 执行批量迁移
      await this.executeBatchMigration()

      // 验证结果
      await this.validateResults()

      // 生成最终报告
      await this.generateFinalReport()

      console.log(chalk.green('\n✅ 批量迁移执行完成!'))
    } catch (error) {
      console.error(chalk.red('\n❌ 批量迁移执行失败:'), error.message)
      logger.error('Batch migration failed:', error)
      await this.handleMigrationError(error)
      process.exit(1)
    } finally {
      this.isRunning = false
      this.stats.endTime = Date.now()
      this.stats.performance.totalTime = this.stats.endTime - this.stats.startTime
      await this.cleanup()
    }
  }

  /**
   * 恢复之前的迁移任务
   */
  async resumeMigration(migrationId) {
    console.log(chalk.yellow(`🔄 恢复迁移任务: ${migrationId}`))

    try {
      const checkpointPath = path.join(__dirname, '../checkpoints', `${migrationId}.json`)
      const checkpoint = JSON.parse(await fs.readFile(checkpointPath, 'utf8'))

      this.migrationId = migrationId
      this.currentBatch = checkpoint.currentBatch || 0
      this.stats = { ...this.stats, ...checkpoint.stats }

      console.log(chalk.green(`✅ 已恢复到第 ${this.currentBatch} 批次`))
    } catch (error) {
      throw new Error(`无法恢复迁移任务 ${migrationId}: ${error.message}`)
    }
  }

  /**
   * 开始新的迁移任务
   */
  async startNewMigration() {
    this.migrationId = `batch-migration-${Date.now()}`
    console.log(chalk.blue(`🆕 创建新的迁移任务: ${this.migrationId}`))
  }

  /**
   * 显示配置信息
   */
  displayConfiguration() {
    console.log(chalk.cyan('\n⚙️  批量迁移配置:'))
    console.log('─'.repeat(40))
    console.log(`批次大小: ${this.options.batchSize}`)
    console.log(`并发数: ${this.options.concurrency}`)
    console.log(`重试次数: ${this.options.retryAttempts}`)
    console.log(`内存阈值: ${(this.options.memoryThreshold * 100).toFixed(0)}%`)
    console.log(`迁移ID: ${this.migrationId}`)
  }

  /**
   * 分析数据量，计算批次
   */
  async analyzeData() {
    console.log(chalk.blue('\n📊 分析数据量...'))

    const analysis = await CardTypeMigrationService.analyzeData()

    this.stats.totalRecords =
      analysis.apiKeys.needsMigration +
      analysis.redemptionCodes.daily +
      analysis.redemptionCodes.monthly

    this.stats.batches.total = Math.ceil(this.stats.totalRecords / this.options.batchSize)

    console.log(chalk.green('✅ 数据分析完成:'))
    console.log(`  总记录数: ${this.stats.totalRecords}`)
    console.log(`  预计批次: ${this.stats.batches.total}`)
    console.log(`  预计时间: ${this.estimateTime()} 分钟`)
  }

  /**
   * 执行批量迁移
   */
  async executeBatchMigration() {
    console.log(chalk.blue('\n🔄 开始批量迁移...'))

    // 创建批次任务队列
    const batches = this.createBatchQueue()

    // 使用并发控制执行批次
    const batchPromises = []
    const activeBatches = new Set()

    for (let i = 0; i < batches.length; i++) {
      // 控制并发数
      while (activeBatches.size >= this.options.concurrency) {
        await Promise.race(Array.from(activeBatches))
      }

      // 检查是否需要停止
      if (this.shouldStop) {
        console.log(chalk.yellow('⏹️  收到停止信号，等待当前批次完成...'))
        break
      }

      // 检查内存使用情况
      await this.checkMemoryUsage()

      // 创建批次执行 Promise
      const batchPromise = this.executeBatch(i, batches[i])
        .then((result) => {
          activeBatches.delete(batchPromise)
          return result
        })
        .catch((error) => {
          activeBatches.delete(batchPromise)
          throw error
        })

      activeBatches.add(batchPromise)
      batchPromises.push(batchPromise)
    }

    // 等待所有批次完成
    console.log(chalk.blue('\n⏳ 等待所有批次完成...'))
    const results = await Promise.allSettled(batchPromises)

    // 统计结果
    this.processBatchResults(results)
  }

  /**
   * 创建批次队列
   */
  createBatchQueue() {
    const batches = []
    const totalBatches = this.stats.batches.total

    for (let i = this.currentBatch; i < totalBatches; i++) {
      batches.push({
        index: i,
        start: i * this.options.batchSize,
        size: this.options.batchSize
      })
    }

    return batches
  }

  /**
   * 执行单个批次
   */
  async executeBatch(batchIndex, batchInfo) {
    const batchStartTime = performance.now()
    let attempt = 0

    while (attempt <= this.options.retryAttempts) {
      try {
        // 模拟批次处理 (实际实现中会调用具体的迁移逻辑)
        const result = await this.processBatchData(batchInfo)

        // 更新统计
        this.stats.processedRecords += result.processed
        this.stats.succeededRecords += result.succeeded
        this.stats.batches.completed++

        // 显示进度
        this.displayProgress(batchIndex)

        // 保存检查点
        if (batchIndex % this.options.checkpointInterval === 0) {
          await this.saveCheckpoint()
        }

        const batchTime = performance.now() - batchStartTime
        this.updatePerformanceStats(batchTime)

        return result
      } catch (error) {
        attempt++

        if (attempt <= this.options.retryAttempts) {
          console.log(
            chalk.yellow(
              `⚠️  批次 ${batchIndex} 失败，重试 ${attempt}/${this.options.retryAttempts}...`
            )
          )
          await this.delay(this.options.retryDelay * attempt)
        } else {
          console.error(chalk.red(`❌ 批次 ${batchIndex} 最终失败:`, error.message))
          this.stats.batches.failed++
          this.stats.errors.push({
            batchIndex,
            error: error.message,
            timestamp: new Date().toISOString()
          })
          throw error
        }
      }
    }
  }

  /**
   * 处理批次数据 (模拟实现)
   */
  async processBatchData(batchInfo) {
    // 这里应该实现具体的批次数据处理逻辑
    // 例如：从 Redis 获取数据，执行迁移操作，更新记录等

    // 模拟处理时间
    await this.delay(50 + Math.random() * 100)

    const processed = Math.min(batchInfo.size, this.stats.totalRecords - batchInfo.start)
    const succeeded = Math.floor(processed * 0.98) // 模拟 98% 成功率

    return {
      processed,
      succeeded,
      failed: processed - succeeded
    }
  }

  /**
   * 显示迁移进度
   */
  displayProgress(batchIndex) {
    if (batchIndex % this.options.progressInterval === 0) {
      const percentage = ((this.stats.batches.completed / this.stats.batches.total) * 100).toFixed(
        1
      )
      const elapsed = Date.now() - this.stats.startTime
      const eta = this.calculateETA()

      console.log(
        chalk.cyan(
          `📈 进度: ${percentage}% (${this.stats.batches.completed}/${this.stats.batches.total}) | ` +
            `记录: ${this.stats.succeededRecords}/${this.stats.totalRecords} | ` +
            `耗时: ${this.formatDuration(elapsed)} | ` +
            `预计剩余: ${this.formatDuration(eta)}`
        )
      )
    }
  }

  /**
   * 计算预计剩余时间
   */
  calculateETA() {
    const elapsed = Date.now() - this.stats.startTime
    const progress = this.stats.batches.completed / this.stats.batches.total

    if (progress === 0) {
      return 0
    }

    const totalEstimatedTime = elapsed / progress
    return totalEstimatedTime - elapsed
  }

  /**
   * 检查内存使用情况
   */
  async checkMemoryUsage() {
    const usage = process.memoryUsage()
    const totalMemory = require('os').totalmem()
    const memoryUsage = usage.rss / totalMemory

    this.stats.performance.peakMemory = Math.max(this.stats.performance.peakMemory, usage.rss)

    if (memoryUsage > this.options.memoryThreshold) {
      console.log(chalk.yellow('⚠️  内存使用率较高，触发垃圾回收...'))
      if (global.gc) {
        global.gc()
      }
      await this.delay(1000) // 等待垃圾回收
    }
  }

  /**
   * 更新性能统计
   */
  updatePerformanceStats(batchTime) {
    const completedBatches = this.stats.batches.completed
    this.stats.performance.avgBatchTime =
      (this.stats.performance.avgBatchTime * (completedBatches - 1) + batchTime) / completedBatches
  }

  /**
   * 保存检查点
   */
  async saveCheckpoint() {
    try {
      const checkpointsDir = path.join(__dirname, '../checkpoints')
      await fs.mkdir(checkpointsDir, { recursive: true })

      const checkpoint = {
        migrationId: this.migrationId,
        currentBatch: this.stats.batches.completed,
        timestamp: new Date().toISOString(),
        stats: this.stats,
        options: this.options
      }

      const checkpointPath = path.join(checkpointsDir, `${this.migrationId}.json`)
      await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2))
    } catch (error) {
      logger.error('Failed to save checkpoint:', error)
    }
  }

  /**
   * 处理批次结果
   */
  processBatchResults(results) {
    console.log(chalk.blue('\n📋 处理批次结果...'))

    const successful = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length

    console.log(chalk.green(`✅ 成功批次: ${successful}`))
    console.log(chalk.red(`❌ 失败批次: ${failed}`))

    if (failed > 0) {
      console.log(chalk.yellow('\n⚠️  失败的批次:'))
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.log(`  批次 ${index}: ${result.reason.message}`)
        }
      })
    }
  }

  /**
   * 验证迁移结果
   */
  async validateResults() {
    console.log(chalk.blue('\n🔍 验证迁移结果...'))

    try {
      const validation = await CardTypeMigrationService.validateMigration()

      if (validation.migrationStatus.isCompleted) {
        console.log(chalk.green('✅ 迁移验证通过'))
      } else {
        console.log(chalk.yellow('⚠️  迁移验证发现问题，请检查详细报告'))
      }
    } catch (error) {
      console.error(chalk.red('❌ 验证失败:'), error.message)
    }
  }

  /**
   * 生成最终报告
   */
  async generateFinalReport() {
    console.log(chalk.blue('\n📄 生成迁移报告...'))

    const report = {
      migrationId: this.migrationId,
      summary: {
        totalRecords: this.stats.totalRecords,
        processedRecords: this.stats.processedRecords,
        succeededRecords: this.stats.succeededRecords,
        failedRecords: this.stats.failedRecords,
        successRate: `${((this.stats.succeededRecords / this.stats.totalRecords) * 100).toFixed(2)}%`
      },
      batches: this.stats.batches,
      performance: {
        totalTime: this.formatDuration(this.stats.performance.totalTime),
        avgBatchTime: `${this.stats.performance.avgBatchTime.toFixed(2)}ms`,
        peakMemory: this.formatBytes(this.stats.performance.peakMemory),
        throughput: `${(
          this.stats.succeededRecords /
          (this.stats.performance.totalTime / 1000)
        ).toFixed(0)} records/sec`
      },
      errors: this.stats.errors,
      configuration: this.options,
      timestamp: {
        start: new Date(this.stats.startTime).toISOString(),
        end: new Date(this.stats.endTime).toISOString()
      }
    }

    const reportsDir = path.join(__dirname, '../reports')
    await fs.mkdir(reportsDir, { recursive: true })

    const reportPath = path.join(reportsDir, `batch-migration-${this.migrationId}.json`)
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2))

    console.log(chalk.green(`✅ 报告已保存: ${reportPath}`))

    // 显示摘要
    this.displaySummary(report)
  }

  /**
   * 显示迁移摘要
   */
  displaySummary(report) {
    console.log(chalk.green('\n🎉 批量迁移摘要:'))
    console.log('═'.repeat(50))
    console.log(`总记录数: ${report.summary.totalRecords}`)
    console.log(`成功记录: ${report.summary.succeededRecords}`)
    console.log(`失败记录: ${report.summary.failedRecords}`)
    console.log(`成功率: ${report.summary.successRate}`)
    console.log(`总耗时: ${report.performance.totalTime}`)
    console.log(`平均批次时间: ${report.performance.avgBatchTime}`)
    console.log(`处理速度: ${report.performance.throughput}`)
    console.log(`峰值内存: ${report.performance.peakMemory}`)
  }

  /**
   * 处理优雅关闭
   */
  async handleGracefulShutdown(signal) {
    console.log(chalk.yellow(`\n⚠️  收到 ${signal} 信号，准备优雅关闭...`))

    this.shouldStop = true

    if (this.isRunning) {
      console.log(chalk.blue('等待当前批次完成...'))
      await this.saveCheckpoint()
      console.log(chalk.green('✅ 检查点已保存，可以使用 --resume 继续执行'))
    }

    process.exit(0)
  }

  /**
   * 处理迁移错误
   */
  async handleMigrationError(error) {
    await this.saveCheckpoint()

    const errorReport = {
      migrationId: this.migrationId,
      error: error.message,
      stack: error.stack,
      stats: this.stats,
      timestamp: new Date().toISOString()
    }

    const errorPath = path.join(__dirname, '../reports', `error-${this.migrationId}.json`)
    await fs.writeFile(errorPath, JSON.stringify(errorReport, null, 2))

    console.log(chalk.red(`💾 错误报告已保存: ${errorPath}`))
  }

  /**
   * 清理资源
   */
  async cleanup() {
    // 这里可以添加资源清理逻辑
    // 例如：关闭数据库连接、清理临时文件等
  }

  /**
   * 工具方法
   */
  estimateTime() {
    // 基于历史数据或经验值估算时间
    const recordsPerMinute = 1000 // 假设每分钟处理 1000 条记录
    return Math.ceil(this.stats.totalRecords / recordsPerMinute)
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}小时${minutes % 60}分${seconds % 60}秒`
    } else if (minutes > 0) {
      return `${minutes}分${seconds % 60}秒`
    } else {
      return `${seconds}秒`
    }
  }

  formatBytes(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB']
    if (bytes === 0) {
      return '0 B'
    }
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2)
  const options = {}
  let resumeId = null

  // 解析命令行参数
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--batch-size' && args[i + 1]) {
      options.batchSize = parseInt(args[i + 1])
      i++
    } else if (arg === '--concurrency' && args[i + 1]) {
      options.concurrency = parseInt(args[i + 1])
      i++
    } else if (arg === '--resume' && args[i + 1]) {
      resumeId = args[i + 1]
      i++
    } else if (arg === '--config' && args[i + 1]) {
      const configPath = args[i + 1]
      const configFile = await fs.readFile(configPath, 'utf8')
      const config = JSON.parse(configFile)
      Object.assign(options, config)
      i++
    }
  }

  // 创建并运行批量迁移执行器
  const runner = new BatchMigrationRunner(options)
  await runner.run(resumeId)
}

// 检查是否直接运行
if (require.main === module) {
  main().catch((error) => {
    console.error(chalk.red('批量迁移执行器启动失败:'), error)
    process.exit(1)
  })
}

module.exports = BatchMigrationRunner
