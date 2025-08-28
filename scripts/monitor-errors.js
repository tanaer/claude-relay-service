#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const chalk = require('chalk')

/**
 * 错误日志监控脚本
 */
class ErrorMonitor {
  constructor() {
    this.stats = {
      timeout: 0,
      connectionReset: 0,
      http500: 0,
      http502: 0,
      http503: 0,
      total: 0,
      startTime: new Date(),
      errors: []
    }

    this.thresholds = {
      timeout: 50,
      connectionReset: 30,
      http500: 20,
      http502: 20
    }
  }

  /**
   * 分析错误日志文件
   */
  async analyzeLogFile(logFile) {
    if (!fs.existsSync(logFile)) {
      console.error(chalk.red(`❌ Log file not found: ${logFile}`))
      return
    }

    const rl = readline.createInterface({
      input: fs.createReadStream(logFile),
      crlfDelay: Infinity
    })

    for await (const line of rl) {
      this.analyzeLine(line)
    }

    this.printReport()
    this.checkThresholds()
  }

  /**
   * 分析单行日志
   */
  analyzeLine(line) {
    this.stats.total++

    // 分析错误类型
    if (line.includes('timeout') || line.includes('ETIMEDOUT')) {
      this.stats.timeout++
      this.stats.errors.push({ type: 'timeout', line })
    }
    if (line.includes('ECONNRESET')) {
      this.stats.connectionReset++
      this.stats.errors.push({ type: 'connectionReset', line })
    }
    if (line.includes('| 500 |')) {
      this.stats.http500++
      this.stats.errors.push({ type: 'http500', line })
    }
    if (line.includes('| 502 |')) {
      this.stats.http502++
      this.stats.errors.push({ type: 'http502', line })
    }
    if (line.includes('| 503 |')) {
      this.stats.http503++
      this.stats.errors.push({ type: 'http503', line })
    }
  }

  /**
   * 打印分析报告
   */
  printReport() {
    console.log(chalk.cyan('\n📊 错误日志分析报告'))
    console.log(chalk.cyan('═══════════════════════════════════════'))

    const duration = (Date.now() - this.stats.startTime) / 1000
    console.log(chalk.gray(`分析时间: ${duration.toFixed(2)}秒`))
    console.log(chalk.gray(`总错误数: ${this.stats.total}\n`))

    // 错误分类统计
    console.log(chalk.yellow('错误类型分布:'))
    console.log(
      `  ${chalk.red('超时错误')}: ${this.stats.timeout} (${this.getPercentage(this.stats.timeout)}%)`
    )
    console.log(
      `  ${chalk.red('连接重置')}: ${this.stats.connectionReset} (${this.getPercentage(this.stats.connectionReset)}%)`
    )
    console.log(
      `  ${chalk.red('HTTP 500')}: ${this.stats.http500} (${this.getPercentage(this.stats.http500)}%)`
    )
    console.log(
      `  ${chalk.red('HTTP 502')}: ${this.stats.http502} (${this.getPercentage(this.stats.http502)}%)`
    )
    console.log(
      `  ${chalk.red('HTTP 503')}: ${this.stats.http503} (${this.getPercentage(this.stats.http503)}%)`
    )

    // 显示最近错误
    if (this.stats.errors.length > 0) {
      console.log(chalk.yellow('\n最近5个错误:'))
      this.stats.errors.slice(-5).forEach((error, index) => {
        const preview = error.line.substring(0, 100)
        console.log(`  ${index + 1}. [${error.type}] ${preview}...`)
      })
    }
  }

  /**
   * 计算百分比
   */
  getPercentage(count) {
    if (this.stats.total === 0) {
      return 0
    }
    return ((count / this.stats.total) * 100).toFixed(2)
  }

  /**
   * 检查阈值并发出警告
   */
  checkThresholds() {
    console.log(chalk.yellow('\n⚠️ 阈值检查:'))
    let hasWarning = false

    if (this.stats.timeout > this.thresholds.timeout) {
      console.log(
        chalk.red(`  ❌ 超时错误超过阈值 (${this.stats.timeout} > ${this.thresholds.timeout})`)
      )
      console.log(chalk.yellow(`     建议: 增加超时时间或优化上游服务响应速度`))
      hasWarning = true
    }

    if (this.stats.connectionReset > this.thresholds.connectionReset) {
      console.log(
        chalk.red(
          `  ❌ 连接重置超过阈值 (${this.stats.connectionReset} > ${this.thresholds.connectionReset})`
        )
      )
      console.log(chalk.yellow(`     建议: 检查网络稳定性，增加重试机制`))
      hasWarning = true
    }

    if (this.stats.http502 > this.thresholds.http502) {
      console.log(
        chalk.red(`  ❌ HTTP 502错误超过阈值 (${this.stats.http502} > ${this.thresholds.http502})`)
      )
      console.log(chalk.yellow(`     建议: 检查上游服务健康状态`))
      hasWarning = true
    }

    if (!hasWarning) {
      console.log(chalk.green('  ✅ 所有指标在正常范围内'))
    }
  }

  /**
   * 实时监控模式
   */
  async startRealTimeMonitoring(logFile) {
    console.log(chalk.cyan('🔍 启动实时错误监控...'))
    console.log(chalk.gray(`监控文件: ${logFile}`))
    console.log(chalk.gray('按 Ctrl+C 退出\n'))

    // 定期分析
    setInterval(() => {
      this.stats = {
        timeout: 0,
        connectionReset: 0,
        http500: 0,
        http502: 0,
        http503: 0,
        total: 0,
        startTime: new Date(),
        errors: []
      }

      this.analyzeLogFile(logFile)
    }, 60000) // 每分钟分析一次

    // 首次分析
    await this.analyzeLogFile(logFile)
  }
}

// 主函数
async function main() {
  const monitor = new ErrorMonitor()

  // 获取今天的日志文件
  const today = new Date().toISOString().split('T')[0]
  const logFile = path.join(__dirname, '..', 'logs', `claude-relay-error-${today}.log`)

  // 解析命令行参数
  const args = process.argv.slice(2)
  const isRealTime = args.includes('--realtime') || args.includes('-r')

  if (isRealTime) {
    await monitor.startRealTimeMonitoring(logFile)
  } else {
    await monitor.analyzeLogFile(logFile)
  }
}

// 运行监控
if (require.main === module) {
  main().catch(console.error)
}

module.exports = ErrorMonitor
