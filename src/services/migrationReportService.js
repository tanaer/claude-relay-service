/**
 * 迁移报告服务
 *
 * 负责生成详细的迁移报告，包括：
 * - 执行摘要和统计信息
 * - 详细的操作日志
 * - 错误分析和建议
 * - 性能分析报告
 * - 数据一致性验证结果
 */

const fs = require('fs').promises
const path = require('path')
const { logger } = require('../utils/logger')
const migrationProgressService = require('./migrationProgressService')

class MigrationReportService {
  constructor() {
    this.reportsDir = path.join(__dirname, '../../reports')
    this.templatesDir = path.join(__dirname, '../templates/reports')
  }

  /**
   * 生成完整的迁移报告
   */
  async generateComprehensiveReport(migrationId, options = {}) {
    try {
      // 确保报告目录存在
      await this.ensureDirectoryExists(this.reportsDir)

      const progress = await migrationProgressService.getProgress(migrationId)
      const reportData = await this.collectReportData(migrationId, progress, options)

      // 生成不同格式的报告
      const reports = {}

      if (options.formats?.includes('json') || !options.formats) {
        reports.json = await this.generateJsonReport(reportData)
      }

      if (options.formats?.includes('html') || !options.formats) {
        reports.html = await this.generateHtmlReport(reportData)
      }

      if (options.formats?.includes('csv')) {
        reports.csv = await this.generateCsvReport(reportData)
      }

      if (options.formats?.includes('pdf')) {
        reports.pdf = await this.generatePdfReport(reportData)
      }

      // 保存报告文件
      const filePaths = await this.saveReports(migrationId, reports)

      logger.info(`Migration report generated for ${migrationId}`, {
        formats: Object.keys(reports),
        files: filePaths
      })

      return {
        migrationId,
        reportData,
        files: filePaths,
        generated: new Date().toISOString()
      }
    } catch (error) {
      logger.error(`Failed to generate migration report for ${migrationId}:`, error)
      throw error
    }
  }

  /**
   * 收集报告数据
   */
  async collectReportData(migrationId, progress, options) {
    const reportData = {
      meta: {
        migrationId,
        reportGeneratedAt: new Date().toISOString(),
        reportVersion: '1.0.0',
        options
      },

      // 执行摘要
      summary: {
        status: progress.status,
        type: progress.type || 'manual',
        timeline: {
          startTime: new Date(progress.startTime).toISOString(),
          endTime: progress.endTime ? new Date(progress.endTime).toISOString() : null,
          totalDuration: this.calculateDuration(progress.startTime, progress.endTime),
          phases: this.analyzePhases(progress)
        },
        statistics: {
          totalRecords: progress.totalRecords || 0,
          processedRecords: progress.processedRecords || 0,
          succeededRecords: progress.succeededRecords || 0,
          failedRecords: progress.failedRecords || 0,
          skippedRecords: (progress.totalRecords || 0) - (progress.processedRecords || 0),
          successRate: this.calculateSuccessRate(progress),
          errorRate: this.calculateErrorRate(progress)
        },
        performance: {
          recordsPerSecond: progress.performance?.recordsPerSecond || 0,
          averageProcessingTime: progress.performance?.avgProcessingTime || 0,
          peakMemoryUsage: progress.performance?.peakMemory || 0,
          systemResourceUsage: await this.getSystemResourceUsage()
        }
      },

      // 批次详细信息
      batches: {
        summary: {
          totalBatches: progress.batchInfo?.totalBatches || 0,
          completedBatches: progress.batchInfo?.completedBatches || 0,
          failedBatches: progress.batchInfo?.failedBatches || 0,
          averageBatchSize: this.calculateAverageBatchSize(progress),
          averageBatchTime: progress.performance?.avgBatchTime || 0
        },
        details: await this.getBatchDetails(migrationId)
      },

      // 错误分析
      errors: {
        summary: {
          totalErrors: progress.errors?.length || 0,
          errorTypes: this.categorizeErrors(progress.errors || []),
          topErrors: this.getTopErrors(progress.errors || [])
        },
        details: progress.errors || [],
        recommendations: this.generateErrorRecommendations(progress.errors || [])
      },

      // 数据验证结果
      validation: await this.getValidationResults(migrationId),

      // 配置信息
      configuration: {
        migrationSettings: progress.metadata?.settings || {},
        systemEnvironment: await this.getSystemEnvironment(),
        databaseConfiguration: await this.getDatabaseConfiguration()
      },

      // 影响分析
      impact: {
        dataChanges: await this.analyzeDataChanges(migrationId),
        systemChanges: await this.analyzeSystemChanges(migrationId),
        userImpact: await this.analyzeUserImpact(migrationId)
      }
    }

    return reportData
  }

  /**
   * 生成 JSON 格式报告
   */
  async generateJsonReport(reportData) {
    return JSON.stringify(reportData, null, 2)
  }

  /**
   * 生成 HTML 格式报告
   */
  async generateHtmlReport(reportData) {
    try {
      const template = await this.loadHtmlTemplate()
      const html = await this.renderHtmlTemplate(template, reportData)
      return html
    } catch (error) {
      logger.warn('Failed to generate HTML report, using fallback:', error)
      return this.generateFallbackHtmlReport(reportData)
    }
  }

  /**
   * 生成 CSV 格式报告
   */
  async generateCsvReport(reportData) {
    const csvLines = []

    // 添加摘要信息
    csvLines.push('Migration Summary')
    csvLines.push('Field,Value')
    csvLines.push(`Migration ID,${reportData.meta.migrationId}`)
    csvLines.push(`Status,${reportData.summary.status}`)
    csvLines.push(`Start Time,${reportData.summary.timeline.startTime}`)
    csvLines.push(`End Time,${reportData.summary.timeline.endTime || 'N/A'}`)
    csvLines.push(`Total Duration,${reportData.summary.timeline.totalDuration}`)
    csvLines.push(`Total Records,${reportData.summary.statistics.totalRecords}`)
    csvLines.push(`Processed Records,${reportData.summary.statistics.processedRecords}`)
    csvLines.push(`Success Rate,${reportData.summary.statistics.successRate}%`)

    csvLines.push('') // 空行分隔

    // 添加错误详情
    if (reportData.errors.details.length > 0) {
      csvLines.push('Errors')
      csvLines.push('Timestamp,Type,Message,Context')

      reportData.errors.details.forEach((error) => {
        const timestamp = new Date(error.timestamp).toISOString()
        const type = error.type || 'general'
        const message = this.escapeCsvField(error.message || '')
        const context = this.escapeCsvField(JSON.stringify(error.context || {}))

        csvLines.push(`${timestamp},${type},${message},${context}`)
      })
    }

    return csvLines.join('\n')
  }

  /**
   * 生成 PDF 格式报告 (占位符)
   */
  async generatePdfReport(reportData) {
    // 这里应该使用 PDF 生成库（如 puppeteer、jsPDF 等）
    // 暂时返回一个占位符内容
    return `PDF generation not implemented yet for migration ${reportData.meta.migrationId}`
  }

  /**
   * 保存报告文件
   */
  async saveReports(migrationId, reports) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filePaths = {}

    for (const [format, content] of Object.entries(reports)) {
      const filename = `migration-report-${migrationId}-${timestamp}.${format}`
      const filepath = path.join(this.reportsDir, filename)

      await fs.writeFile(filepath, content, 'utf8')
      filePaths[format] = filepath
    }

    return filePaths
  }

  /**
   * 分析迁移阶段
   */
  analyzePhases(progress) {
    const phases = []

    if (progress.startTime) {
      phases.push({
        name: 'Initialization',
        startTime: progress.startTime,
        duration: 0 // 这里应该从详细日志中计算
      })
    }

    if (progress.batchInfo?.totalBatches > 0) {
      phases.push({
        name: 'Batch Processing',
        startTime: progress.startTime,
        duration: 0, // 从批次日志计算
        batchCount: progress.batchInfo.totalBatches
      })
    }

    if (progress.endTime) {
      phases.push({
        name: 'Validation',
        startTime: progress.endTime - 60000, // 假设验证阶段1分钟
        duration: 60000
      })
    }

    return phases
  }

  /**
   * 计算成功率
   */
  calculateSuccessRate(progress) {
    const total = progress.totalRecords || 0
    const succeeded = progress.succeededRecords || 0

    if (total === 0) {
      return 0
    }
    return Math.round((succeeded / total) * 100 * 100) / 100 // 保留两位小数
  }

  /**
   * 计算错误率
   */
  calculateErrorRate(progress) {
    const total = progress.totalRecords || 0
    const failed = progress.failedRecords || 0

    if (total === 0) {
      return 0
    }
    return Math.round((failed / total) * 100 * 100) / 100
  }

  /**
   * 计算持续时间
   */
  calculateDuration(startTime, endTime) {
    if (!startTime) {
      return 'N/A'
    }
    if (!endTime) {
      return 'In Progress'
    }

    const duration = endTime - startTime
    const hours = Math.floor(duration / 3600000)
    const minutes = Math.floor((duration % 3600000) / 60000)
    const seconds = Math.floor((duration % 60000) / 1000)

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    } else {
      return `${seconds}s`
    }
  }

  /**
   * 错误分类
   */
  categorizeErrors(errors) {
    const categories = {}

    errors.forEach((error) => {
      const type = error.type || 'general'
      categories[type] = (categories[type] || 0) + 1
    })

    return categories
  }

  /**
   * 获取最常见错误
   */
  getTopErrors(errors, limit = 5) {
    const errorCounts = {}

    errors.forEach((error) => {
      const message = error.message || 'Unknown error'
      errorCounts[message] = (errorCounts[message] || 0) + 1
    })

    return Object.entries(errorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([message, count]) => ({ message, count }))
  }

  /**
   * 生成错误建议
   */
  generateErrorRecommendations(errors) {
    const recommendations = []
    const errorTypes = this.categorizeErrors(errors)

    // 基于错误类型提供建议
    Object.keys(errorTypes).forEach((type) => {
      switch (type) {
        case 'database':
          recommendations.push({
            category: 'Database',
            suggestion: '检查数据库连接和查询语句，考虑增加重试机制',
            priority: 'high'
          })
          break
        case 'validation':
          recommendations.push({
            category: 'Data Validation',
            suggestion: '验证输入数据格式，添加更严格的数据验证规则',
            priority: 'medium'
          })
          break
        case 'network':
          recommendations.push({
            category: 'Network',
            suggestion: '检查网络连接稳定性，考虑增加超时重试',
            priority: 'high'
          })
          break
        default:
          recommendations.push({
            category: 'General',
            suggestion: `分析 ${type} 类型的错误模式，制定针对性解决方案`,
            priority: 'low'
          })
      }
    })

    return recommendations
  }

  /**
   * 获取系统资源使用情况
   */
  async getSystemResourceUsage() {
    try {
      const usage = process.memoryUsage()
      const cpuUsage = process.cpuUsage()

      return {
        memory: {
          heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
          rss: Math.round(usage.rss / 1024 / 1024),
          external: Math.round(usage.external / 1024 / 1024)
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        }
      }
    } catch (error) {
      logger.warn('Failed to get system resource usage:', error)
      return {}
    }
  }

  /**
   * 生成备用 HTML 报告
   */
  generateFallbackHtmlReport(reportData) {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>迁移报告 - ${reportData.meta.migrationId}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .header { border-bottom: 2px solid #333; margin-bottom: 30px; padding-bottom: 20px; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #333; border-bottom: 1px solid #ccc; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
        .stat-card { background: #f5f5f5; padding: 15px; border-radius: 5px; }
        .error-list { background: #ffe6e6; padding: 15px; border-radius: 5px; }
        .success { color: #28a745; }
        .error { color: #dc3545; }
        .warning { color: #ffc107; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>卡类型迁移报告</h1>
        <p><strong>迁移ID:</strong> ${reportData.meta.migrationId}</p>
        <p><strong>生成时间:</strong> ${reportData.meta.reportGeneratedAt}</p>
        <p><strong>状态:</strong> <span class="${reportData.summary.status === 'completed' ? 'success' : 'error'}">${reportData.summary.status}</span></p>
    </div>

    <div class="section">
        <h2>执行摘要</h2>
        <div class="stats-grid">
            <div class="stat-card">
                <h3>记录统计</h3>
                <p>总记录数: ${reportData.summary.statistics.totalRecords}</p>
                <p>已处理: ${reportData.summary.statistics.processedRecords}</p>
                <p>成功: ${reportData.summary.statistics.succeededRecords}</p>
                <p>失败: ${reportData.summary.statistics.failedRecords}</p>
            </div>
            <div class="stat-card">
                <h3>性能指标</h3>
                <p>成功率: ${reportData.summary.statistics.successRate}%</p>
                <p>处理速度: ${reportData.summary.performance.recordsPerSecond} 记录/秒</p>
                <p>总耗时: ${reportData.summary.timeline.totalDuration}</p>
            </div>
        </div>
    </div>

    ${
      reportData.errors.details.length > 0
        ? `
    <div class="section">
        <h2>错误分析</h2>
        <div class="error-list">
            <h3>错误摘要</h3>
            <p>总错误数: ${reportData.errors.summary.totalErrors}</p>
            <h4>错误类型分布:</h4>
            <ul>
                ${Object.entries(reportData.errors.summary.errorTypes)
                  .map(([type, count]) => `<li>${type}: ${count} 次</li>`)
                  .join('')}
            </ul>
        </div>
    </div>
    `
        : ''
    }

    <div class="section">
        <h2>时间线</h2>
        <table>
            <tr>
                <th>阶段</th>
                <th>开始时间</th>
                <th>耗时</th>
                <th>状态</th>
            </tr>
            <tr>
                <td>初始化</td>
                <td>${reportData.summary.timeline.startTime}</td>
                <td>-</td>
                <td>完成</td>
            </tr>
            <tr>
                <td>数据迁移</td>
                <td>${reportData.summary.timeline.startTime}</td>
                <td>${reportData.summary.timeline.totalDuration}</td>
                <td>${reportData.summary.status}</td>
            </tr>
        </table>
    </div>

    <div class="section">
        <h2>系统信息</h2>
        <p>本报告由卡类型迁移系统自动生成</p>
        <p>报告版本: ${reportData.meta.reportVersion}</p>
    </div>
</body>
</html>`
  }

  /**
   * 工具方法
   */
  async ensureDirectoryExists(dir) {
    try {
      await fs.access(dir)
    } catch {
      await fs.mkdir(dir, { recursive: true })
    }
  }

  escapeCsvField(field) {
    if (typeof field !== 'string') {
      return ''
    }
    return `"${field.replace(/"/g, '""')}"`
  }

  calculateAverageBatchSize(progress) {
    const totalBatches = progress.batchInfo?.totalBatches || 0
    const totalRecords = progress.totalRecords || 0

    if (totalBatches === 0) {
      return 0
    }
    return Math.round(totalRecords / totalBatches)
  }

  // 占位符方法，实际实现时需要连接相应的服务
  async getBatchDetails(_migrationId) {
    return [] // 从批次执行日志中获取详细信息
  }

  async getValidationResults(_migrationId) {
    return {} // 从验证服务获取结果
  }

  async getSystemEnvironment() {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    }
  }

  async getDatabaseConfiguration() {
    return {} // 获取数据库配置信息
  }

  async analyzeDataChanges(_migrationId) {
    return {} // 分析数据变化
  }

  async analyzeSystemChanges(_migrationId) {
    return {} // 分析系统变化
  }

  async analyzeUserImpact(_migrationId) {
    return {} // 分析用户影响
  }

  async loadHtmlTemplate() {
    // 从模板文件加载 HTML 模板
    return ''
  }

  async renderHtmlTemplate(template, _data) {
    // 渲染 HTML 模板
    return template
  }
}

module.exports = new MigrationReportService()
