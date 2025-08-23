const express = require('express')
const cardTypeService = require('../services/cardTypeService')
const rateTemplateService = require('../services/rateTemplateService')
const { authenticateAdmin } = require('../middleware/auth')
const {
  successResponse,
  errorResponse,
  paginatedResponse: _paginatedResponse,
  validationResponse: _validationResponse,
  statsResponse: _statsResponse
} = require('../middleware/responseFormatter')
const logger = require('../utils/logger')

const router = express.Router()

// ==================== 卡类型基础CRUD操作 ====================

/**
 * GET /admin/card-types
 * 获取所有卡类型列表
 */
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { category, status, includeInactive } = req.query

    const options = {
      category: category || null,
      status: status || null,
      includeInactive: includeInactive === 'true'
    }

    const cardTypes = await cardTypeService.getCardTypes(options)

    logger.info(`📋 管理员获取卡类型列表: 返回 ${cardTypes.length} 条记录`)

    res.json(
      successResponse(cardTypes, null, {
        total: cardTypes.length,
        filters: options
      })
    )
  } catch (error) {
    logger.error('❌ 获取卡类型列表失败:', error)
    res.status(500).json(errorResponse('获取卡类型列表失败', error.message))
  }
})

/**
 * GET /admin/card-types/:id/stats
 * 获取卡类型使用统计
 */
router.get('/:id/stats', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const stats = await cardTypeService.getCardTypeStats(id)

    logger.info(`📊 管理员获取卡类型统计: ${id}`)

    res.json(successResponse(stats))
  } catch (error) {
    logger.error('❌ 获取卡类型统计失败:', error)
    res.status(500).json(errorResponse('获取卡类型统计失败', error.message))
  }
})

/**
 * GET /admin/card-types/:id
 * 获取单个卡类型详情
 */
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { includeRecommendations, includeUsageStats } = req.query

    const cardType = await cardTypeService.getCardType(id)

    if (!cardType) {
      return res.status(404).json({
        success: false,
        message: '卡类型不存在'
      })
    }

    // 扩展信息
    const result = { ...cardType }

    // 包含模版推荐
    if (includeRecommendations === 'true') {
      result.templateRecommendations =
        await rateTemplateService.recommendTemplatesForCardType(cardType)
    }

    // 包含使用统计
    if (includeUsageStats === 'true') {
      result.usageStats = await cardTypeService.getCardTypeUsageStats(id)
    }

    logger.info(`📋 管理员获取卡类型详情: ${id}`)

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error(`❌ 获取卡类型详情失败: ${req.params.id}`, error)
    res.status(500).json({
      success: false,
      message: '获取卡类型详情失败',
      error: error.message
    })
  }
})

/**
 * POST /admin/card-types
 * 创建新的卡类型
 */
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const cardTypeData = {
      ...req.body,
      createdBy: req.admin?.username || 'admin',
      isBuiltIn: false // 管理员创建的都不是内置类型
    }

    const result = await cardTypeService.createCardType(cardTypeData)

    if (result.success) {
      logger.info(`✅ 管理员创建卡类型成功: ${result.data.name} (${result.data.id})`)

      res.status(201).json({
        success: true,
        data: result.data,
        message: '卡类型创建成功'
      })
    } else {
      logger.warn(`⚠️ 管理员创建卡类型失败: ${result.error}`)

      res.status(400).json({
        success: false,
        message: result.error,
        details: result.details
      })
    }
  } catch (error) {
    logger.error('❌ 创建卡类型失败:', error)
    res.status(500).json({
      success: false,
      message: '创建卡类型失败',
      error: error.message
    })
  }
})

/**
 * PUT /admin/card-types/:id
 * 更新现有卡类型
 */
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    let updateData = {
      ...req.body,
      updatedBy: req.admin?.username || 'admin'
    }

    // 不允许修改内置类型的核心属性
    const existingCardType = await cardTypeService.getCardType(id)
    if (!existingCardType) {
      return res.status(404).json({
        success: false,
        message: '卡类型不存在'
      })
    }

    if (existingCardType.isBuiltIn) {
      // 内置类型只允许修改某些字段
      const allowedFields = ['description', 'rateTemplateId', 'customRates', 'isActive']
      const filteredUpdate = {}

      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          filteredUpdate[field] = updateData[field]
        }
      }

      updateData = { ...filteredUpdate, updatedBy: updateData.updatedBy }

      logger.info(`🔒 内置卡类型更新: ${id}, 仅允许字段: ${Object.keys(filteredUpdate).join(', ')}`)
    }

    const result = await cardTypeService.updateCardType(id, updateData)

    if (result.success) {
      logger.info(`✅ 管理员更新卡类型成功: ${id}`)

      res.json({
        success: true,
        data: result.data,
        message: '卡类型更新成功'
      })
    } else {
      logger.warn(`⚠️ 管理员更新卡类型失败: ${result.error}`)

      res.status(400).json({
        success: false,
        message: result.error,
        details: result.details
      })
    }
  } catch (error) {
    logger.error(`❌ 更新卡类型失败: ${req.params.id}`, error)
    res.status(500).json({
      success: false,
      message: '更新卡类型失败',
      error: error.message
    })
  }
})

/**
 * DELETE /admin/card-types/:id
 * 删除卡类型（软删除）
 */
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { force } = req.query

    // 检查是否为内置类型
    const existingCardType = await cardTypeService.getCardType(id)
    if (!existingCardType) {
      return res.status(404).json({
        success: false,
        message: '卡类型不存在'
      })
    }

    if (existingCardType.isBuiltIn && force !== 'true') {
      return res.status(403).json({
        success: false,
        message: '不能删除内置卡类型，如需强制删除请使用 ?force=true 参数'
      })
    }

    // 检查使用情况
    const usageStats = await cardTypeService.getCardTypeUsageStats(id)
    if (usageStats.total > 0 && force !== 'true') {
      return res.status(409).json({
        success: false,
        message: '该卡类型正在使用中，无法删除',
        usageStats,
        hint: '如需强制删除请使用 ?force=true 参数'
      })
    }

    const result = await cardTypeService.deleteCardType(id)

    if (result.success) {
      logger.warn(
        `⚠️ 管理员删除卡类型: ${existingCardType.name} (${id}), force=${force === 'true'}`
      )

      res.json({
        success: true,
        message: result.message
      })
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      })
    }
  } catch (error) {
    logger.error(`❌ 删除卡类型失败: ${req.params.id}`, error)
    res.status(500).json({
      success: false,
      message: '删除卡类型失败',
      error: error.message
    })
  }
})

// ==================== 卡类型状态管理 ====================

/**
 * POST /admin/card-types/:id/activate
 * 激活卡类型
 */
router.post('/:id/activate', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const result = await cardTypeService.updateCardType(id, {
      isActive: true,
      updatedBy: req.admin?.username || 'admin'
    })

    if (result.success) {
      logger.info(`✅ 管理员激活卡类型: ${id}`)
      res.json({
        success: true,
        message: '卡类型已激活'
      })
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      })
    }
  } catch (error) {
    logger.error(`❌ 激活卡类型失败: ${req.params.id}`, error)
    res.status(500).json({
      success: false,
      message: '激活卡类型失败',
      error: error.message
    })
  }
})

/**
 * POST /admin/card-types/:id/deactivate
 * 停用卡类型
 */
router.post('/:id/deactivate', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const result = await cardTypeService.updateCardType(id, {
      isActive: false,
      updatedBy: req.admin?.username || 'admin'
    })

    if (result.success) {
      logger.info(`⚠️ 管理员停用卡类型: ${id}`)
      res.json({
        success: true,
        message: '卡类型已停用'
      })
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      })
    }
  } catch (error) {
    logger.error(`❌ 停用卡类型失败: ${req.params.id}`, error)
    res.status(500).json({
      success: false,
      message: '停用卡类型失败',
      error: error.message
    })
  }
})

// ==================== 卡类型模版管理 ====================

/**
 * GET /admin/card-types/:id/templates
 * 获取卡类型的模版推荐
 */
router.get('/:id/templates', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const cardType = await cardTypeService.getCardType(id)
    if (!cardType) {
      return res.status(404).json({
        success: false,
        message: '卡类型不存在'
      })
    }

    const recommendations = await rateTemplateService.recommendTemplatesForCardType(cardType)

    res.json({
      success: true,
      data: recommendations
    })
  } catch (error) {
    logger.error(`❌ 获取卡类型模版推荐失败: ${req.params.id}`, error)
    res.status(500).json({
      success: false,
      message: '获取模版推荐失败',
      error: error.message
    })
  }
})

/**
 * POST /admin/card-types/:id/templates/:templateId
 * 为卡类型设置计费模版
 */
router.post('/:id/templates/:templateId', authenticateAdmin, async (req, res) => {
  try {
    const { id, templateId } = req.params

    // 验证模版是否存在
    const template = await rateTemplateService.getTemplate(templateId)
    if (!template) {
      return res.status(404).json({
        success: false,
        message: '计费模版不存在'
      })
    }

    const result = await cardTypeService.updateCardType(id, {
      rateTemplateId: templateId,
      updatedBy: req.admin?.username || 'admin'
    })

    if (result.success) {
      logger.info(`✅ 管理员为卡类型设置模版: ${id} -> ${templateId}`)
      res.json({
        success: true,
        message: '计费模版设置成功',
        data: result.data
      })
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      })
    }
  } catch (error) {
    logger.error(`❌ 设置卡类型模版失败: ${req.params.id} -> ${req.params.templateId}`, error)
    res.status(500).json({
      success: false,
      message: '设置计费模版失败',
      error: error.message
    })
  }
})

/**
 * DELETE /admin/card-types/:id/templates
 * 移除卡类型的计费模版
 */
router.delete('/:id/templates', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const result = await cardTypeService.updateCardType(id, {
      rateTemplateId: null,
      updatedBy: req.admin?.username || 'admin'
    })

    if (result.success) {
      logger.info(`✅ 管理员移除卡类型模版: ${id}`)
      res.json({
        success: true,
        message: '计费模版已移除'
      })
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      })
    }
  } catch (error) {
    logger.error(`❌ 移除卡类型模版失败: ${req.params.id}`, error)
    res.status(500).json({
      success: false,
      message: '移除计费模版失败',
      error: error.message
    })
  }
})

// ==================== 卡类型统计分析 ====================

/**
 * GET /admin/card-types/stats/overview
 * 获取卡类型系统总览统计
 */
router.get('/stats/overview', authenticateAdmin, async (req, res) => {
  try {
    const overview = await cardTypeService.getSystemOverview()

    logger.info('📊 管理员获取卡类型系统总览')

    res.json({
      success: true,
      data: overview
    })
  } catch (error) {
    logger.error('❌ 获取卡类型系统总览失败:', error)
    res.status(500).json({
      success: false,
      message: '获取系统总览失败',
      error: error.message
    })
  }
})

/**
 * GET /admin/card-types/:id/stats
 * 获取单个卡类型的使用统计
 */
router.get('/:id/stats', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { period } = req.query // daily, weekly, monthly

    const stats = await cardTypeService.getCardTypeUsageStats(id, period)

    res.json({
      success: true,
      data: stats
    })
  } catch (error) {
    logger.error(`❌ 获取卡类型统计失败: ${req.params.id}`, error)
    res.status(500).json({
      success: false,
      message: '获取卡类型统计失败',
      error: error.message
    })
  }
})

// ==================== 批量操作 ====================

/**
 * POST /admin/card-types/batch-edit
 * 批量编辑卡类型
 */
router.post('/batch-edit', authenticateAdmin, async (req, res) => {
  try {
    const { cardTypeIds, changes } = req.body

    if (!cardTypeIds || !Array.isArray(cardTypeIds) || cardTypeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供要编辑的卡类型ID列表'
      })
    }

    const result = await cardTypeService.batchEditCardTypes(
      cardTypeIds,
      changes,
      req.admin?.username || 'admin'
    )

    if (result.success) {
      logger.info(
        `✅ 管理员批量编辑卡类型: 处理 ${cardTypeIds.length} 个，成功 ${result.updated} 个`
      )

      res.json({
        success: true,
        data: {
          total: cardTypeIds.length,
          updated: result.updated,
          skipped: result.skipped,
          errors: result.errors
        },
        message: `批量编辑完成，成功更新 ${result.updated} 个卡类型`
      })
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      })
    }
  } catch (error) {
    logger.error('❌ 批量编辑卡类型失败:', error)
    res.status(500).json({
      success: false,
      message: '批量编辑失败',
      error: error.message
    })
  }
})

/**
 * GET /admin/card-types/export
 * 导出卡类型数据
 */
router.get('/export', authenticateAdmin, async (req, res) => {
  try {
    const { scope, format, fields, ids, preview, limit } = req.query

    const options = {
      scope: scope || 'all',
      format: format || 'json',
      fields: fields ? fields.split(',') : null,
      ids: ids ? ids.split(',') : null,
      preview: preview === 'true',
      limit: preview ? parseInt(limit) || 5 : null
    }

    const result = await cardTypeService.exportCardTypes(options)

    if (options.preview) {
      // 预览模式，直接返回文本
      res.set('Content-Type', 'text/plain')
      res.send(result.data)
    } else {
      // 下载模式
      const filename = `card-types-${new Date().toISOString().split('T')[0]}.${options.format}`

      res.set({
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache'
      })

      res.send(result.data)
    }

    logger.info(
      `📤 管理员导出卡类型: 格式=${options.format}, 范围=${options.scope}, 预览=${options.preview}`
    )
  } catch (error) {
    logger.error('❌ 导出卡类型失败:', error)
    res.status(500).json({
      success: false,
      message: '导出失败',
      error: error.message
    })
  }
})

/**
 * POST /admin/card-types/import
 * 导入卡类型数据
 */
router.post('/import', authenticateAdmin, async (req, res) => {
  try {
    const multer = require('multer')
    const upload = multer({ storage: multer.memoryStorage() })

    // 处理文件上传
    upload.single('file')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: '文件上传失败',
          error: err.message
        })
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: '请选择要导入的文件'
        })
      }

      const options = {
        mode: req.body.mode || 'upsert',
        conflictResolution: req.body.conflictResolution || 'rename',
        validateOnly: req.body.validateOnly === 'true',
        createdBy: req.admin?.username || 'admin'
      }

      const result = await cardTypeService.importCardTypes(req.file, options)

      logger.info(
        `📥 管理员导入卡类型: 模式=${options.mode}, 验证=${options.validateOnly}, 结果=${result.success ? '成功' : '失败'}`
      )

      res.json(result)
    })
  } catch (error) {
    logger.error('❌ 导入卡类型失败:', error)
    res.status(500).json({
      success: false,
      message: '导入失败',
      error: error.message
    })
  }
})

// ==================== 卡类型验证和测试 ====================

/**
 * POST /admin/card-types/validate
 * 验证卡类型配置
 */
router.post('/validate', authenticateAdmin, async (req, res) => {
  try {
    const cardTypeModel = require('../models/cardTypeModel')

    const validation = cardTypeModel.validate(req.body)

    res.json({
      success: true,
      data: validation
    })
  } catch (error) {
    logger.error('❌ 验证卡类型配置失败:', error)
    res.status(500).json({
      success: false,
      message: '验证卡类型配置失败',
      error: error.message
    })
  }
})

/**
 * POST /admin/card-types/preview
 * 预览卡类型配置效果
 */
router.post('/preview', authenticateAdmin, async (req, res) => {
  try {
    const cardTypeModel = require('../models/cardTypeModel')

    // 创建预览对象（不保存）
    const previewCardType = cardTypeModel.create(req.body)
    const validation = cardTypeModel.validate(previewCardType)

    // 计算预览信息
    const preview = {
      cardType: previewCardType,
      validation,
      pricing: {
        tokensPerDollar: previewCardType.totalTokens / previewCardType.priceUsd,
        dailyValue: previewCardType.dailyTokens
          ? (previewCardType.dailyTokens / 1000000) * 0.015
          : null,
        totalValue: (previewCardType.totalTokens / 1000000) * 0.015
      }
    }

    res.json({
      success: true,
      data: preview
    })
  } catch (error) {
    logger.error('❌ 预览卡类型配置失败:', error)
    res.status(500).json({
      success: false,
      message: '预览卡类型配置失败',
      error: error.message
    })
  }
})

module.exports = router
