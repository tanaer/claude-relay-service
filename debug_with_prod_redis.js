// 临时修改Redis配置连接到线上环境
const originalConfig = require('./config/config.js')

// 覆盖Redis配置
originalConfig.redis.host = '101.36.120.191'
originalConfig.redis.port = 6666
originalConfig.redis.password = 'qq123456.'

const smartRateLimitConfigService = require('./src/services/smartRateLimitConfigService')
const smartRateLimitService = require('./src/services/smartRateLimitService')
const keyLogsService = require('./src/services/keyLogsService')

async function debug() {
  try {
    console.log('=== 调试智能限流系统（连接线上Redis）===\n')

    // 等待Redis连接
    const redis = require('./src/models/redis')
    console.log('等待Redis连接...')
    let connected = false
    let attempts = 0

    while (!connected && attempts < 10) {
      try {
        await redis.connect()
        connected = redis.isConnected
        console.log('Redis连接状态:', connected)
      } catch (error) {
        console.log(`连接尝试 ${attempts + 1} 失败:`, error.message)
      }
      attempts++
      if (!connected) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    if (!connected) {
      console.log('无法连接到Redis，跳过调试')
      return
    }

    // 获取智能限流配置
    console.log('\n1. 获取智能限流配置:')
    const configResult = await smartRateLimitConfigService.getConfig()
    if (configResult.success) {
      const config = configResult.data
      console.log('配置状态:', config.enabled ? '启用' : '禁用')

      console.log('\n立即限流规则:')
      let foundInsufficientRule = false
      config.instantRules.forEach((rule, index) => {
        console.log(`${index + 1}. ${rule.name} (${rule.enabled ? '启用' : '禁用'}):`)
        console.log('   关键词:', rule.keywords)

        // 检查是否包含Insufficient相关关键词
        const hasInsufficient = rule.keywords.some(
          (k) => k.toLowerCase().includes('insufficient') || k.toLowerCase().includes('balance')
        )

        if (hasInsufficient) {
          foundInsufficientRule = true
          console.log('   ✓ 包含 "Insufficient" 或 "balance" 相关关键词!')
        }
      })

      if (!foundInsufficientRule) {
        console.log('\n⚠️ 没有找到包含 "Insufficient" 的立即限流规则！')

        // 添加一个包含Insufficient关键词的规则
        console.log('\n尝试添加包含 "Insufficient" 的规则...')
        const newRule = {
          name: '余额不足',
          keywords: ['Insufficient', 'insufficient_balance', 'balance'],
          description: '检测到余额不足错误时立即限流',
          enabled: true,
          limitDuration: 60 * 60 // 60分钟
        }

        const addResult = await smartRateLimitConfigService.addInstantRule(newRule)
        if (addResult.success) {
          console.log('✅ 成功添加余额不足限流规则！')
        } else {
          console.log('❌ 添加规则失败:', addResult.error)
        }
      }

      console.log('\n累计触发规则:')
      config.cumulativeRules.forEach((rule, index) => {
        console.log(
          `${index + 1}. ${rule.name} (${rule.enabled ? '启用' : '禁用'}): ${rule.keywords.join(', ')}`
        )
      })
    } else {
      console.log('获取配置失败:', configResult.error)
    }

    // 测试错误匹配
    console.log('\n2. 测试错误匹配:')
    const testErrors = [
      '{"error":"Insufficient balance"}',
      'Insufficient balance',
      'insufficient_balance',
      '{"error": {"message": "Insufficient balance to complete request"}}'
    ]

    // 重新初始化智能限流服务以获取最新配置
    await smartRateLimitService.initialize()

    if (smartRateLimitService.config) {
      const settings = smartRateLimitService.config.globalSettings

      testErrors.forEach((testError) => {
        console.log(`\n测试错误: "${testError}"`)

        for (const rule of smartRateLimitService.config.instantRules) {
          if (!rule.enabled) {
            continue
          }

          const matchedKeyword = smartRateLimitService.matchRuleKeywords(
            testError,
            rule.keywords,
            settings
          )
          if (matchedKeyword) {
            console.log(`  ✓ 规则 "${rule.name}" 匹配: ${matchedKeyword}`)
          } else {
            console.log(`  - 规则 "${rule.name}" 无匹配`)
          }
        }
      })
    }

    // 检查最近的上游错误日志
    console.log('\n3. 检查最近的上游错误日志:')
    const recentLogs = await keyLogsService.getKeyLogs({
      type: 'upstream_error',
      page: 1,
      pageSize: 10
    })

    console.log(`找到 ${recentLogs.logs.length} 条上游错误日志:`)
    let foundInsufficientLog = false

    recentLogs.logs.forEach((log, index) => {
      console.log(`${index + 1}. ${log.timestamp}: ${log.message}`)
      if (log.message.toLowerCase().includes('insufficient')) {
        foundInsufficientLog = true
        console.log('   ✓ 包含 "Insufficient" 关键词的日志!')
      }
    })

    if (!foundInsufficientLog) {
      console.log('   没有找到包含 "Insufficient" 的日志')
    }

    // 获取统计信息
    console.log('\n4. 智能限流统计:')
    const stats = await smartRateLimitService.getStatistics()
    if (stats) {
      console.log('服务启用:', stats.enabled)
      console.log('今日触发次数:', stats.totalTriggers)
      console.log('当前限流账户数:', stats.limitedAccountsCount)
      console.log('规则统计:', stats.ruleStats)

      if (stats.limitedAccounts && stats.limitedAccounts.length > 0) {
        console.log('\n当前被限流的账户:')
        stats.limitedAccounts.forEach((account, index) => {
          console.log(`${index + 1}. ${account.accountName} (${account.accountId})`)
          console.log(`   原因: ${account.reason}`)
          console.log(`   剩余时间: ${account.remainingSeconds}秒`)
        })
      }
    }
  } catch (error) {
    console.error('调试过程中发生错误:', error)
  } finally {
    console.log('\n=== 调试完成 ===')
    process.exit(0)
  }
}

debug()
