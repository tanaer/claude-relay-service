const Redis = require('redis')

async function checkRedis() {
  const client = Redis.createClient({
    socket: {
      host: '101.36.120.191',
      port: 6666
    },
    password: 'qq123456.'
  })

  try {
    await client.connect()
    console.log('Connected to Redis')

    // 检查智能限流配置
    const config = await client.get('smart_rate_limit:config')
    if (config) {
      console.log('Smart Rate Limit Config:')
      const parsedConfig = JSON.parse(config)
      console.log(JSON.stringify(parsedConfig, null, 2))

      // 检查是否包含 "Insufficient" 关键词
      let hasInsufficientKeyword = false
      console.log('\n=== 检查关键词匹配 ===')

      parsedConfig.instantRules?.forEach((rule) => {
        console.log(`立即限流规则 "${rule.name}":`, rule.keywords)
        if (rule.keywords.some((keyword) => keyword.toLowerCase().includes('insufficient'))) {
          hasInsufficientKeyword = true
          console.log('  ✓ 包含 Insufficient 相关关键词')
        }
      })

      parsedConfig.cumulativeRules?.forEach((rule) => {
        console.log(`累计触发规则 "${rule.name}":`, rule.keywords)
        if (rule.keywords.some((keyword) => keyword.toLowerCase().includes('insufficient'))) {
          hasInsufficientKeyword = true
          console.log('  ✓ 包含 Insufficient 相关关键词')
        }
      })

      console.log(`\n配置中${hasInsufficientKeyword ? '包含' : '不包含'} "Insufficient" 关键词`)
    } else {
      console.log('No smart rate limit config found')
    }

    // 检查是否有限流账户
    const limitedAccounts = await client.sMembers('smart_rate_limit:limited_accounts')
    console.log('\nLimited accounts:', limitedAccounts)

    // 检查今日统计
    const today = new Date().toISOString().split('T')[0]
    const todayStats = await client.hGetAll(`smart_rate_limit:stats:${today}`)
    console.log('\nToday stats:', todayStats)

    // 检查最近的关键日志
    const recentLogs = await client.zRevRange('key_logs_list', 0, 9)
    console.log('\nRecent key logs (最近10条):')
    for (const logId of recentLogs) {
      const logData = await client.hGetAll(`key_logs:${logId}`)
      if (logData && logData.type === 'upstream_error') {
        console.log(`- ${logData.timestamp}: ${logData.title} - ${logData.message}`)
      }
    }
  } catch (error) {
    console.error('Redis connection error:', error)
  } finally {
    await client.quit()
  }
}

checkRedis()
