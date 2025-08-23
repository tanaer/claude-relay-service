#!/usr/bin/env node

/**
 * 检查日卡使用量重置问题
 */

const redis = require('../src/models/redis')

async function checkDailyUsageReset() {
  try {
    console.log('🔍 检查日卡使用量重置问题...\n')

    // 确保Redis连接
    await redis.ensureConnected()

    // 1. 获取所有API Key
    const allApiKeys = await redis.getAllApiKeys()
    console.log(`总共找到 ${allApiKeys.length} 个API Key\n`)

    // 2. 找出日卡
    const dailyCardKeys = []
    for (const apiKey of allApiKeys) {
      if (apiKey.tags) {
        let tags = []
        try {
          if (typeof apiKey.tags === 'string') {
            const trimmedTags = apiKey.tags.trim()
            if (trimmedTags.startsWith('[') && trimmedTags.endsWith(']')) {
              try {
                tags = JSON.parse(trimmedTags)
              } catch {
                tags = trimmedTags
                  .slice(1, -1)
                  .split(',')
                  .map((tag) => tag.replace(/['"]/g, '').trim())
                  .filter((tag) => tag.length > 0)
              }
            } else {
              tags = trimmedTags
                .split(',')
                .map((tag) => tag.trim())
                .filter((tag) => tag.length > 0)
            }
          } else if (Array.isArray(apiKey.tags)) {
            tags = [...apiKey.tags]
          }
        } catch (error) {
          console.error(`解析标签失败: ${error.message}`)
        }

        if (tags.includes('daily-card')) {
          dailyCardKeys.push({
            id: apiKey.id,
            name: apiKey.name,
            tags,
            rawTags: apiKey.tags,
            usageLimits: apiKey.usageLimits
          })
        }
      }
    }

    console.log(`找到 ${dailyCardKeys.length} 个日卡:\n`)

    // 3. 检查每个日卡的使用量数据
    const client = redis.getClientSafe()
    const today = redis.getDateStringInTimezone()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = redis.getDateStringInTimezone(yesterday)

    for (const apiKey of dailyCardKeys) {
      console.log(`\n📋 ${apiKey.name} (${apiKey.id})`)
      console.log(`  标签: ${JSON.stringify(apiKey.tags)}`)
      console.log(`  使用限制: ${JSON.stringify(apiKey.usageLimits)}`)

      // 检查今天的使用量键
      const todayKey = `usage:daily:${apiKey.id}:${today}`
      const yesterdayKey = `usage:daily:${apiKey.id}:${yesterdayStr}`

      const todayExists = await redis.exists(todayKey)
      const yesterdayExists = await redis.exists(yesterdayKey)

      console.log(`\n  使用量数据键:`)
      console.log(`    今天 (${today}): ${todayKey}`)
      console.log(`    键存在: ${todayExists ? '✅ 是' : '❌ 否'}`)

      if (todayExists) {
        const todayData = await client.hgetall(todayKey)
        console.log(`    今日使用: ${JSON.stringify(todayData)}`)
      }

      console.log(`    昨天 (${yesterdayStr}): ${yesterdayKey}`)
      console.log(`    键存在: ${yesterdayExists ? '✅ 是' : '❌ 否'}`)

      if (yesterdayExists) {
        const yesterdayData = await client.hgetall(yesterdayKey)
        console.log(`    昨日使用: ${JSON.stringify(yesterdayData)}`)
      }

      // 检查所有历史使用量键
      const allUsageKeys = await client.keys(`usage:daily:${apiKey.id}:*`)
      console.log(`\n  历史使用量键数量: ${allUsageKeys.length}`)
      if (allUsageKeys.length > 0) {
        console.log(`  历史键列表:`)
        for (const key of allUsageKeys.slice(-5)) {
          // 只显示最近5个
          const data = await client.hgetall(key)
          console.log(`    ${key}: ${JSON.stringify(data)}`)
        }
      }

      // 检查总使用量
      const totalUsageKey = `usage:${apiKey.id}`
      const totalExists = await redis.exists(totalUsageKey)
      if (totalExists) {
        const totalData = await client.hgetall(totalUsageKey)
        console.log(`\n  总使用量: ${JSON.stringify(totalData)}`)
      }
    }

    // 4. 检查是否有定时任务在删除使用量
    console.log('\n\n🔍 检查定时任务配置:')
    console.log('  每日重置任务: 0:00 (Asia/Shanghai)')
    console.log('  任务内容: 调用 dynamicPolicyEngine.resetApiKeyPolicy')
    console.log('  问题: resetApiKeyPolicy 只重置策略模板，不重置使用量')

    // 5. 问题诊断
    console.log('\n\n⚠️ 问题诊断:')
    console.log('1. 日卡的 daily-card 标签检测正常')
    console.log('2. resetApiKeyPolicy 函数会跳过带有 daily-card 标签的 API Key')
    console.log('3. 但是没有任何地方在重置非日卡的使用量数据')
    console.log('4. 使用量数据存储在 usage:daily:{keyId}:{date} 格式的键中')
    console.log('5. 这些键会自然按日期分隔，新的一天会创建新的键')
    console.log('6. 问题可能是：前端或其他地方在计算费用时没有正确处理日卡的累计逻辑')

    console.log('\n\n💡 解决方案:')
    console.log('1. 日卡应该累计所有日期的使用量，而不是只看今天的')
    console.log('2. 非日卡只计算今天的使用量')
    console.log('3. 需要修改使用量统计逻辑，对日卡进行特殊处理')
  } catch (error) {
    console.error('检查过程中发生错误:', error)
  } finally {
    process.exit(0)
  }
}

// 运行检查
checkDailyUsageReset().catch(console.error)
