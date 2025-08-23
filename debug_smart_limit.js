const redis = require('./src/models/redis')
const smartRateLimitConfigService = require('./src/services/smartRateLimitConfigService')
const smartRateLimitService = require('./src/services/smartRateLimitService')

async function debug() {
  try {
    console.log('=== 调试智能限流系统 ===\n')

    // 1. 检查Redis连接
    console.log('1. 检查Redis连接状态:')
    console.log('Redis连接状态:', redis.isConnected)

    // 2. 获取当前配置
    console.log('\n2. 获取智能限流配置:')
    const configResult = await smartRateLimitConfigService.getConfig()
    if (configResult.success) {
      const config = configResult.data
      console.log('配置状态:', config.enabled ? '启用' : '禁用')

      console.log('\n立即限流规则:')
      config.instantRules.forEach((rule) => {
        console.log(
          `- ${rule.name} (${rule.enabled ? '启用' : '禁用'}): ${rule.keywords.join(', ')}`
        )
        if (rule.keywords.some((k) => k.toLowerCase().includes('insufficient'))) {
          console.log('  ✓ 包含 "Insufficient" 关键词!')
        }
      })

      console.log('\n累计触发规则:')
      config.cumulativeRules.forEach((rule) => {
        console.log(
          `- ${rule.name} (${rule.enabled ? '启用' : '禁用'}): ${rule.keywords.join(', ')}`
        )
        if (rule.keywords.some((k) => k.toLowerCase().includes('insufficient'))) {
          console.log('  ✓ 包含 "Insufficient" 关键词!')
        }
      })
    } else {
      console.log('获取配置失败:', configResult.error)
    }

    // 3. 检查服务初始化状态
    console.log('\n3. 检查智能限流服务状态:')
    console.log('服务配置存在:', smartRateLimitService.config ? '是' : '否')
    if (smartRateLimitService.config) {
      console.log('服务启用状态:', smartRateLimitService.config.enabled)
    }

    // 4. 模拟测试错误匹配
    console.log('\n4. 测试错误匹配:')
    const testError = '{"error":"Insufficient balance"}'
    console.log('测试错误内容:', testError)

    if (smartRateLimitService.config) {
      const settings = smartRateLimitService.config.globalSettings

      // 测试立即限流规则匹配
      for (const rule of smartRateLimitService.config.instantRules) {
        if (!rule.enabled) {
          continue
        }

        const matchedKeyword = smartRateLimitService.matchRuleKeywords(
          testError,
          rule.keywords,
          settings
        )
        console.log(`规则 "${rule.name}" 匹配结果: ${matchedKeyword || '无匹配'}`)
      }
    }

    // 5. 获取统计信息
    console.log('\n5. 获取统计信息:')
    const stats = await smartRateLimitService.getStatistics()
    if (stats) {
      console.log('今日触发次数:', stats.totalTriggers)
      console.log('当前限流账户数:', stats.limitedAccountsCount)
      console.log('规则统计:', stats.ruleStats)
    }

    // 6. 检查最近的上游错误日志
    console.log('\n6. 检查最近的关键日志:')
    const keyLogsService = require('./src/services/keyLogsService')
    const recentLogs = await keyLogsService.getKeyLogs({
      type: 'upstream_error',
      page: 1,
      pageSize: 5
    })

    console.log(`找到 ${recentLogs.logs.length} 条上游错误日志:`)
    recentLogs.logs.forEach((log) => {
      console.log(`- ${log.timestamp}: ${log.message}`)
      if (log.message.includes('Insufficient')) {
        console.log('  ✓ 包含 "Insufficient" 关键词的日志!')
      }
    })
  } catch (error) {
    console.error('调试过程中发生错误:', error)
  } finally {
    console.log('\n=== 调试完成 ===')
    process.exit(0)
  }
}

debug()
