const { v4: uuidv4 } = require('uuid')
const logger = require('../utils/logger')
const redis = require('../models/redis')
const cardTypeModel = require('../models/cardTypeModel')
const cardTypeService = require('./cardTypeService')
const _redemptionPolicyService = require('./redemptionPolicyService')
const migrationProgressService = require('./migrationProgressService')
const migrationReportService = require('./migrationReportService')
const { migrationLoggerManager } = require('../utils/migrationLogger')

/**
 * 卡类型迁移服务
 * 负责从硬编码的日卡/月卡系统迁移到动态卡类型管理系统
 */
class CardTypeMigrationService {
  constructor() {
    this.MIGRATION_STATUS_KEY = 'card_type_migration:status'
    this.MIGRATION_LOG_PREFIX = 'card_type_migration:log:'
    this.LEGACY_MAPPINGS_KEY = 'card_type_migration:legacy_mappings'
  }

  /**
   * 执行完整的迁移流程
   * @param {Object} options 迁移选项
   * @param {boolean} options.dryRun 是否为预览模式
   * @param {function} options.progressCallback 进度回调函数
   * @returns {Promise<Object>} 迁移结果
   */
  async executeMigration(options = {}) {
    const { dryRun = false, progressCallback } = options
    const migrationId = uuidv4()
    const startTime = new Date()

    // 创建迁移专用日志记录器
    const migrationLogger = migrationLoggerManager.getLogger(migrationId, {
      logLevel: 'debug',
      enableConsole: !dryRun, // 预览模式下减少控制台输出
      metadata: { dryRun, type: dryRun ? 'preview' : 'execution' }
    })

    migrationLogger.startMigration({
      dryRun,
      type: dryRun ? 'preview' : 'execution',
      options
    })

    logger.info(`🚀 开始卡类型系统${dryRun ? '预览' : '迁移'}，迁移ID: ${migrationId}`)

    try {
      // 1. 检查迁移状态
      migrationLogger.info('检查迁移状态')
      const currentStatus = await this.getMigrationStatus()
      if (currentStatus.isCompleted && !dryRun) {
        logger.warn('⚠️ 迁移已经完成，跳过重复迁移')
        migrationLogger.warn('迁移已完成，跳过执行')
        await migrationLoggerManager.removeLogger(migrationId)
        return {
          success: true,
          skipped: true,
          message: '迁移已经完成',
          existingStatus: currentStatus
        }
      }

      // 初始化进度跟踪
      let _progress = null
      if (!dryRun) {
        _progress = await migrationProgressService.startTracking(migrationId, {
          type: 'manual',
          totalSteps: 6,
          metadata: { options }
        })
      }

      // 2. 分析现有硬编码数据
      migrationLogger.info('开始数据分析')
      if (progressCallback) {
        progressCallback(1, 6, '分析数据')
      }

      const analysisResult = await this.analyzeExistingData(migrationLogger)
      migrationLogger.info('数据分析完成', { analysisResult })

      if (!dryRun) {
        await migrationProgressService.updateProgress(migrationId, {
          currentStep: 1,
          totalRecords: analysisResult.apiKeys.needsMigration + analysisResult.redemptionCodes.total
        })
      }

      // 预览模式：生成预览结果
      if (dryRun) {
        const previewResult = await this.generatePreviewResult(analysisResult, migrationLogger)
        migrationLogger.endMigration('preview_completed', previewResult)
        await migrationLoggerManager.removeLogger(migrationId)
        return previewResult
      }

      // 3. 创建内置卡类型
      migrationLogger.info('开始创建内置卡类型')
      if (progressCallback) {
        progressCallback(2, 6, '创建内置类型')
      }

      const builtinResult = await this.createBuiltinCardTypes(migrationLogger)
      migrationLogger.info('内置卡类型创建完成', { builtinResult })

      await migrationProgressService.updateProgress(migrationId, { currentStep: 2 })

      // 4. 迁移API Key数据
      migrationLogger.startTimer('api_key_migration')
      migrationLogger.info('开始迁移API Key数据')
      if (progressCallback) {
        progressCallback(3, 6, 'API Key数据')
      }

      const apiKeyResult = await this.migrateApiKeyData(migrationLogger, (current, _total) => {
        migrationProgressService.updateProgress(migrationId, {
          processedRecords: current,
          batchInfo: { currentBatch: Math.ceil(current / 100) }
        })
      })

      const apiKeyTime = migrationLogger.stopTimer('api_key_migration')
      migrationLogger.recordPerformance('api_key_migration_time', apiKeyTime, 'ms')

      await migrationProgressService.updateProgress(migrationId, {
        currentStep: 3,
        succeededRecords: apiKeyResult.migrated,
        failedRecords: apiKeyResult.errors?.length || 0
      })

      // 5. 迁移兑换码数据
      migrationLogger.startTimer('redemption_migration')
      migrationLogger.info('开始迁移兑换码数据')
      if (progressCallback) {
        progressCallback(4, 6, '兑换码数据')
      }

      const redemptionResult = await this.migrateRedemptionData(migrationLogger)
      const redemptionTime = migrationLogger.stopTimer('redemption_migration')
      migrationLogger.recordPerformance('redemption_migration_time', redemptionTime, 'ms')

      await migrationProgressService.updateProgress(migrationId, { currentStep: 4 })

      // 6. 迁移策略绑定
      migrationLogger.info('开始迁移策略绑定')
      if (progressCallback) {
        progressCallback(5, 6, '策略绑定')
      }

      const policyResult = await this.migratePolicyBindings(migrationLogger)
      migrationLogger.info('策略绑定迁移完成', { policyResult })

      await migrationProgressService.updateProgress(migrationId, { currentStep: 5 })

      // 7. 验证和完成
      migrationLogger.info('开始验证迁移结果')
      if (progressCallback) {
        progressCallback(6, 6, '验证结果')
      }

      const validationResult = await this.validateMigrationResults(migrationId, migrationLogger)

      // 更新迁移状态
      const migrationStatus = {
        isCompleted: true,
        migrationId,
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - startTime.getTime(),
        results: {
          analysis: analysisResult,
          builtin: builtinResult,
          apiKeys: apiKeyResult,
          redemption: redemptionResult,
          policies: policyResult,
          validation: validationResult
        }
      }

      await this.updateMigrationStatus(migrationStatus)

      // 完成进度跟踪
      await migrationProgressService.completeTracking(migrationId, 'completed', {
        totalProcessed: apiKeyResult.migrated + redemptionResult.migrated,
        successRate: this.calculateSuccessRate(apiKeyResult, redemptionResult)
      })

      migrationLogger.endMigration('completed', migrationStatus)

      // 生成详细报告
      try {
        const report = await migrationReportService.generateComprehensiveReport(migrationId, {
          formats: ['json', 'html']
        })
        migrationLogger.info('迁移报告生成完成', { reportFiles: report.files })
      } catch (reportError) {
        migrationLogger.warn('报告生成失败', { error: reportError.message })
      }

      logger.info(`✅ 卡类型系统迁移完成，耗时: ${migrationStatus.duration}ms`)

      // 清理迁移日志记录器
      setTimeout(() => {
        migrationLoggerManager.removeLogger(migrationId)
      }, 5000)

      return {
        success: true,
        migrationId,
        duration: migrationStatus.duration,
        results: migrationStatus.results
      }
    } catch (error) {
      logger.error(`❌ 卡类型系统迁移失败: ${error.message}`)

      // 记录详细错误
      migrationLogger.logError(error, {
        step: '迁移执行',
        migrationId,
        dryRun
      })

      // 更新进度状态为失败
      if (!dryRun) {
        try {
          await migrationProgressService.completeTracking(migrationId, 'failed', {
            error: error.message,
            failedAt: new Date().toISOString()
          })
        } catch (progressError) {
          logger.warn('Failed to update progress on error:', progressError)
        }
      }

      migrationLogger.endMigration('failed', { error: error.message })
      await this.logMigrationError(migrationId, error)

      // 清理日志记录器
      setTimeout(() => {
        migrationLoggerManager.removeLogger(migrationId)
      }, 5000)

      return {
        success: false,
        error: error.message,
        migrationId
      }
    }
  }

  /**
   * 分析现有硬编码数据
   * @param {Object} migrationLogger 迁移日志记录器
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeExistingData(_migrationLogger = null) {
    const client = redis.getClientSafe()

    // 统计现有标签为 daily-card 和 monthly-card 的 API Key
    const apiKeys = await client.keys('api_key:*')
    let dailyCardCount = 0
    let monthlyCardCount = 0
    let totalApiKeys = 0

    for (const keyPath of apiKeys) {
      if (keyPath === 'api_key:hash_map') {
        continue
      }

      const keyData = await client.hgetall(keyPath)
      if (!keyData.tags) {
        continue
      }

      totalApiKeys++

      // 解析标签
      let tags = []
      try {
        if (typeof keyData.tags === 'string') {
          const trimmedTags = keyData.tags.trim()
          if (trimmedTags.startsWith('[') && trimmedTags.endsWith(']')) {
            tags = JSON.parse(trimmedTags)
          } else {
            tags = trimmedTags.split(',').map((tag) => tag.trim())
          }
        } else if (Array.isArray(keyData.tags)) {
          tags = [...keyData.tags]
        }
      } catch (error) {
        logger.debug(`标签解析失败: ${error.message}`)
        continue
      }

      if (tags.includes('daily-card')) {
        dailyCardCount++
      }
      if (tags.includes('monthly-card')) {
        monthlyCardCount++
      }
    }

    // 统计兑换码数据
    const redemptionCodes = await client.keys('redemption_code:*')
    let dailyRedemptionCount = 0
    let monthlyRedemptionCount = 0

    for (const codePath of redemptionCodes) {
      const codeData = await client.hgetall(codePath)
      if (codeData.type === 'daily') {
        dailyRedemptionCount++
      } else if (codeData.type === 'monthly') {
        monthlyRedemptionCount++
      }
    }

    return {
      apiKeys: {
        total: totalApiKeys,
        dailyCards: dailyCardCount,
        monthlyCards: monthlyCardCount,
        needsMigration: dailyCardCount + monthlyCardCount
      },
      redemptionCodes: {
        total: redemptionCodes.length,
        daily: dailyRedemptionCount,
        monthly: monthlyRedemptionCount
      }
    }
  }

  /**
   * 创建内置卡类型
   * @param {Object} migrationLogger 迁移日志记录器
   * @returns {Promise<Object>} 创建结果
   */
  async createBuiltinCardTypes(_migrationLogger = null) {
    try {
      // 检查是否已经存在内置卡类型
      const existingDaily = await cardTypeService.getCardType(cardTypeModel.BUILTIN_TYPES.DAILY)
      const existingMonthly = await cardTypeService.getCardType(cardTypeModel.BUILTIN_TYPES.MONTHLY)

      const results = []

      // 创建内置日卡
      if (!existingDaily) {
        const dailyCard = cardTypeModel.createBuiltinDaily()
        const dailyResult = await cardTypeService.createCardType(dailyCard)
        results.push({ type: 'daily', result: dailyResult })
        logger.info(`✅ 创建内置日卡: ${dailyResult.success ? '成功' : '失败'}`)
      } else {
        results.push({ type: 'daily', result: { success: true, skipped: true, message: '已存在' } })
        logger.info('ℹ️ 内置日卡已存在，跳过创建')
      }

      // 创建内置月卡
      if (!existingMonthly) {
        const monthlyCard = cardTypeModel.createBuiltinMonthly()
        const monthlyResult = await cardTypeService.createCardType(monthlyCard)
        results.push({ type: 'monthly', result: monthlyResult })
        logger.info(`✅ 创建内置月卡: ${monthlyResult.success ? '成功' : '失败'}`)
      } else {
        results.push({
          type: 'monthly',
          result: { success: true, skipped: true, message: '已存在' }
        })
        logger.info('ℹ️ 内置月卡已存在，跳过创建')
      }

      // 创建映射关系
      const mappings = {
        'daily-card': cardTypeModel.BUILTIN_TYPES.DAILY,
        'monthly-card': cardTypeModel.BUILTIN_TYPES.MONTHLY,
        daily: cardTypeModel.BUILTIN_TYPES.DAILY,
        monthly: cardTypeModel.BUILTIN_TYPES.MONTHLY
      }

      const client = redis.getClientSafe()
      await client.hset(this.LEGACY_MAPPINGS_KEY, mappings)

      return {
        success: true,
        cardTypes: results,
        mappings
      }
    } catch (error) {
      logger.error(`❌ 创建内置卡类型失败: ${error.message}`)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 迁移API Key数据
   * @param {Object} migrationLogger 迁移日志记录器
   * @param {function} progressCallback 进度回调函数
   * @returns {Promise<Object>} 迁移结果
   */
  async migrateApiKeyData(_migrationLogger = null, _progressCallback = null) {
    const client = redis.getClientSafe()
    const results = {
      processed: 0,
      migrated: 0,
      skipped: 0,
      errors: []
    }

    try {
      const mappings = await client.hgetall(this.LEGACY_MAPPINGS_KEY)
      const apiKeys = await client.keys('api_key:*')

      for (const keyPath of apiKeys) {
        if (keyPath === 'api_key:hash_map') {
          continue
        }

        results.processed++

        const keyData = await client.hgetall(keyPath)
        if (!keyData.tags) {
          results.skipped++
          continue
        }

        // 解析标签并检查是否包含日卡/月卡标签
        let tags = []
        try {
          if (typeof keyData.tags === 'string') {
            const trimmedTags = keyData.tags.trim()
            if (trimmedTags.startsWith('[') && trimmedTags.endsWith(']')) {
              tags = JSON.parse(trimmedTags)
            } else {
              tags = trimmedTags.split(',').map((tag) => tag.trim())
            }
          } else if (Array.isArray(keyData.tags)) {
            tags = [...keyData.tags]
          }
        } catch (error) {
          results.errors.push(`API Key ${keyPath}: 标签解析失败 - ${error.message}`)
          continue
        }

        let cardTypeId = null

        // 确定卡类型ID
        if (tags.includes('daily-card')) {
          cardTypeId = mappings['daily-card']
        } else if (tags.includes('monthly-card')) {
          cardTypeId = mappings['monthly-card']
        }

        if (cardTypeId) {
          // 添加cardTypeId字段
          keyData.cardTypeId = cardTypeId
          keyData.migrationSource = 'legacy-tags'
          keyData.migratedAt = new Date().toISOString()

          await client.hset(keyPath, keyData)
          results.migrated++

          logger.debug(
            `🔄 迁移API Key ${keyPath.replace('api_key:', '')}: 标签 ${tags.find((t) => t.includes('-card'))} -> 卡类型 ${cardTypeId}`
          )
        } else {
          results.skipped++
        }
      }

      return {
        success: true,
        ...results
      }
    } catch (error) {
      logger.error(`❌ 迁移API Key数据失败: ${error.message}`)
      return {
        success: false,
        error: error.message,
        ...results
      }
    }
  }

  /**
   * 迁移兑换码数据
   * @param {Object} migrationLogger 迁移日志记录器
   * @returns {Promise<Object>} 迁移结果
   */
  async migrateRedemptionData(_migrationLogger = null) {
    const client = redis.getClientSafe()
    const results = {
      processed: 0,
      migrated: 0,
      skipped: 0,
      errors: []
    }

    try {
      const mappings = await client.hgetall(this.LEGACY_MAPPINGS_KEY)
      const redemptionCodes = await client.keys('redemption_code:*')

      for (const codePath of redemptionCodes) {
        results.processed++

        const codeData = await client.hgetall(codePath)

        let cardTypeId = null
        if (codeData.type === 'daily') {
          cardTypeId = mappings['daily']
        } else if (codeData.type === 'monthly') {
          cardTypeId = mappings['monthly']
        }

        if (cardTypeId) {
          // 添加cardTypeId字段
          codeData.cardTypeId = cardTypeId
          codeData.migrationSource = 'legacy-type'
          codeData.migratedAt = new Date().toISOString()

          await client.hset(codePath, codeData)
          results.migrated++

          logger.debug(
            `🔄 迁移兑换码 ${codePath.replace('redemption_code:', '')}: 类型 ${codeData.type} -> 卡类型 ${cardTypeId}`
          )
        } else {
          results.skipped++
        }
      }

      return {
        success: true,
        ...results
      }
    } catch (error) {
      logger.error(`❌ 迁移兑换码数据失败: ${error.message}`)
      return {
        success: false,
        error: error.message,
        ...results
      }
    }
  }

  /**
   * 迁移策略绑定
   * @param {Object} migrationLogger 迁移日志记录器
   * @returns {Promise<Object>} 迁移结果
   */
  async migratePolicyBindings(_migrationLogger = null) {
    const results = {
      processed: 0,
      migrated: 0,
      skipped: 0,
      errors: []
    }

    try {
      // 这里主要是为策略系统准备卡类型的索引和映射
      // 具体的策略迁移将在后续的策略服务更新中处理

      const mappings = await redis.getClientSafe().hgetall(this.LEGACY_MAPPINGS_KEY)

      // 为新的卡类型创建策略索引
      for (const [legacyType, cardTypeId] of Object.entries(mappings)) {
        // 这里可以添加策略索引的创建逻辑
        logger.debug(`📋 为卡类型 ${cardTypeId} (${legacyType}) 准备策略索引`)
        results.processed++
        results.migrated++
      }

      return {
        success: true,
        ...results
      }
    } catch (error) {
      logger.error(`❌ 迁移策略绑定失败: ${error.message}`)
      return {
        success: false,
        error: error.message,
        ...results
      }
    }
  }

  /**
   * 获取迁移状态
   * @returns {Promise<Object>} 迁移状态
   */
  async getMigrationStatus() {
    try {
      const client = redis.getClientSafe()
      const status = await client.hgetall(this.MIGRATION_STATUS_KEY)

      if (!status || Object.keys(status).length === 0) {
        return {
          isCompleted: false,
          message: '尚未开始迁移'
        }
      }

      // 解析JSON字段
      if (status.results) {
        status.results = JSON.parse(status.results)
      }

      status.isCompleted = status.isCompleted === 'true'

      return status
    } catch (error) {
      logger.error(`❌ 获取迁移状态失败: ${error.message}`)
      return {
        isCompleted: false,
        error: error.message
      }
    }
  }

  /**
   * 更新迁移状态
   * @param {Object} status 迁移状态
   * @returns {Promise<void>}
   */
  async updateMigrationStatus(status) {
    try {
      const client = redis.getClientSafe()

      const statusData = {
        ...status,
        isCompleted: status.isCompleted.toString(),
        results: JSON.stringify(status.results)
      }

      await client.hset(this.MIGRATION_STATUS_KEY, statusData)
      await client.expire(this.MIGRATION_STATUS_KEY, 86400 * 30) // 30天过期
    } catch (error) {
      logger.error(`❌ 更新迁移状态失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 记录迁移错误
   * @param {string} migrationId 迁移ID
   * @param {Error} error 错误对象
   * @returns {Promise<void>}
   */
  async logMigrationError(migrationId, error) {
    try {
      const client = redis.getClientSafe()
      const logKey = `${this.MIGRATION_LOG_PREFIX}${migrationId}`

      const errorLog = {
        migrationId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }

      await client.hset(logKey, errorLog)
      await client.expire(logKey, 86400 * 7) // 7天过期
    } catch (logError) {
      logger.error(`❌ 记录迁移错误失败: ${logError.message}`)
    }
  }

  /**
   * 生成预览结果
   */
  async generatePreviewResult(analysisResult, migrationLogger) {
    const _mappings = {
      'daily-card': cardTypeModel.BUILTIN_TYPES.DAILY,
      'monthly-card': cardTypeModel.BUILTIN_TYPES.MONTHLY
    }

    migrationLogger.info('生成迁移预览')

    return {
      success: true,
      type: 'preview',
      builtinTypes: {
        daily: '将创建',
        monthly: '将创建'
      },
      estimatedChanges: {
        apiKeys: analysisResult.apiKeys.needsMigration,
        redemptionCodes:
          analysisResult.redemptionCodes.daily + analysisResult.redemptionCodes.monthly
      },
      analysis: analysisResult
    }
  }

  /**
   * 验证迁移结果
   */
  async validateMigrationResults(migrationId, migrationLogger) {
    migrationLogger.info('开始验证迁移结果')

    try {
      const client = redis.getClientSafe()

      // 验证内置类型
      const dailyCardExists = await cardTypeService.getCardType(cardTypeModel.BUILTIN_TYPES.DAILY)
      const monthlyCardExists = await cardTypeService.getCardType(
        cardTypeModel.BUILTIN_TYPES.MONTHLY
      )

      // 验证数据一致性
      const apiKeys = await client.keys('api_key:*')
      let migratedApiKeys = 0
      let unmigrated = 0

      for (const keyPath of apiKeys) {
        if (keyPath === 'api_key:hash_map') {
          continue
        }

        const keyData = await client.hgetall(keyPath)
        if (keyData.cardTypeId) {
          migratedApiKeys++
        } else if (
          keyData.tags &&
          (keyData.tags.includes('daily-card') || keyData.tags.includes('monthly-card'))
        ) {
          unmigrated++
        }
      }

      const validationResult = {
        migrationStatus: {
          isCompleted: true,
          endTime: new Date().toISOString()
        },
        builtinTypes: {
          daily: {
            exists: !!dailyCardExists,
            valid: !!dailyCardExists
          },
          monthly: {
            exists: !!monthlyCardExists,
            valid: !!monthlyCardExists
          }
        },
        dataConsistency: {
          apiKeys: {
            total: apiKeys.length - 1, // 减去 hash_map
            migratedApiKeys,
            needsMigration: unmigrated
          }
        },
        recommendations: unmigrated > 0 ? [`还有 ${unmigrated} 个API Key未完成迁移`] : []
      }

      migrationLogger.info('验证完成', validationResult)
      return validationResult
    } catch (error) {
      migrationLogger.logError(error, { step: '验证迁移结果' })
      throw error
    }
  }

  /**
   * 计算成功率
   */
  calculateSuccessRate(apiKeyResult, redemptionResult) {
    const totalProcessed = (apiKeyResult.processed || 0) + (redemptionResult.processed || 0)
    const totalSucceeded = (apiKeyResult.migrated || 0) + (redemptionResult.migrated || 0)

    if (totalProcessed === 0) {
      return 0
    }
    return Math.round((totalSucceeded / totalProcessed) * 100)
  }

  /**
   * 新增：分析数据的方法，支持日志记录
   */
  async analyzeData() {
    const analysisId = `analysis-${Date.now()}`
    const migrationLogger = migrationLoggerManager.getLogger(analysisId, {
      logLevel: 'info',
      enableConsole: false,
      enableFile: false
    })

    try {
      migrationLogger.startMigration({ type: 'analysis' })
      const result = await this.analyzeExistingData(migrationLogger)
      migrationLogger.endMigration('completed', result)

      setTimeout(() => {
        migrationLoggerManager.removeLogger(analysisId)
      }, 1000)

      return result
    } catch (error) {
      if (migrationLogger.logError) {
        migrationLogger.logError(error)
      }
      migrationLogger.endMigration('failed', { error: error.message })
      throw error
    }
  }

  /**
   * 新增：回滚迁移的增强版本
   */
  async rollbackMigration(options = {}) {
    const { confirm } = options
    const rollbackId = uuidv4()

    // 创建回滚专用日志记录器
    const migrationLogger = migrationLoggerManager.getLogger(rollbackId, {
      logLevel: 'info',
      metadata: { type: 'rollback' }
    })

    migrationLogger.startMigration({ type: 'rollback', confirm })

    if (confirm !== 'CONFIRM_ROLLBACK') {
      const error = new Error('回滚操作需要确认参数')
      migrationLogger.logError(error)
      migrationLogger.endMigration('cancelled', { reason: '缺少确认参数' })
      await migrationLoggerManager.removeLogger(rollbackId)
      return {
        success: false,
        error: '回滚操作需要确认参数: CONFIRM_ROLLBACK'
      }
    }

    logger.warn('⚠️ 开始回滚卡类型迁移...')

    try {
      // 初始化进度跟踪
      await migrationProgressService.startTracking(rollbackId, {
        type: 'rollback',
        totalSteps: 4,
        metadata: { confirm }
      })

      const client = redis.getClientSafe()

      migrationLogger.info('开始回滚操作')
      await migrationProgressService.updateProgress(rollbackId, { currentStep: 1 })

      // 获取映射关系
      const mappings = await client.hgetall(this.LEGACY_MAPPINGS_KEY)
      migrationLogger.info('获取映射关系', { mappings })

      // 回滚API Key数据
      migrationLogger.info('开始回滚API Key数据')
      const apiKeys = await client.keys('api_key:*')
      let rollbackCount = 0

      for (const keyPath of apiKeys) {
        if (keyPath === 'api_key:hash_map') {
          continue
        }

        const keyData = await client.hgetall(keyPath)
        if (keyData.cardTypeId && keyData.migrationSource === 'legacy-tags') {
          await client.hdel(keyPath, 'cardTypeId', 'migrationSource', 'migratedAt')
          rollbackCount++
          migrationLogger.recordProcessed(keyPath, 'rollback_api_key', 'success')
        }
      }

      await migrationProgressService.updateProgress(rollbackId, {
        currentStep: 2,
        processedRecords: rollbackCount
      })

      // 回滚兑换码数据
      migrationLogger.info('开始回滚兑换码数据')
      const redemptionCodes = await client.keys('redemption_code:*')

      for (const codePath of redemptionCodes) {
        const codeData = await client.hgetall(codePath)
        if (codeData.cardTypeId && codeData.migrationSource === 'legacy-type') {
          await client.hdel(codePath, 'cardTypeId', 'migrationSource', 'migratedAt')
          rollbackCount++
          migrationLogger.recordProcessed(codePath, 'rollback_redemption', 'success')
        }
      }

      await migrationProgressService.updateProgress(rollbackId, { currentStep: 3 })

      // 清除迁移状态
      await client.del(this.MIGRATION_STATUS_KEY, this.LEGACY_MAPPINGS_KEY)
      migrationLogger.info('清除迁移状态完成')

      await migrationProgressService.updateProgress(rollbackId, { currentStep: 4 })

      // 完成回滚
      await migrationProgressService.completeTracking(rollbackId, 'completed', {
        rollbackCount,
        totalProcessed: rollbackCount
      })

      migrationLogger.endMigration('completed', { rollbackCount })

      logger.info(`✅ 迁移回滚完成，影响 ${rollbackCount} 条记录`)

      // 清理日志记录器
      setTimeout(() => {
        migrationLoggerManager.removeLogger(rollbackId)
      }, 5000)

      return {
        success: true,
        rollbackCount,
        message: '迁移已成功回滚'
      }
    } catch (error) {
      logger.error(`❌ 迁移回滚失败: ${error.message}`)

      migrationLogger.logError(error, { step: '回滚执行' })
      migrationLogger.endMigration('failed', { error: error.message })

      try {
        await migrationProgressService.completeTracking(rollbackId, 'failed', {
          error: error.message
        })
      } catch (progressError) {
        logger.warn('Failed to update rollback progress on error:', progressError)
      }

      setTimeout(() => {
        migrationLoggerManager.removeLogger(rollbackId)
      }, 5000)

      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 验证迁移状态的公开方法
   */
  async validateMigration() {
    const validationId = `validation-${Date.now()}`
    const migrationLogger = migrationLoggerManager.getLogger(validationId, {
      logLevel: 'info',
      enableConsole: false
    })

    try {
      migrationLogger.startMigration({ type: 'validation' })
      const result = await this.validateMigrationResults(validationId, migrationLogger)
      migrationLogger.endMigration('completed', result)

      setTimeout(() => {
        migrationLoggerManager.removeLogger(validationId)
      }, 1000)

      return result
    } catch (error) {
      migrationLogger.logError(error)
      migrationLogger.endMigration('failed', { error: error.message })
      throw error
    }
  }

  /**
   * 回滚迁移（紧急情况使用）- 保持向后兼容
   * @returns {Promise<Object>} 回滚结果
   */
  async rollbackMigrationLegacy() {
    logger.warn('⚠️ 开始回滚卡类型迁移...')

    try {
      const client = redis.getClientSafe()

      // 获取映射关系
      const mappings = await client.hgetall(this.LEGACY_MAPPINGS_KEY)
      const _cardTypeIds = Object.values(mappings)

      // 移除API Key中的cardTypeId字段
      const apiKeys = await client.keys('api_key:*')
      let rollbackCount = 0

      for (const keyPath of apiKeys) {
        if (keyPath === 'api_key:hash_map') {
          continue
        }

        const keyData = await client.hgetall(keyPath)
        if (keyData.cardTypeId && keyData.migrationSource === 'legacy-tags') {
          await client.hdel(keyPath, 'cardTypeId', 'migrationSource', 'migratedAt')
          rollbackCount++
        }
      }

      // 移除兑换码中的cardTypeId字段
      const redemptionCodes = await client.keys('redemption_code:*')

      for (const codePath of redemptionCodes) {
        const codeData = await client.hgetall(codePath)
        if (codeData.cardTypeId && codeData.migrationSource === 'legacy-type') {
          await client.hdel(codePath, 'cardTypeId', 'migrationSource', 'migratedAt')
          rollbackCount++
        }
      }

      // 删除内置卡类型（可选，需要谨慎）
      // await cardTypeService.deleteCardType(cardTypeModel.BUILTIN_TYPES.DAILY)
      // await cardTypeService.deleteCardType(cardTypeModel.BUILTIN_TYPES.MONTHLY)

      // 清除迁移状态
      await client.del(this.MIGRATION_STATUS_KEY, this.LEGACY_MAPPINGS_KEY)

      logger.success(`✅ 迁移回滚完成，影响 ${rollbackCount} 条记录`)

      return {
        success: true,
        rollbackCount,
        message: '迁移已成功回滚'
      }
    } catch (error) {
      logger.error(`❌ 迁移回滚失败: ${error.message}`)
      return {
        success: false,
        error: error.message
      }
    }
  }
}

module.exports = new CardTypeMigrationService()
