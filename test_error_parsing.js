// 测试错误解析逻辑的变化
console.log('=== 测试错误解析逻辑变化 ===\n')

// 模拟旧逻辑和新逻辑的对比
function testErrorParsing() {
  const testCases = [
    {
      name: 'Insufficient balance JSON格式',
      responseBody: '{"error":"Insufficient balance"}'
    },
    {
      name: 'Claude API标准格式',
      responseBody: '{"error":{"message":"Insufficient balance to complete request"}}'
    },
    {
      name: '纯文本错误',
      responseBody: 'Insufficient balance'
    },
    {
      name: 'HTTP 502错误',
      responseBody: 'Bad Gateway'
    }
  ]

  testCases.forEach((testCase) => {
    console.log(`\n--- ${testCase.name} ---`)
    console.log(`原始响应体: ${testCase.responseBody}`)

    // 旧逻辑（提交前）
    const oldErrorMessage = testCase.responseBody || '未知错误'
    console.log(`旧逻辑提取的错误信息: "${oldErrorMessage}"`)

    // 新逻辑（最新提交后）
    let newErrorMessage = ''
    let parsedError = null

    try {
      if (testCase.responseBody) {
        parsedError = JSON.parse(testCase.responseBody)
        if (parsedError && parsedError.error && parsedError.error.message) {
          newErrorMessage = parsedError.error.message
        } else if (parsedError && parsedError.message) {
          newErrorMessage = parsedError.message
        } else if (parsedError && parsedError.detail) {
          newErrorMessage = parsedError.detail
        } else {
          newErrorMessage = testCase.responseBody
        }
      }
    } catch (e) {
      newErrorMessage = testCase.responseBody || `HTTP Error`
    }

    console.log(`新逻辑提取的错误信息: "${newErrorMessage}"`)

    // 测试智能限流匹配
    const testKeywords = ['Insufficient', 'insufficient', 'balance']

    const oldMatch = testKeywords.some((keyword) =>
      oldErrorMessage.toLowerCase().includes(keyword.toLowerCase())
    )

    const newMatch = testKeywords.some((keyword) =>
      newErrorMessage.toLowerCase().includes(keyword.toLowerCase())
    )

    console.log(`旧逻辑智能限流匹配: ${oldMatch ? '✓ 匹配' : '✗ 不匹配'}`)
    console.log(`新逻辑智能限流匹配: ${newMatch ? '✓ 匹配' : '✗ 不匹配'}`)

    if (oldMatch !== newMatch) {
      console.log(`🚨 匹配结果发生变化! 旧:${oldMatch} -> 新:${newMatch}`)
    }
  })
}

testErrorParsing()

console.log('\n=== 分析完成 ===')
console.log('如果发现匹配结果变化，说明最新提交的错误解析逻辑改动影响了智能限流。')
