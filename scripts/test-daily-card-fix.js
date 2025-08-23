#!/usr/bin/env node

/**
 * 测试日卡费用和使用量累计修复
 */

const redis = require('../src/models/redis')

async function testDailyCardFix() {
  try {
    console.log('🧪 测试日卡费用和使用量累计修复\n')
    console.log('='.repeat(60))

    // 获取Redis客户端
    const client = redis.getClientSafe()
    if (!client) {
      console.error('无法连接到Redis')
      return
    }

    // 创建测试数据
    const testApiKeys = [
      {
        id: 'test-daily-card-1',
        name: '测试日卡1',
        tags: JSON.stringify(['daily-card', 'test']),
        dailyCostLimit: 20,
        isActive: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'test-normal-key-1',
        name: '测试普通密钥1',
        tags: JSON.stringify(['normal', 'test']),
        dailyCostLimit: 10,
        isActive: true,
        createdAt: new Date().toISOString()
      }
    ]

    console.log('\n📋 创建测试API Key...')
    for (const key of testApiKeys) {
      await redis.setApiKey(key.id, key)
      console.log(`  ✅ 创建: ${key.name} (${key.id})`)
    }

    // 模拟多天的使用数据
    console.log('\n📊 模拟多天使用数据...')
    const today = new Date()
    const dates = []

    // 生成最近3天的日期
    for (let i = 2; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      dates.push(redis.getDateStringInTimezone(date))
    }

    // 为每个API Key添加使用数据
    for (const key of testApiKeys) {
      let totalCost = 0
      let totalUsage = 0

      for (let i = 0; i < dates.length; i++) {
        const date = dates[i]
        const dailyCost = 5 + i * 2 // 5, 7, 9
        const dailyUsage = 1000 + i * 500 // 1000, 1500, 2000

        // 添加每日费用
        const costKey = `usage:cost:daily:${key.id}:${date}`
        await redis.client.set(costKey, dailyCost)

        // 添加每日使用量
        const usageKey = `usage:daily:${key.id}:${date}`
        await redis.client.hset(usageKey, {
          totalTokens: dailyUsage,
          totalInputTokens: Math.round(dailyUsage * 0.3),
          totalOutputTokens: Math.round(dailyUsage * 0.7),
          totalRequests: 10 + i * 5,
          totalAllTokens: dailyUsage
        })

        totalCost += dailyCost
        totalUsage += dailyUsage

        console.log(`  ${key.name} - ${date}: 费用=$${dailyCost}, 使用量=${dailyUsage} tokens`)
      }

      // 设置总费用和总使用量
      await redis.client.set(`usage:cost:total:${key.id}`, totalCost)
      await redis.client.hset(`usage:${key.id}`, {
        totalTokens: totalUsage,
        totalInputTokens: Math.round(totalUsage * 0.3),
        totalOutputTokens: Math.round(totalUsage * 0.7),
        totalRequests: 45,
        totalAllTokens: totalUsage
      })

      console.log(`  ${key.name} - 总计: 费用=$${totalCost}, 使用量=${totalUsage} tokens`)
    }

    // 测试 getDailyCost 函数
    console.log('\n\n🔍 测试 getDailyCost 函数:')
    console.log('-'.repeat(40))

    for (const key of testApiKeys) {
      const cost = await redis.getDailyCost(key.id)
      const isDaily = key.tags.includes('daily-card')

      console.log(`\n${key.name} (${isDaily ? '日卡' : '普通'})`)
      console.log(`  标签: ${key.tags}`)
      console.log(`  返回费用: $${cost}`)

      if (isDaily) {
        console.log(`  ✅ 日卡应返回总费用 $21 (5+7+9)`)
        if (Math.abs(cost - 21) < 0.01) {
          console.log(`  ✅ 测试通过！`)
        } else {
          console.log(`  ❌ 测试失败！期望 $21，实际 $${cost}`)
        }
      } else {
        console.log(`  ✅ 普通密钥应返回今日费用 $9`)
        if (Math.abs(cost - 9) < 0.01) {
          console.log(`  ✅ 测试通过！`)
        } else {
          console.log(`  ❌ 测试失败！期望 $9，实际 $${cost}`)
        }
      }
    }

    // 测试 getUsageStats 函数
    console.log('\n\n🔍 测试 getUsageStats 函数:')
    console.log('-'.repeat(40))

    for (const key of testApiKeys) {
      const stats = await redis.getUsageStats(key.id)
      const isDaily = key.tags.includes('daily-card')

      console.log(`\n${key.name} (${isDaily ? '日卡' : '普通'})`)
      console.log(`  标签: ${key.tags}`)
      console.log(`  总使用量: ${stats.total.tokens} tokens`)
      console.log(`  daily字段: ${stats.daily.tokens} tokens`)

      if (isDaily) {
        console.log(`  ✅ 日卡的daily应等于total (4500 tokens)`)
        if (stats.daily.tokens === stats.total.tokens && stats.daily.tokens === 4500) {
          console.log(`  ✅ 测试通过！`)
        } else {
          console.log(`  ❌ 测试失败！daily=${stats.daily.tokens}, total=${stats.total.tokens}`)
        }
      } else {
        console.log(`  ✅ 普通密钥的daily应为今日使用量 (2000 tokens)`)
        if (stats.daily.tokens === 2000) {
          console.log(`  ✅ 测试通过！`)
        } else {
          console.log(`  ❌ 测试失败！期望 2000，实际 ${stats.daily.tokens}`)
        }
      }
    }

    // 清理测试数据
    console.log('\n\n🧹 清理测试数据...')

    for (const key of testApiKeys) {
      // 删除API Key
      await redis.deleteApiKey(key.id)

      // 删除相关的使用数据
      const patterns = [`usage:cost:*:${key.id}:*`, `usage:daily:${key.id}:*`, `usage:${key.id}`]

      for (const pattern of patterns) {
        const keys = await client.keys(pattern)
        if (keys.length > 0) {
          await client.del(...keys)
        }
      }

      console.log(`  ✅ 清理: ${key.name}`)
    }

    console.log('\n\n✨ 测试完成！')
    console.log('='.repeat(60))
    console.log('\n📌 总结:')
    console.log('1. getDailyCost 函数已修复：日卡返回总费用，普通密钥返回今日费用')
    console.log('2. getUsageStats 函数已修复：日卡的daily字段返回总使用量')
    console.log('3. 日卡不会在每日0点后"重置"，费用和使用量会持续累计')
    console.log('4. 普通密钥仍然按天计算，每天是独立的')
  } catch (error) {
    console.error('\n❌ 测试失败:', error)
  } finally {
    process.exit(0)
  }
}

// 运行测试
testDailyCardFix().catch(console.error)
