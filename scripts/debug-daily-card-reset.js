#!/usr/bin/env node

/**
 * 调试日卡重置问题的测试脚本
 */

const redis = require('../src/models/redis')
const logger = require('../src/utils/logger')
const apiKeyService = require('../src/services/apiKeyService')
const _dynamicPolicyEngine = require('../src/services/dynamicPolicyEngine')
const redemptionPolicyService = require('../src/services/redemptionPolicyService')

async function debugDailyCardReset() {
  try {
    logger.info('开始调试日卡重置问题...')

    // 1. 查找所有带有 daily-card 标签的 API Key
    console.log('\n=== 步骤1: 查找日卡API Key ===')

    let allApiKeys = []
    try {
      allApiKeys = await apiKeyService.getAllApiKeys()
    } catch (error) {
      console.log(`本地无API Key数据: ${error.message}`)
      console.log('如果要测试生产环境，请使用SSH连接到生产服务器运行此脚本')

      // 创建一个模拟的日卡API Key用于测试逻辑
      console.log('\n创建模拟日卡进行测试...')
      allApiKeys = [
        {
          id: 'test-daily-card-1',
          name: '测试日卡1',
          tags: '["daily-card", "redeemed"]' // JSON字符串格式
        },
        {
          id: 'test-daily-card-2',
          name: '测试日卡2',
          tags: ['daily-card', 'redeemed'] // 数组格式
        },
        {
          id: 'test-daily-card-3',
          name: '测试日卡3',
          tags: 'daily-card,redeemed' // 逗号分隔格式
        },
        {
          id: 'test-normal-key',
          name: '正常密钥',
          tags: '["normal"]'
        }
      ]
    }

    const dailyCardKeys = []

    for (const apiKey of allApiKeys) {
      if (apiKey.tags) {
        let tags = []
        try {
          if (typeof apiKey.tags === 'string') {
            // 尝试JSON解析
            try {
              tags = JSON.parse(apiKey.tags)
            } catch {
              // 如果JSON解析失败，按逗号分割
              tags = apiKey.tags.split(',').map((tag) => tag.trim())
            }
          } else if (Array.isArray(apiKey.tags)) {
            tags = [...apiKey.tags]
          }

          if (tags.includes('daily-card')) {
            dailyCardKeys.push({
              id: apiKey.id,
              name: apiKey.name,
              tags,
              rawTags: apiKey.tags
            })
            console.log(`找到日卡: ${apiKey.name} (${apiKey.id})`)
            console.log(`  标签格式: ${typeof apiKey.tags}`)
            console.log(`  原始标签: ${JSON.stringify(apiKey.tags)}`)
            console.log(`  解析后标签: ${JSON.stringify(tags)}`)
          }
        } catch (error) {
          console.error(`解析API Key ${apiKey.id} 标签失败:`, error.message)
        }
      }
    }

    console.log(`\n共找到 ${dailyCardKeys.length} 个日卡API Key`)

    if (dailyCardKeys.length === 0) {
      console.log('没有找到日卡，脚本结束')
      return
    }

    // 2. 测试每个日卡的重置逻辑
    console.log('\n=== 步骤2: 测试重置逻辑 ===')
    for (const apiKey of dailyCardKeys) {
      console.log(`\n测试API Key: ${apiKey.name} (${apiKey.id})`)

      // 获取API Key详细信息（模拟数据）
      const apiKeyData = apiKey // 使用模拟数据
      console.log(`  完整数据中的tags: ${JSON.stringify(apiKeyData.tags)}`)

      // 模拟dynamicPolicyEngine中的标签检查逻辑
      let tags = []
      try {
        if (typeof apiKeyData.tags === 'string') {
          tags = JSON.parse(apiKeyData.tags)
        } else if (Array.isArray(apiKeyData.tags)) {
          tags = [...apiKeyData.tags]
        }
      } catch (error) {
        // 如果解析失败，尝试按逗号分割
        tags =
          typeof apiKeyData.tags === 'string'
            ? apiKeyData.tags.split(',').map((tag) => tag.trim())
            : []
      }

      console.log(`  解析后的标签: ${JSON.stringify(tags)}`)
      const shouldSkip = tags.includes('daily-card')
      console.log(`  包含 daily-card: ${shouldSkip}`)

      if (shouldSkip) {
        console.log(`  ✅ 应该跳过重置`)
      } else {
        console.log(`  ❌ 不会跳过重置 - 这是问题所在!`)
      }

      // 检查是否有动态策略绑定
      const policyBinding = await redemptionPolicyService.getApiKeyPolicy(apiKey.id)
      if (policyBinding && policyBinding.isActive === 'true') {
        console.log(`  策略绑定: 活跃`)
        console.log(`  当前模板: ${policyBinding.currentTemplate}`)
        console.log(`  初始模板: ${policyBinding.initialTemplate}`)
      } else {
        console.log(`  策略绑定: 无或非活跃`)
      }
    }

    // 3. 检查活跃策略索引
    console.log('\n=== 步骤3: 检查活跃策略索引 ===')
    const activeApiKeys = await redis.smembers('active_policies:redemption')
    console.log(`活跃策略API Key数量: ${activeApiKeys.length}`)

    const dailyCardInActive = dailyCardKeys.filter((key) => activeApiKeys.includes(key.id))
    console.log(`其中日卡数量: ${dailyCardInActive.length}`)

    for (const apiKey of dailyCardInActive) {
      console.log(`  - ${apiKey.name} (${apiKey.id}) 在活跃列表中`)
    }

    // 4. 模拟完整的重置检查流程
    console.log('\n=== 步骤4: 模拟重置检查流程 ===')
    for (const apiKey of dailyCardKeys) {
      console.log(`\n模拟重置 API Key: ${apiKey.name}`)

      try {
        // 检查策略绑定
        const policyBinding = await redemptionPolicyService.getApiKeyPolicy(apiKey.id)
        if (!policyBinding || policyBinding.isActive !== 'true') {
          console.log(`  跳过: 无活跃策略绑定`)
          continue
        }

        // 检查API Key数据（模拟）
        const apiKeyData = apiKey
        if (apiKeyData && apiKeyData.tags) {
          let tags = []
          try {
            if (typeof apiKeyData.tags === 'string') {
              tags = JSON.parse(apiKeyData.tags)
            } else if (Array.isArray(apiKeyData.tags)) {
              tags = [...apiKeyData.tags]
            }
          } catch (error) {
            tags =
              typeof apiKeyData.tags === 'string'
                ? apiKeyData.tags.split(',').map((tag) => tag.trim())
                : []
          }

          if (tags.includes('daily-card')) {
            console.log(`  ✅ 检测到 daily-card 标签，应该跳过重置`)
          } else {
            console.log(`  ❌ 未检测到 daily-card 标签，会执行重置`)
            console.log(`    标签内容: ${JSON.stringify(tags)}`)
            console.log(`    原始标签: ${JSON.stringify(apiKeyData.tags)}`)
          }
        } else {
          console.log(`  ❌ 无标签信息，会执行重置`)
        }
      } catch (error) {
        console.error(`  错误: ${error.message}`)
      }
    }

    console.log('\n=== 调试完成 ===')
  } catch (error) {
    console.error('调试过程中发生错误:', error)
  } finally {
    process.exit(0)
  }
}

// 运行调试
debugDailyCardReset().catch(console.error)
