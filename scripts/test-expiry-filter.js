#!/usr/bin/env node

/**
 * 测试 API Keys 过期时间筛选功能
 */

const redis = require('../src/models/redis')

async function createTestApiKeys() {
  try {
    console.log('🧪 创建测试 API Keys...\n')

    // 确保Redis连接
    await redis.ensureConnected()
    const client = redis.getClientSafe()

    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    // 创建测试数据
    const testKeys = [
      {
        id: 'test-expired-1',
        name: '已过期的Key-1',
        apiKey: 'cr_test_expired_1',
        isActive: true,
        expiresAt: yesterday.toISOString(), // 昨天过期
        tags: ['test', 'expired']
      },
      {
        id: 'test-expired-2',
        name: '已过期的Key-2',
        apiKey: 'cr_test_expired_2',
        isActive: true,
        expiresAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2小时前过期
        tags: ['test', 'expired']
      },
      {
        id: 'test-active-1',
        name: '未过期的Key-1',
        apiKey: 'cr_test_active_1',
        isActive: true,
        expiresAt: tomorrow.toISOString(), // 明天过期
        tags: ['test', 'active']
      },
      {
        id: 'test-active-2',
        name: '未过期的Key-2',
        apiKey: 'cr_test_active_2',
        isActive: true,
        expiresAt: nextWeek.toISOString(), // 下周过期
        tags: ['test', 'active']
      },
      {
        id: 'test-no-expiry',
        name: '永不过期的Key',
        apiKey: 'cr_test_no_expiry',
        isActive: true,
        expiresAt: null, // 没有过期时间
        tags: ['test', 'permanent']
      }
    ]

    // 存储到 Redis
    for (const key of testKeys) {
      await client.hset(`api_key:${key.id}`, key)
      console.log(`✅ 创建测试 Key: ${key.name}`)
      console.log(`   过期时间: ${key.expiresAt || '永不过期'}`)
      console.log(
        `   状态: ${key.expiresAt ? (new Date(key.expiresAt) < now ? '已过期' : '未过期') : '永不过期'}\n`
      )
    }

    console.log('📊 测试数据创建完成！')
    console.log('总计创建: 5 个测试 API Keys')
    console.log('- 已过期: 2 个')
    console.log('- 未过期: 2 个')
    console.log('- 永不过期: 1 个')
    console.log('\n现在可以在前端界面测试���期时间筛选功能了！')
  } catch (error) {
    console.error('❌ 创建测试数据失败:', error)
  } finally {
    process.exit(0)
  }
}

// 运行测试
createTestApiKeys().catch(console.error)
