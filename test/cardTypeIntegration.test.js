const request = require('supertest')
const app = require('../src/app')
const cardTypeService = require('../src/services/cardTypeService')
const cardTypeIntegrationService = require('../src/services/cardTypeIntegrationService')
const logger = require('../src/utils/logger')

/**
 * 卡类型系统集成测试
 * 验证API路由、中间件和服务的集成情况
 */
class CardTypeIntegrationTest {
  constructor() {
    this.testResults = []
  }

  /**
   * 记录测试结果
   */
  logResult(testName, success, message, details = null) {
    const result = {
      test: testName,
      success,
      message,
      details,
      timestamp: new Date().toISOString()
    }

    this.testResults.push(result)

    if (success) {
      logger.success(`✅ ${testName}: ${message}`)
    } else {
      logger.error(`❌ ${testName}: ${message}`)
      if (details) {
        logger.error(`   详细信息: ${JSON.stringify(details, null, 2)}`)
      }
    }
  }

  /**
   * 测试基础API路由可达性
   */
  async testBasicRouteAccess() {
    try {
      // 模拟管理员认证（这里需要根据实际认证机制调整）
      const adminToken = 'mock_admin_token' // 实际应用中需要真实的token

      const response = await request(app)
        .get('/admin/card-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      this.logResult('基础路由访问', response.status === 200, '卡类型列表API可访问', {
        status: response.status
      })
    } catch (error) {
      this.logResult('基础路由访问', false, '路由访问失败', { error: error.message })
    }
  }

  /**
   * 测试卡类型推断功能
   */
  async testCardTypeInference() {
    try {
      // 测试从标签推断
      const dailyInference = await cardTypeIntegrationService.inferCardTypeFromTags([
        'daily-card',
        'active'
      ])
      const monthlyInference = await cardTypeIntegrationService.inferCardTypeFromTags([
        'monthly-card',
        'premium'
      ])

      this.logResult(
        '标签推断测试',
        dailyInference === 'builtin_daily' && monthlyInference === 'builtin_monthly',
        '标签到卡类型推断正常',
        { daily: dailyInference, monthly: monthlyInference }
      )

      // 测试从兑换码类型推断
      const dailyFromType = cardTypeIntegrationService.inferCardTypeFromRedemptionType('daily')
      const monthlyFromType = cardTypeIntegrationService.inferCardTypeFromRedemptionType('monthly')

      this.logResult(
        '类型推断测试',
        dailyFromType === 'builtin_daily' && monthlyFromType === 'builtin_monthly',
        '兑换码类型到卡类型推断正常',
        { daily: dailyFromType, monthly: monthlyFromType }
      )
    } catch (error) {
      this.logResult('卡类型推断', false, '推断功能测试失败', { error: error.message })
    }
  }

  /**
   * 测试服务集成统计
   */
  async testIntegrationStats() {
    try {
      const stats = await cardTypeIntegrationService.getIntegrationStats()

      const hasExpectedFields = stats.apiKeys && stats.redemptionCodes && stats.overall

      this.logResult('集成统计测试', hasExpectedFields, '集成统计数据结构正确', {
        apiKeysTotal: stats.apiKeys?.total,
        codesTotal: stats.redemptionCodes?.total,
        overallTotal: stats.overall?.totalItems
      })
    } catch (error) {
      this.logResult('集成统计', false, '集成统计获取失败', { error: error.message })
    }
  }

  /**
   * 测试内置卡类型是否存在
   */
  async testBuiltinCardTypes() {
    try {
      const dailyCard = await cardTypeService.getCardType('builtin_daily')
      const monthlyCard = await cardTypeService.getCardType('builtin_monthly')

      this.logResult('内置卡类型检查', !!dailyCard && !!monthlyCard, '内置卡类型存在检查', {
        dailyExists: !!dailyCard,
        monthlyExists: !!monthlyCard,
        dailyName: dailyCard?.name,
        monthlyName: monthlyCard?.name
      })
    } catch (error) {
      this.logResult('内置卡类型', false, '内置卡类型检查失败', { error: error.message })
    }
  }

  /**
   * 测试API响应增强功能
   */
  async testResponseEnhancement() {
    try {
      // 测试API Key响应增强
      const mockApiKey = {
        id: 'test-key-1',
        name: 'Test Key',
        tags: ['daily-card'],
        encryptedApiKey: 'encrypted_key_data'
      }

      const enhancedApiKey = await cardTypeIntegrationService.enhanceApiKeyData(mockApiKey)

      const hasEnhancement = enhancedApiKey.suggestedCardTypeId || enhancedApiKey.cardTypeInfo

      this.logResult('API Key响应增强', hasEnhancement, 'API Key数据增强功能正常', {
        suggested: enhancedApiKey.suggestedCardTypeId,
        migrationNeeded: enhancedApiKey.migrationNeeded
      })

      // 测试兑换码响应增强
      const mockCode = {
        id: 'test-code-1',
        code: 'TEST123',
        type: 'daily'
      }

      const enhancedCode = await cardTypeIntegrationService.enhanceRedemptionCodeData(mockCode)

      const hasCodeEnhancement = enhancedCode.suggestedCardTypeId || enhancedCode.cardTypeInfo

      this.logResult('兑换码响应增强', hasCodeEnhancement, '兑换码数据增强功能正常', {
        suggested: enhancedCode.suggestedCardTypeId,
        migrationNeeded: enhancedCode.migrationNeeded
      })
    } catch (error) {
      this.logResult('响应增强', false, '响应增强功能测试失败', { error: error.message })
    }
  }

  /**
   * 测试兼容性验证
   */
  async testCompatibilityValidation() {
    try {
      const mockCardType = {
        name: '测试卡类型',
        totalTokens: 1000000, // 100万tokens
        priceUsd: 1.0, // $1
        category: 'daily'
      }

      const validation =
        await cardTypeIntegrationService.validateCardTypeCompatibility(mockCardType)

      this.logResult('兼容性验证', validation.valid !== undefined, '卡类型兼容性验证功能正常', {
        valid: validation.valid,
        issuesCount: validation.issues?.length,
        warningsCount: validation.warnings?.length
      })
    } catch (error) {
      this.logResult('兼容性验证', false, '兼容性验证测试失败', { error: error.message })
    }
  }

  /**
   * 运行所有集成测试
   */
  async runAllTests() {
    logger.info('🧪 开始卡类型系统集成测试...')

    this.testResults = []

    // 运行各项测试
    await this.testCardTypeInference()
    await this.testBuiltinCardTypes()
    await this.testIntegrationStats()
    await this.testResponseEnhancement()
    await this.testCompatibilityValidation()
    // await this.testBasicRouteAccess() // 需要真实认证，暂时跳过

    // 统计结果
    const totalTests = this.testResults.length
    const passedTests = this.testResults.filter((r) => r.success).length
    const failedTests = totalTests - passedTests

    logger.info(`🧪 集成测试完成: ${passedTests}/${totalTests} 通过`)

    if (failedTests > 0) {
      logger.warn(`⚠️ ${failedTests} 个测试失败，请检查详细日志`)
    }

    return {
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
      success: failedTests === 0,
      results: this.testResults
    }
  }

  /**
   * 生成测试报告
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.testResults.length,
        passed: this.testResults.filter((r) => r.success).length,
        failed: this.testResults.filter((r) => !r.success).length
      },
      details: this.testResults
    }

    return report
  }
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
  const tester = new CardTypeIntegrationTest()

  tester
    .runAllTests()
    .then((result) => {
      console.log('\n📊 最终测试结果:')
      console.log(JSON.stringify(result, null, 2))

      if (!result.success) {
        process.exit(1)
      }
    })
    .catch((error) => {
      console.error('❌ 测试执行失败:', error)
      process.exit(1)
    })
}

module.exports = CardTypeIntegrationTest
