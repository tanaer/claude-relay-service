#!/usr/bin/env node

/**
 * 生产环境日卡检查脚本
 * 在生产服务器上运行此脚本来检查日卡的实际数据
 */

const redis = require('../src/models/redis')
const _logger = require('../src/utils/logger')
const redemptionPolicyService = require('../src/services/redemptionPolicyService')

// 模拟增强的标签解析逻辑（与修复后的代码一致）
function parseTagsEnhanced(tags) {
  let parsedTags = []

  try {
    if (typeof tags === 'string') {
      const trimmedTags = tags.trim()

      // 尝试JSON解析
      if (trimmedTags.startsWith('[') && trimmedTags.endsWith(']')) {
        try {
          parsedTags = JSON.parse(trimmedTags)
        } catch (jsonError) {
          console.log(`    JSON解析失败: ${jsonError.message}`)
          // JSON解析失败，按逗号分割
          parsedTags = trimmedTags
            .slice(1, -1)
            .split(',')
            .map((tag) => tag.replace(/['"]/g, '').trim())
            .filter((tag) => tag.length > 0)
        }
      } else {
        // 不是JSON格式，按逗号分割
        parsedTags = trimmedTags
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      }
    } else if (Array.isArray(tags)) {
      parsedTags = [...tags]
    }
  } catch (error) {
    console.log(`    标签解析失败: ${error.message}`)
    parsedTags = []
  }

  return parsedTags
}

async function checkProductionDailyCards() {
  try {
    console.log('🔍 检查生产环境日卡数据...\n')

    // 1. 获取所有API Key
    const allApiKeys = await redis.getAllApiKeys()
    console.log(`总共找到 ${allApiKeys.length} 个API Key`)

    const dailyCardKeys = []
    const problematicKeys = []

    // 2. 分析每个API Key的标签
    for (const apiKey of allApiKeys) {
      if (apiKey.tags) {
        // 使用旧逻辑解析
        let oldTags = []
        try {
          if (typeof apiKey.tags === 'string') {
            oldTags = JSON.parse(apiKey.tags)
          } else if (Array.isArray(apiKey.tags)) {
            oldTags = [...apiKey.tags]
          }
        } catch (error) {
          oldTags =
            typeof apiKey.tags === 'string' ? apiKey.tags.split(',').map((tag) => tag.trim()) : []
        }

        // 使用新逻辑解析
        const newTags = parseTagsEnhanced(apiKey.tags)

        const oldHasDailyCard = oldTags.includes('daily-card')
        const newHasDailyCard = newTags.includes('daily-card')

        if (oldHasDailyCard || newHasDailyCard) {
          const keyInfo = {
            id: apiKey.id,
            name: apiKey.name,
            rawTags: apiKey.tags,
            oldTags,
            newTags,
            oldDetected: oldHasDailyCard,
            newDetected: newHasDailyCard,
            fixed: !oldHasDailyCard && newHasDailyCard
          }

          dailyCardKeys.push(keyInfo)

          if (!oldHasDailyCard && newHasDailyCard) {
            problematicKeys.push(keyInfo)
          }
        }
      }
    }

    console.log(`\n找到 ${dailyCardKeys.length} 个日卡API Key`)

    // 3. 分析日卡详情
    console.log('\n📋 日卡详细分析:')
    for (const key of dailyCardKeys) {
      console.log(`\n🔑 ${key.name} (${key.id})`)
      console.log(`  原始标签: ${JSON.stringify(key.rawTags)}`)
      console.log(
        `  旧逻辑解析: ${JSON.stringify(key.oldTags)} -> ${key.oldDetected ? '✅检测到' : '❌未检测到'}`
      )
      console.log(
        `  新逻辑解析: ${JSON.stringify(key.newTags)} -> ${key.newDetected ? '✅检测到' : '❌未检测到'}`
      )

      if (key.fixed) {
        console.log(`  🎯 状态: 修复后可正确检测`)
      } else if (!key.oldDetected && !key.newDetected) {
        console.log(`  ⚠️ 状态: 仍然无法检测（可能标签格式有问题）`)
      } else {
        console.log(`  ✅ 状态: 检测正常`)
      }

      // 检查策略绑定
      try {
        const policyBinding = await redemptionPolicyService.getApiKeyPolicy(key.id)
        if (policyBinding && policyBinding.isActive === 'true') {
          console.log(`  📋 策略绑定: 活跃 (会参与每日重置)`)
          console.log(`    当前模板: ${policyBinding.currentTemplate}`)
          console.log(`    初始模板: ${policyBinding.initialTemplate}`)
        } else {
          console.log(`  📋 策略绑定: 无或非活跃 (不会参与每日重置)`)
        }
      } catch (error) {
        console.log(`  📋 策略绑定: 检查失败 - ${error.message}`)
      }
    }

    // 4. 检查活跃策略列表
    console.log('\n📊 活跃策略分析:')
    try {
      const activeApiKeys = await redis.smembers('active_policies:redemption')
      console.log(`活跃策略API Key总数: ${activeApiKeys.length}`)

      const activeDailyCards = dailyCardKeys.filter((key) => activeApiKeys.includes(key.id))
      console.log(`其中日卡数量: ${activeDailyCards.length}`)

      if (activeDailyCards.length > 0) {
        console.log('\n⚠️ 以下日卡在活跃策略列表中（会参与每日重置）:')
        for (const key of activeDailyCards) {
          console.log(
            `  - ${key.name} (${key.id}) - ${key.oldDetected ? '旧逻辑可检测' : '旧逻辑不可检测'}`
          )
        }
      }
    } catch (error) {
      console.log(`活跃策略检查失败: ${error.message}`)
    }

    // 5. 总结
    console.log(`\n${'='.repeat(60)}`)
    console.log('📊 检查总结:')
    console.log(`- 总API Key数量: ${allApiKeys.length}`)
    console.log(`- 日卡数量: ${dailyCardKeys.length}`)
    console.log(`- 旧逻辑无法检测的日卡: ${problematicKeys.length}`)
    console.log(`- 修复后可正确检测: ${problematicKeys.length}`)

    if (problematicKeys.length > 0) {
      console.log('\n🔧 建议操作:')
      console.log('1. 部署包含修复的 dynamicPolicyEngine.js')
      console.log('2. 重启策略调度服务')
      console.log('3. 监控下次每日重置，确认日卡不再被错误重置')
    } else {
      console.log('\n✅ 所有日卡的标签格式都正常，问题可能在其他地方')
    }
  } catch (error) {
    console.error('检查过程中发生错误:', error)
  } finally {
    process.exit(0)
  }
}

// 运行检查
checkProductionDailyCards().catch(console.error)
