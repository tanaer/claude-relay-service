#!/usr/bin/env node

/**
 * 测试兑换码功能脚本
 * 用于验证兑换码的搜索、筛选和分页功能
 */

const redemptionCodeService = require('../src/services/redemptionCodeService')
const logger = require('../src/utils/logger')

async function testRedemptionCodeFeatures() {
  logger.info('🧪 开始测试兑换码功能')

  try {
    // 1. 生成一些测试数据
    logger.info('📝 生成测试数据...')
    await redemptionCodeService.generateBatchRedemptionCodes('daily', 5)
    await redemptionCodeService.generateBatchRedemptionCodes('monthly', 3)

    // 2. 测试无筛选的查询
    logger.info('🔍 测试基本查询功能:')
    const allCodes = await redemptionCodeService.getAllRedemptionCodes()
    logger.info(`  - 总兑换码数量: ${allCodes.length}`)

    // 3. 测试状态筛选
    logger.info('🔍 测试状态筛选:')
    const unusedCodes = await redemptionCodeService.getAllRedemptionCodes({ status: 'unused' })
    logger.info(`  - 未使用兑换码数量: ${unusedCodes.length}`)

    const usedCodes = await redemptionCodeService.getAllRedemptionCodes({ status: 'used' })
    logger.info(`  - 已使用兑换码数量: ${usedCodes.length}`)

    // 4. 测试类型筛选
    logger.info('🔍 测试类型筛选:')
    const dailyCodes = await redemptionCodeService.getAllRedemptionCodes({ type: 'daily' })
    logger.info(`  - 日卡数量: ${dailyCodes.length}`)

    const monthlyCodes = await redemptionCodeService.getAllRedemptionCodes({ type: 'monthly' })
    logger.info(`  - 月卡数量: ${monthlyCodes.length}`)

    // 5. 测试组合筛选
    logger.info('🔍 测试组合筛选:')
    const unusedDailyCodes = await redemptionCodeService.getAllRedemptionCodes({
      status: 'unused',
      type: 'daily'
    })
    logger.info(`  - 未使用的日卡数量: ${unusedDailyCodes.length}`)

    // 6. 测试代码搜索（如果有数据的话）
    if (allCodes.length > 0) {
      logger.info('🔍 测试代码搜索:')
      const firstCode = allCodes[0]
      const codePrefix = firstCode.code.substring(0, 3)
      const searchResult = await redemptionCodeService.getAllRedemptionCodes({
        code: codePrefix
      })
      logger.info(`  - 搜索前缀 "${codePrefix}" 的结果数量: ${searchResult.length}`)
    }

    // 7. 测试分页功能
    logger.info('🔍 测试分页功能:')
    const page1 = await redemptionCodeService.getAllRedemptionCodes({}, { page: 1, pageSize: 3 })
    logger.info(`  - 第1页数据:`)
    logger.info(`    - 数据项数量: ${page1.items ? page1.items.length : '不是分页结构'}`)
    if (page1.pagination) {
      logger.info(`    - 当前页: ${page1.pagination.currentPage}`)
      logger.info(`    - 每页大小: ${page1.pagination.pageSize}`)
      logger.info(`    - 总记录数: ${page1.pagination.totalCount}`)
      logger.info(`    - 总页数: ${page1.pagination.totalPages}`)
    }

    if (page1.pagination && page1.pagination.totalPages > 1) {
      const page2 = await redemptionCodeService.getAllRedemptionCodes({}, { page: 2, pageSize: 3 })
      logger.info(`  - 第2页数据项数量: ${page2.items ? page2.items.length : '不是分页结构'}`)
    }

    // 8. 测试分页与筛选结合
    logger.info('🔍 测试分页与筛选结合:')
    const filteredPage = await redemptionCodeService.getAllRedemptionCodes(
      { type: 'daily' },
      { page: 1, pageSize: 2 }
    )
    logger.info(
      `  - 日卡第1页数据项数量: ${filteredPage.items ? filteredPage.items.length : '不是分页结构'}`
    )

    // 9. 获取统计信息
    logger.info('📊 获取统计信息:')
    const stats = await redemptionCodeService.getRedemptionStats()
    logger.info(`  - 统计信息:`, stats)
  } catch (error) {
    logger.error('❌ 测试过程中发生错误:', error)
  }

  logger.info('🏁 测试完成')
  process.exit(0)
}

// 运行测试
testRedemptionCodeFeatures()
