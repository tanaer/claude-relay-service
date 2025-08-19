#!/usr/bin/env node

/**
 * 测试上游重置时间功能脚本
 * 用于验证智能限流的自动解除功能
 */

const smartRateLimitService = require('../src/services/smartRateLimitService')
const logger = require('../src/utils/logger')

async function testUpstreamResetTime() {
  logger.info('🧪 开始测试上游重置时间功能')

  try {
    // 测试时间解析功能
    const testCases = [
      '00:52', // 每日重置时间
      '14:30', // 每日重置时间
      '2024-08-18 00:52:00', // 特定时间
      '2024-08-18 14:30:00', // 特定时间
      '2024-12-31 23:59:59' // 特定时间
    ]

    logger.info('📝 测试时间解析功能:')
    for (const testCase of testCases) {
      const parsed = smartRateLimitService.parseUpstreamResetTime(testCase)
      logger.info(`  输入: "${testCase}"`)
      if (parsed) {
        logger.info(`  解析: ${parsed.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
      } else {
        logger.warn(`  解析: 失败`)
      }
      logger.info('')
    }

    // 获取当前被限流的账户
    logger.info('📊 获取当前被限流的账户:')
    const limitedAccounts = await smartRateLimitService.getAllRateLimitedAccounts()

    if (limitedAccounts.length === 0) {
      logger.info('  ✅ 当前没有被限流的账户')
    } else {
      logger.info(`  📋 发现 ${limitedAccounts.length} 个被限流的账户:`)
      for (const account of limitedAccounts) {
        logger.info(`    - ${account.accountName} (${account.accountId})`)
        logger.info(`      限流原因: ${account.reason}`)
        logger.info(`      剩余时间: ${account.remainingSeconds} 秒`)
        if (account.upstreamResetTime) {
          logger.info(`      上游重置时间: ${account.upstreamResetTime}`)

          // 解析并显示重置时间
          const resetTime = smartRateLimitService.parseUpstreamResetTime(account.upstreamResetTime)
          if (resetTime) {
            const now = new Date()
            const shouldReset = now >= resetTime
            logger.info(
              `      解析后的重置时间: ${resetTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
            )
            logger.info(
              `      当前时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
            )
            logger.info(`      是否应该解除限流: ${shouldReset ? '✅ 是' : '❌ 否'}`)
          }
        }
        logger.info('')
      }
    }

    // 手动触发恢复检查
    logger.info('🔄 手动触发恢复检查:')
    await smartRateLimitService.checkRecovery()
    logger.info('  ✅ 恢复检查完成')
  } catch (error) {
    logger.error('❌ 测试过程中发生错误:', error)
  }

  logger.info('🏁 测试完成')
  process.exit(0)
}

// 运行测试
testUpstreamResetTime()
