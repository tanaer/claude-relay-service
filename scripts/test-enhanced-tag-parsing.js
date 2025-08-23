#!/usr/bin/env node

/**
 * 测试增强的标签解析逻辑
 */

// 模拟增强的标签解析逻辑
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
          console.log(`  JSON解析失败，尝试其他方式: ${jsonError.message}`)
          // JSON解析失败，按逗号分割
          parsedTags = trimmedTags
            .slice(1, -1)
            .split(',')
            .map((tag) =>
              // 移除引号和空格
              tag.replace(/['"]/g, '').trim()
            )
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
    console.log(`  标签解析失败: ${error.message}, 使用空标签列表`)
    parsedTags = []
  }

  return parsedTags
}

console.log('🧪 测试增强的标签解析逻辑\n')

const testCases = [
  {
    name: '正常JSON数组',
    tags: '["daily-card", "redeemed"]',
    expected: ['daily-card', 'redeemed']
  },
  {
    name: '正常数组',
    tags: ['daily-card', 'redeemed'],
    expected: ['daily-card', 'redeemed']
  },
  {
    name: '逗号分隔',
    tags: 'daily-card,redeemed',
    expected: ['daily-card', 'redeemed']
  },
  {
    name: '包含空格的逗号分隔',
    tags: ' daily-card , redeemed ',
    expected: ['daily-card', 'redeemed']
  },
  {
    name: '不规范JSON（缺少引号）',
    tags: '["daily-card", redeemed]',
    expected: ['daily-card', 'redeemed'] // 期望能修复
  },
  {
    name: '不规范JSON（单引号）',
    tags: "['daily-card', 'redeemed']",
    expected: ['daily-card', 'redeemed'] // 期望能修复
  },
  {
    name: '混合引号',
    tags: '["daily-card\', "redeemed"]',
    expected: ['daily-card', 'redeemed'] // 期望能修复
  },
  {
    name: '空字符串',
    tags: '',
    expected: []
  },
  {
    name: '空数组字符串',
    tags: '[]',
    expected: []
  },
  {
    name: '单个标签',
    tags: 'daily-card',
    expected: ['daily-card']
  },
  {
    name: '单个标签JSON',
    tags: '["daily-card"]',
    expected: ['daily-card']
  }
]

let passCount = 0
let failCount = 0

for (const testCase of testCases) {
  console.log(`📋 测试: ${testCase.name}`)
  console.log(`  输入: ${JSON.stringify(testCase.tags)}`)

  const result = parseTagsEnhanced(testCase.tags)
  console.log(`  输出: ${JSON.stringify(result)}`)
  console.log(`  期望: ${JSON.stringify(testCase.expected)}`)

  const hasDailyCard = result.includes('daily-card')
  const expectedDailyCard = testCase.expected.includes('daily-card')

  if (hasDailyCard === expectedDailyCard) {
    console.log(`  ✅ 通过 - daily-card检测: ${hasDailyCard}`)
    passCount++
  } else {
    console.log(`  ❌ 失败 - daily-card检测期望${expectedDailyCard}，实际${hasDailyCard}`)
    failCount++
  }

  console.log()
}

console.log(`📊 测试结果: ${passCount} 通过, ${failCount} 失败`)

if (failCount === 0) {
  console.log('🎉 所有测试通过！增强的解析逻辑应该能正确处理日卡标签。')
} else {
  console.log('⚠️ 存在测试失败，需要进一步改进解析逻辑。')
}
