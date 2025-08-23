const express = require('express')
const cardTypeMigrationService = require('../services/cardTypeMigrationService')
const cardTypeService = require('../services/cardTypeService')
const { authenticateAdmin } = require('../middleware/auth')
const logger = require('../utils/logger')

const router = express.Router()

// ==================== 迁移状态管理 ====================

/**
 * GET /admin/card-types/migration/status
 * 获取迁移状态
 */
router.get('/status', authenticateAdmin, async (req, res) => {
  try {
    const status = await cardTypeMigrationService.getMigrationStatus()

    logger.info('📊 管理员查看迁移状态')

    res.json({
      success: true,
      data: status
    })
  } catch (error) {
    logger.error('❌ 获取迁移状态失败:', error)
    res.status(500).json({
      success: false,
      message: '获取迁移状态失败',
      error: error.message
    })
  }
})

/**
 * POST /admin/card-types/migration/analyze
 * 分析现有硬编码数据
 */
router.post('/analyze', authenticateAdmin, async (req, res) => {
  try {
    const analysis = await cardTypeMigrationService.analyzeExistingData()

    logger.info('🔍 管理员执行迁移数据分析')

    res.json({
      success: true,
      data: analysis,
      message: '数据分析完成'
    })
  } catch (error) {
    logger.error('❌ 迁移数据分析失败:', error)
    res.status(500).json({
      success: false,
      message: '迁移数据分析失败',
      error: error.message
    })
  }
})

// ==================== 迁移执行 ====================

/**
 * POST /admin/card-types/migration/execute
 * 执行完整迁移流程
 */
router.post('/execute', authenticateAdmin, async (req, res) => {
  try {
    const { dryRun } = req.body

    if (dryRun) {
      // 仅分析不执行
      const analysis = await cardTypeMigrationService.analyzeExistingData()

      // 检查内置类型是否存在
      const dailyExists = await cardTypeService.getCardType('builtin_daily')
      const monthlyExists = await cardTypeService.getCardType('builtin_monthly')

      const preview = {
        analysis,
        builtinTypes: {
          daily: dailyExists ? '已存在' : '将创建',
          monthly: monthlyExists ? '已存在' : '将创建'
        },
        estimatedChanges: {
          apiKeys: analysis.apiKeys.needsMigration,
          redemptionCodes: analysis.redemptionCodes.daily + analysis.redemptionCodes.monthly
        }
      }

      logger.info('🧪 管理员执行迁移预览')

      return res.json({
        success: true,
        data: preview,
        message: '迁移预览完成（未实际执行）'
      })
    }

    // 执行实际迁移
    logger.warn(`⚠️ 管理员 ${req.admin?.username} 开始执行卡类型系统迁移`)

    const result = await cardTypeMigrationService.executeMigration()

    if (result.success) {
      logger.success(`✅ 迁移执行成功，耗时: ${result.duration}ms`)

      res.json({
        success: true,
        data: result,
        message: result.skipped ? '迁移已完成（跳过重复迁移）' : '迁移执行成功'
      })
    } else {
      logger.error(`❌ 迁移执行失败: ${result.error}`)

      res.status(500).json({
        success: false,
        message: '迁移执行失败',
        error: result.error,
        migrationId: result.migrationId
      })
    }
  } catch (error) {
    logger.error('❌ 迁移执行过程中发生错误:', error)
    res.status(500).json({
      success: false,
      message: '迁移执行过程中发生错误',
      error: error.message
    })
  }
})

/**
 * POST /admin/card-types/migration/create-builtin
 * 仅创建内置卡类型
 */
router.post('/create-builtin', authenticateAdmin, async (req, res) => {
  try {
    const result = await cardTypeMigrationService.createBuiltinCardTypes()

    if (result.success) {
      logger.info('✅ 管理员创建内置卡类型成功')

      res.json({
        success: true,
        data: result,
        message: '内置卡类型创建成功'
      })
    } else {
      res.status(400).json({
        success: false,
        message: '内置卡类型创建失败',
        error: result.error
      })
    }
  } catch (error) {
    logger.error('❌ 创建内置卡类型失败:', error)
    res.status(500).json({
      success: false,
      message: '创建内置卡类型失败',
      error: error.message
    })
  }
})

// ==================== 迁移回滚 ====================

/**
 * POST /admin/card-types/migration/rollback
 * 回滚迁移（危险操作）
 */
router.post('/rollback', authenticateAdmin, async (req, res) => {
  try {
    const { confirm } = req.body

    if (confirm !== 'CONFIRM_ROLLBACK') {
      return res.status(400).json({
        success: false,
        message: '回滚操作需要明确确认，请在请求体中包含 { "confirm": "CONFIRM_ROLLBACK" }'
      })
    }

    logger.warn(`⚠️ 管理员 ${req.admin?.username} 开始回滚卡类型迁移`)

    const result = await cardTypeMigrationService.rollbackMigration()

    if (result.success) {
      logger.warn(`⚠️ 迁移回滚成功，影响 ${result.rollbackCount} 条记录`)

      res.json({
        success: true,
        data: result,
        message: '迁移回滚成功'
      })
    } else {
      res.status(500).json({
        success: false,
        message: '迁移回滚失败',
        error: result.error
      })
    }
  } catch (error) {
    logger.error('❌ 迁移回滚失败:', error)
    res.status(500).json({
      success: false,
      message: '迁移回滚失败',
      error: error.message
    })
  }
})

// ==================== 迁移验证 ====================

/**
 * GET /admin/card-types/migration/validate
 * 验证迁移结果
 */
router.get('/validate', authenticateAdmin, async (req, res) => {
  try {
    // 获取迁移状态
    const migrationStatus = await cardTypeMigrationService.getMigrationStatus()

    // 检查内置卡类型
    const dailyCardType = await cardTypeService.getCardType('builtin_daily')
    const monthlyCardType = await cardTypeService.getCardType('builtin_monthly')

    // 分析数据一致性
    const currentAnalysis = await cardTypeMigrationService.analyzeExistingData()

    const validation = {
      migrationStatus,
      builtinTypes: {
        daily: {
          exists: !!dailyCardType,
          valid: dailyCardType
            ? dailyCardType.isBuiltIn && dailyCardType.category === 'daily'
            : false
        },
        monthly: {
          exists: !!monthlyCardType,
          valid: monthlyCardType
            ? monthlyCardType.isBuiltIn && monthlyCardType.category === 'monthly'
            : false
        }
      },
      dataConsistency: currentAnalysis,
      recommendations: []
    }

    // 生成建议
    if (!migrationStatus.isCompleted) {
      validation.recommendations.push('迁移尚未完成，建议执行迁移')
    }

    if (!validation.builtinTypes.daily.exists || !validation.builtinTypes.monthly.exists) {
      validation.recommendations.push('内置卡类型不完整，建议重新创建')
    }

    if (currentAnalysis.apiKeys.needsMigration > 0) {
      validation.recommendations.push(
        `仍有 ${currentAnalysis.apiKeys.needsMigration} 个API Key需要迁移`
      )
    }

    logger.info('🔍 管理员验证迁移结果')

    res.json({
      success: true,
      data: validation
    })
  } catch (error) {
    logger.error('❌ 验证迁移结果失败:', error)
    res.status(500).json({
      success: false,
      message: '验证迁移结果失败',
      error: error.message
    })
  }
})

// ==================== 迁移日志 ====================

/**
 * GET /admin/card-types/migration/logs
 * 获取迁移日志
 */
router.get('/logs', authenticateAdmin, async (req, res) => {
  try {
    const { migrationId, limit: _limit = 100 } = req.query

    // 这里可以实现日志查询逻辑
    // 由于迁移日志存储在Redis中，需要扩展服务来支持日志查询

    // 暂时返回基本信息
    const logs = {
      message: '迁移日志功能开发中',
      migrationId,
      available: false
    }

    res.json({
      success: true,
      data: logs
    })
  } catch (error) {
    logger.error('❌ 获取迁移日志失败:', error)
    res.status(500).json({
      success: false,
      message: '获取迁移日志失败',
      error: error.message
    })
  }
})

// ==================== 迁移工具状态 ====================

/**
 * GET /admin/card-types/migration/info
 * 获取迁移工具信息
 */
router.get('/info', authenticateAdmin, async (req, res) => {
  try {
    const cardTypeModel = require('../models/cardTypeModel')

    const info = {
      version: '1.0.0',
      builtinTypes: {
        daily: cardTypeModel.BUILTIN_TYPES.DAILY,
        monthly: cardTypeModel.BUILTIN_TYPES.MONTHLY
      },
      categories: Object.values(cardTypeModel.CATEGORIES),
      pricingStandard: '$1 = 100万TOKENS',
      toleranceRate: '10%',
      supportedMigrations: [
        'API Key标签 -> cardTypeId字段',
        '兑换码类型 -> cardTypeId字段',
        '策略绑定更新'
      ]
    }

    res.json({
      success: true,
      data: info
    })
  } catch (error) {
    logger.error('❌ 获取迁移工具信息失败:', error)
    res.status(500).json({
      success: false,
      message: '获取迁移工具信息失败',
      error: error.message
    })
  }
})

module.exports = router
