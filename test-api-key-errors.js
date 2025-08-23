const axios = require('axios')

// 配置
const API_BASE_URL = 'http://localhost:3000'
const ADMIN_USERNAME = 'admin'
const ADMIN_PASSWORD = 'admin123'

async function testApiKeyErrors() {
  try {
    // 1. 登录获取 token
    console.log('1. 登录管理员账户...')
    const loginResponse = await axios.post(`${API_BASE_URL}/admin/login`, {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD
    })
    const { token } = loginResponse.data.data
    console.log('✓ 登录成功')

    // 2. 获取所有 API Keys
    console.log('\n2. 获取 API Keys 列表...')
    const apiKeysResponse = await axios.get(`${API_BASE_URL}/admin/api-keys`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { timeRange: 'today' }
    })
    const apiKeys = apiKeysResponse.data.data
    console.log(`✓ 找到 ${apiKeys.length} 个 API Keys`)

    if (apiKeys.length === 0) {
      console.log('⚠️ 没有 API Keys，跳过测试')
      return
    }

    // 3. 获取 API Keys 的报错统计
    console.log('\n3. 获取 API Keys 报错统计...')
    const keyIds = apiKeys.map((key) => key.id)
    const errorCountsResponse = await axios.post(
      `${API_BASE_URL}/admin/api-keys/error-counts`,
      { apiKeyIds: keyIds },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const errorCounts = errorCountsResponse.data.data
    console.log('✓ 报错统计:', errorCounts)

    // 4. 获取有报错的 API Key 详情
    const keysWithErrors = Object.entries(errorCounts)
      .filter(([_keyId, count]) => count > 0)
      .map(([keyId]) => keyId)

    if (keysWithErrors.length > 0) {
      console.log(`\n4. 发现 ${keysWithErrors.length} 个有报错的 API Keys`)

      for (const keyId of keysWithErrors.slice(0, 2)) {
        // 只测试前2个
        console.log(`\n   获取 API Key ${keyId} 的报错详情...`)
        const errorDetailsResponse = await axios.get(
          `${API_BASE_URL}/admin/api-keys/${keyId}/upstream-errors`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const errors = errorDetailsResponse.data.data
        console.log(`   ✓ 找到 ${errors.length} 条错误记录`)

        if (errors.length > 0) {
          console.log('   示例错误:')
          const error = errors[0]
          console.log(`     - 账户: ${error.accountName} (${error.accountType})`)
          console.log(`     - 状态码: ${error.statusCode}`)
          console.log(`     - 消息: ${error.errorMessage}`)
          console.log(`     - 次数: ${error.count}`)
          console.log(`     - 最近时间: ${error.lastTime}`)
        }
      }
    } else {
      console.log('\n4. 没有发现有报错的 API Keys')
    }

    console.log('\n✅ 测试完成！')
  } catch (error) {
    console.error('\n❌ 测试失败:', error.response?.data || error.message)
  }
}

// 运行测试
testApiKeyErrors()
