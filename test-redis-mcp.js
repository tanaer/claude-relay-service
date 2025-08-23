#!/usr/bin/env node

/**
 * Redis MCP 服务连接测试脚本
 * 测试是否能成功连接到远程 Redis 服务
 */

const Redis = require('ioredis')

// Redis 连接配置（与线上环境一致）
const REDIS_CONFIG = {
  host: '101.36.120.191',
  port: 6666,
  password: 'qq123456.',
  db: 0,
  connectTimeout: 10000,
  commandTimeout: 5000,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true
}

async function testRedisConnection() {
  console.log('🔧 开始测试 Redis 连接...')
  console.log(`📍 连接信息: ${REDIS_CONFIG.host}:${REDIS_CONFIG.port}`)

  const redis = new Redis(REDIS_CONFIG)

  try {
    // 尝试连接
    await redis.connect()
    console.log('✅ Redis 连接成功!')

    // 测试基本操作
    console.log('🧪 测试基本操作...')

    // 设置测试键值
    await redis.set('mcp_test_key', 'hello_world')
    console.log('✅ SET 操作成功')

    // 获取测试键值
    const value = await redis.get('mcp_test_key')
    console.log(`✅ GET 操作成功, 值: ${value}`)

    // 删除测试键
    await redis.del('mcp_test_key')
    console.log('✅ DEL 操作成功')

    // 测试一些常用的 Redis 命令
    await redis.info()
    console.log('✅ INFO 命令成功')

    const keyCount = await redis.dbsize()
    console.log(`✅ DBSIZE 命令成功, 当前数据库键数量: ${keyCount}`)

    console.log('\n🎉 所有测试通过! MCP Redis 服务应该能正常工作.')
    console.log('\n📖 使用说明:')
    console.log('  启动 MCP 服务: npm run mcp:redis')
    console.log('  或者直接运行: node start-redis-mcp.js')
  } catch (error) {
    console.error('❌ Redis 连接或操作失败:', error.message)
    console.error('\n🔍 请检查:')
    console.error('  1. Redis 服务是否运行')
    console.error('  2. 网络连接是否正常')
    console.error('  3. 密码和端口配置是否正确')
  } finally {
    await redis.disconnect()
  }
}

// 运行测试
testRedisConnection()
