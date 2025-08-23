#!/usr/bin/env node

/**
 * 测试日卡重置逻辑 - 模拟完整的重置流程
 */

const _logger = require('../src/utils/logger')

// 模拟 dynamicPolicyEngine 中的重置逻辑
function simulateResetApiKeyPolicy(apiKeyId, apiKeyData, policyBinding) {
  console.log(`\n🔄 模拟重置 API Key: ${apiKeyId}`)

  try {
    // 步骤1: 检查策略绑定
    if (!policyBinding || policyBinding.isActive !== 'true') {
      console.log('  ⏭️  跳过: 无活跃策略绑定')
      return { skipped: true, reason: 'no_active_policy' }
    }
    console.log('  ✅ 有活跃策略绑定')

    // 步骤2: 检查API Key标签（关键逻辑）
    if (apiKeyData && apiKeyData.tags) {
      let tags = []
      try {
        if (typeof apiKeyData.tags === 'string') {
          // 尝试JSON解析
          try {
            tags = JSON.parse(apiKeyData.tags)
          } catch {
            // JSON解析失败，按逗号分割
            tags = apiKeyData.tags.split(',').map((tag) => tag.trim())
          }
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

      console.log(`  📋 原始标签: ${JSON.stringify(apiKeyData.tags)}`)
      console.log(`  🏷️  解析标签: ${JSON.stringify(tags)}`)

      // 关键检查：是否包含 daily-card
      if (tags.includes('daily-card')) {
        console.log(`  🛡️  检测到 daily-card 标签，跳过每日重置`)
        return { skipped: true, reason: 'daily_card_detected' }
      } else {
        console.log(`  ⚠️  未检测到 daily-card 标签，将执行重置`)
      }
    } else {
      console.log(`  ⚠️  无标签信息，将执行重置`)
    }

    // 步骤3: 执行重置逻辑
    const { metadata: _metadata } = policyBinding
    const { initialTemplate } = policyBinding

    if (policyBinding.currentTemplate !== initialTemplate) {
      console.log(`  🔄 执行模板切换: ${policyBinding.currentTemplate} -> ${initialTemplate}`)
    } else {
      console.log(`  ✅ 已是初始模板，更新状态`)
    }

    console.log(`  ✅ 重置完成`)
    return { skipped: false, reason: 'reset_completed' }
  } catch (error) {
    console.error(`  ❌ 重置失败: ${error.message}`)
    return { skipped: false, reason: 'error', error: error.message }
  }
}

async function testResetLogic() {
  try {
    console.log('🧪 测试日卡重置逻辑')
    console.log('=' * 50)

    // 测试场景1: JSON字符串格式的日卡
    console.log('\n📋 场景1: JSON字符串格式的日卡')
    const scenario1 = {
      apiKeyId: 'daily-card-json',
      apiKeyData: {
        id: 'daily-card-json',
        name: '日卡-JSON格式',
        tags: '["daily-card", "redeemed"]'
      },
      policyBinding: {
        isActive: 'true',
        currentTemplate: 'high-rate',
        initialTemplate: 'normal-rate',
        metadata: { originalCode: 'test' }
      }
    }
    const result1 = simulateResetApiKeyPolicy(
      scenario1.apiKeyId,
      scenario1.apiKeyData,
      scenario1.policyBinding
    )
    console.log(`  🎯 结果: ${result1.skipped ? '跳过重置' : '执行重置'} - ${result1.reason}`)

    // 测试场景2: 数组格式的日卡
    console.log('\n📋 场景2: 数组格式的日卡')
    const scenario2 = {
      apiKeyId: 'daily-card-array',
      apiKeyData: {
        id: 'daily-card-array',
        name: '日卡-数组格式',
        tags: ['daily-card', 'redeemed']
      },
      policyBinding: {
        isActive: 'true',
        currentTemplate: 'high-rate',
        initialTemplate: 'normal-rate',
        metadata: { originalCode: 'test' }
      }
    }
    const result2 = simulateResetApiKeyPolicy(
      scenario2.apiKeyId,
      scenario2.apiKeyData,
      scenario2.policyBinding
    )
    console.log(`  🎯 结果: ${result2.skipped ? '跳过重置' : '执行重置'} - ${result2.reason}`)

    // 测试场景3: 逗号分隔格式的日卡
    console.log('\n📋 场景3: 逗号分隔格式的日卡')
    const scenario3 = {
      apiKeyId: 'daily-card-csv',
      apiKeyData: {
        id: 'daily-card-csv',
        name: '日卡-逗号分隔格式',
        tags: 'daily-card,redeemed'
      },
      policyBinding: {
        isActive: 'true',
        currentTemplate: 'high-rate',
        initialTemplate: 'normal-rate',
        metadata: { originalCode: 'test' }
      }
    }
    const result3 = simulateResetApiKeyPolicy(
      scenario3.apiKeyId,
      scenario3.apiKeyData,
      scenario3.policyBinding
    )
    console.log(`  🎯 结果: ${result3.skipped ? '跳过重置' : '执行重置'} - ${result3.reason}`)

    // 测试场景4: 普通API Key（非日卡）
    console.log('\n📋 场景4: 普通API Key（非日卡）')
    const scenario4 = {
      apiKeyId: 'normal-key',
      apiKeyData: {
        id: 'normal-key',
        name: '普通密钥',
        tags: '["normal", "user-created"]'
      },
      policyBinding: {
        isActive: 'true',
        currentTemplate: 'high-rate',
        initialTemplate: 'normal-rate',
        metadata: { originalCode: 'test' }
      }
    }
    const result4 = simulateResetApiKeyPolicy(
      scenario4.apiKeyId,
      scenario4.apiKeyData,
      scenario4.policyBinding
    )
    console.log(`  🎯 结果: ${result4.skipped ? '跳过重置' : '执行重置'} - ${result4.reason}`)

    // 测试场景5: 无标签的API Key
    console.log('\n📋 场景5: 无标签的API Key')
    const scenario5 = {
      apiKeyId: 'no-tags-key',
      apiKeyData: {
        id: 'no-tags-key',
        name: '无标签密钥',
        tags: null
      },
      policyBinding: {
        isActive: 'true',
        currentTemplate: 'high-rate',
        initialTemplate: 'normal-rate',
        metadata: { originalCode: 'test' }
      }
    }
    const result5 = simulateResetApiKeyPolicy(
      scenario5.apiKeyId,
      scenario5.apiKeyData,
      scenario5.policyBinding
    )
    console.log(`  🎯 结果: ${result5.skipped ? '跳过重置' : '执行重置'} - ${result5.reason}`)

    // 测试场景6: 无策略绑定的日卡
    console.log('\n📋 场景6: 无策略绑定的日卡')
    const scenario6 = {
      apiKeyId: 'daily-card-no-policy',
      apiKeyData: {
        id: 'daily-card-no-policy',
        name: '日卡-无策略',
        tags: '["daily-card", "redeemed"]'
      },
      policyBinding: null
    }
    const result6 = simulateResetApiKeyPolicy(
      scenario6.apiKeyId,
      scenario6.apiKeyData,
      scenario6.policyBinding
    )
    console.log(`  🎯 结果: ${result6.skipped ? '跳过重置' : '执行重置'} - ${result6.reason}`)

    // 测试场景7: 问题场景 - tags字段格式异常
    console.log('\n📋 场景7: 异常格式测试')
    const problemScenarios = [
      {
        name: '空字符串tags',
        tags: ''
      },
      {
        name: '不规范JSON',
        tags: '["daily-card", redeemed]' // 缺少引号
      },
      {
        name: '混合格式',
        tags: 'daily-card,["redeemed"]'
      },
      {
        name: '包含空格的逗号分隔',
        tags: ' daily-card , redeemed '
      }
    ]

    for (const scenario of problemScenarios) {
      console.log(`\n  🔬 测试: ${scenario.name}`)
      const testData = {
        apiKeyId: 'test-problem',
        apiKeyData: {
          id: 'test-problem',
          name: scenario.name,
          tags: scenario.tags
        },
        policyBinding: {
          isActive: 'true',
          currentTemplate: 'high-rate',
          initialTemplate: 'normal-rate',
          metadata: { originalCode: 'test' }
        }
      }
      const result = simulateResetApiKeyPolicy(
        testData.apiKeyId,
        testData.apiKeyData,
        testData.policyBinding
      )
      console.log(`    🎯 结果: ${result.skipped ? '跳过重置' : '执行重置'} - ${result.reason}`)
    }

    console.log(`\n` + `${'=' * 50}`)
    console.log('📊 测试总结:')
    console.log('- 标准格式的 daily-card 标签都能正确识别并跳过重置')
    console.log('- 异常格式可能导致标签解析失败，从而执行重置')
    console.log('- 如果生产环境中日卡仍被重置，可能原因：')
    console.log('  1. 日卡的 tags 字段格式异常')
    console.log('  2. 日卡没有动态策略绑定（会在策略检查阶段就跳过）')
    console.log('  3. 标签中的 daily-card 拼写或格式不正确')
    console.log('  4. 重置逻辑中有其他代码路径绕过了标签检查')
  } catch (error) {
    console.error('测试过程中发生错误:', error)
  }
}

// 运行测试
testResetLogic().catch(console.error)
