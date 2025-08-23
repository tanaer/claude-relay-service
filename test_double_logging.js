// 测试双重日志记录的问题
const originalConfig = require('./config/config.js')

// 覆盖Redis配置连接到线上环境
originalConfig.redis.host = '101.36.120.191'
originalConfig.redis.port = 6666
originalConfig.redis.password = 'qq123456.'

async function testDoubleLogging() {
  try {
    console.log('=== 测试双重日志记录问题 ===\n')

    // 等待Redis连接
    const redis = require('./src/models/redis')
    console.log('连接Redis...')
    await redis.connect()

    if (!redis.isConnected) {
      console.log('Redis连接失败，跳过测试')
      return
    }

    console.log('Redis连接成功\n')

    // 获取服务
    const smartRateLimitService = require('./src/services/smartRateLimitService')

    // 初始化智能限流服务
    await smartRateLimitService.initialize()

    console.log('1. 检查当前配置状态:')
    if (smartRateLimitService.config) {
      console.log('服务已初始化:', smartRateLimitService.config.enabled)
      console.log('立即限流规则数量:', smartRateLimitService.config.instantRules.length)
    } else {
      console.log('服务未初始化')
    }

    console.log('\n2. 模拟触发一个Insufficient balance错误:')

    const testErrorParams = {
      accountId: 'test_account_123',
      accountName: 'Test Account',
      accountType: 'claude',
      statusCode: 400,
      errorMessage: 'Insufficient balance',
      errorBody: { error: 'Insufficient balance' },
      apiKeyId: 'test_key_456',
      apiKeyName: 'Test API Key',
      isFromUpstream: true
    }

    console.log('调用 smartRateLimitService.handleUpstreamError...')

    const result = await smartRateLimitService.handleUpstreamError(testErrorParams)

    console.log('处理结果:', result)

    // 检查是否触发了限流
    if (result.shouldLimit) {
      console.log('✅ 智能限流被触发!')
      console.log('触发原因:', result.reason)
      console.log('匹配规则:', result.ruleName)

      // 检查限流状态
      const isLimited = await smartRateLimitService.isRateLimited(testErrorParams.accountId)
      console.log('账户限流状态:', isLimited)

      // 获取限流信息
      const limitInfo = await smartRateLimitService.getRateLimitInfo(testErrorParams.accountId)
      console.log('限流信息:', limitInfo)

      // 清理测试数据
      console.log('\n清理测试数据...')
      await smartRateLimitService.removeRateLimit(testErrorParams.accountId)
    } else {
      console.log('❌ 智能限流未触发')
      console.log('跳过原因:', result.reason)
    }

    // 检查关键日志是否记录了错误
    console.log('\n3. 检查关键日志记录:')
    const keyLogsService = require('./src/services/keyLogsService')
    const recentLogs = await keyLogsService.getKeyLogs({
      type: 'upstream_error',
      page: 1,
      pageSize: 3
    })

    console.log(`最近3条上游错误日志:`)
    recentLogs.logs.forEach((log, index) => {
      console.log(`${index + 1}. ${log.timestamp}: ${log.message}`)
    })

    // 检查是否有我们测试的错误
    const testLogs = recentLogs.logs.filter(
      (log) => log.message.includes('Test Account') || log.message.includes('Insufficient balance')
    )

    if (testLogs.length > 0) {
      console.log(`✅ 找到 ${testLogs.length} 条测试相关的日志记录`)
    } else {
      console.log('❌ 没有找到测试相关的日志记录')
    }
  } catch (error) {
    console.error('测试过程中发生错误:', error)
  } finally {
    console.log('\n=== 测试完成 ===')
    process.exit(0)
  }
}

testDoubleLogging()
