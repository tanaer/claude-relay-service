/**
 * 卡类型系统集成验证脚本
 * 在本地开发环境中测试集成功能（无需Redis连接）
 */

const logger = require('../src/utils/logger')

// 测试卡类型推断功能
async function testCardTypeInference() {
  logger.info('🔍 测试卡类型推断功能...')

  try {
    // 动态导入集成服务
    const cardTypeIntegrationService = require('../src/services/cardTypeIntegrationService')

    // 测试从标签推断
    const dailyInference = await cardTypeIntegrationService.inferCardTypeFromTags([
      'daily-card',
      'active'
    ])
    const monthlyInference = await cardTypeIntegrationService.inferCardTypeFromTags([
      'monthly-card',
      'premium'
    ])
    const noInference = await cardTypeIntegrationService.inferCardTypeFromTags(['unknown', 'tag'])

    console.log('📊 标签推断结果:')
    console.log(`  daily-card -> ${dailyInference}`)
    console.log(`  monthly-card -> ${monthlyInference}`)
    console.log(`  unknown -> ${noInference}`)

    // 测试从兑换码类型推断
    const dailyFromType = cardTypeIntegrationService.inferCardTypeFromRedemptionType('daily')
    const monthlyFromType = cardTypeIntegrationService.inferCardTypeFromRedemptionType('monthly')
    const unknownFromType = cardTypeIntegrationService.inferCardTypeFromRedemptionType('unknown')

    console.log('\n📊 类型推断结果:')
    console.log(`  daily -> ${dailyFromType}`)
    console.log(`  monthly -> ${monthlyFromType}`)
    console.log(`  unknown -> ${unknownFromType}`)

    const success =
      dailyInference === 'builtin_daily' &&
      monthlyInference === 'builtin_monthly' &&
      dailyFromType === 'builtin_daily' &&
      monthlyFromType === 'builtin_monthly'

    if (success) {
      logger.success('✅ 卡类型推断功能测试通过')
    } else {
      logger.error('❌ 卡类型推断功能测试失败')
    }

    return success
  } catch (error) {
    logger.error('❌ 推断功能测试出错:', error)
    return false
  }
}

// 测试数据增强功能
async function testDataEnhancement() {
  logger.info('🔍 测试数据增强功能...')

  try {
    const cardTypeIntegrationService = require('../src/services/cardTypeIntegrationService')

    // 测试API Key数据增强
    const mockApiKey = {
      id: 'test-key-1',
      name: 'Test API Key',
      tags: ['daily-card', 'test'],
      encryptedApiKey: 'encrypted_key_data'
    }

    const enhancedApiKey = await cardTypeIntegrationService.enhanceApiKeyData(mockApiKey)

    console.log('📊 API Key增强结果:')
    console.log(`  原始标签: ${mockApiKey.tags.join(', ')}`)
    console.log(`  建议卡类型: ${enhancedApiKey.suggestedCardTypeId}`)
    console.log(`  需要迁移: ${enhancedApiKey.migrationNeeded}`)

    // 测试兑换码数据增强
    const mockCode = {
      id: 'test-code-1',
      code: 'TEST123456',
      type: 'monthly'
    }

    const enhancedCode = await cardTypeIntegrationService.enhanceRedemptionCodeData(mockCode)

    console.log('\n📊 兑换码增强结果:')
    console.log(`  原始类型: ${mockCode.type}`)
    console.log(`  建议卡类型: ${enhancedCode.suggestedCardTypeId}`)
    console.log(`  需要迁移: ${enhancedCode.migrationNeeded}`)

    const success =
      enhancedApiKey.suggestedCardTypeId === 'builtin_daily' &&
      enhancedCode.suggestedCardTypeId === 'builtin_monthly'

    if (success) {
      logger.success('✅ 数据增强功能测试通过')
    } else {
      logger.error('❌ 数据增强功能测试失败')
    }

    return success
  } catch (error) {
    logger.error('❌ 数据增强测试出错:', error)
    return false
  }
}

// 测试兼容性验证
async function testCompatibilityValidation() {
  logger.info('🔍 测试兼容性验证功能...')

  try {
    const cardTypeIntegrationService = require('../src/services/cardTypeIntegrationService')

    // 测试符合标准的卡类型
    const standardCardType = {
      name: '标准测试卡',
      totalTokens: 1000000, // 100万tokens
      priceUsd: 1.0, // $1
      category: 'daily'
    }

    const standardValidation =
      await cardTypeIntegrationService.validateCardTypeCompatibility(standardCardType)

    console.log('📊 标准卡类型验证:')
    console.log(`  有效性: ${standardValidation.valid}`)
    console.log(`  问题数量: ${standardValidation.issues.length}`)
    console.log(`  警告数量: ${standardValidation.warnings.length}`)

    // 测试偏离标准的卡类型
    const nonStandardCardType = {
      name: '非标准测试卡',
      totalTokens: 500000, // 50万tokens
      priceUsd: 1.0, // $1 - 偏离50%标准
      category: 'monthly'
    }

    const nonStandardValidation =
      await cardTypeIntegrationService.validateCardTypeCompatibility(nonStandardCardType)

    console.log('\n📊 非标准卡类型验证:')
    console.log(`  有效性: ${nonStandardValidation.valid}`)
    console.log(`  问题数量: ${nonStandardValidation.issues.length}`)
    console.log(`  警告数量: ${nonStandardValidation.warnings.length}`)

    if (nonStandardValidation.warnings.length > 0) {
      console.log('  警告详情:', nonStandardValidation.warnings[0].message)
    }

    const success = standardValidation.valid && nonStandardValidation.warnings.length > 0

    if (success) {
      logger.success('✅ 兼容性验证功能测试通过')
    } else {
      logger.error('❌ 兼容性验证功能测试失败')
    }

    return success
  } catch (error) {
    logger.error('❌ 兼容性验证测试出错:', error)
    return false
  }
}

// 测试集成统计
async function testIntegrationStats() {
  logger.info('🔍 测试集成统计功能...')

  try {
    // 由于依赖真实的apiKeyService和redemptionCodeService，这里只做基本测试
    const cardTypeIntegrationService = require('../src/services/cardTypeIntegrationService')

    console.log('📊 验证集成统计服务加载...')

    // 测试服务方法是否正确加载
    const hasStatsMethod = typeof cardTypeIntegrationService.getIntegrationStats === 'function'
    const hasEnhanceMethod = typeof cardTypeIntegrationService.enhanceApiKeyData === 'function'
    const hasInferMethod = typeof cardTypeIntegrationService.inferCardTypeFromTags === 'function'

    console.log(`  getIntegrationStats方法: ${hasStatsMethod ? '✅' : '❌'}`)
    console.log(`  enhanceApiKeyData方法: ${hasEnhanceMethod ? '✅' : '❌'}`)
    console.log(`  inferCardTypeFromTags方法: ${hasInferMethod ? '✅' : '❌'}`)

    const success = hasStatsMethod && hasEnhanceMethod && hasInferMethod

    if (success) {
      logger.success('✅ 集成统计服务加载正确')
    } else {
      logger.error('❌ 集成统计服务方法缺失')
    }

    return success
  } catch (error) {
    logger.error('❌ 集成统计测试出错:', error)
    return false
  }
}

// 测试中间件加载
async function testMiddlewareIntegration() {
  logger.info('🔍 测试中间件集成功能...')

  try {
    const cardTypeIntegration = require('../src/middleware/cardTypeIntegration')

    console.log('📊 验证中间件方法加载...')

    const hasEnhanceApiKey = typeof cardTypeIntegration.enhanceApiKeyResponse === 'function'
    const hasEnhanceCode = typeof cardTypeIntegration.enhanceRedemptionCodeResponse === 'function'
    const hasPreprocess = typeof cardTypeIntegration.preprocessCardTypeRequests === 'function'
    const hasForAll = typeof cardTypeIntegration.forAll === 'function'

    console.log(`  enhanceApiKeyResponse: ${hasEnhanceApiKey ? '✅' : '❌'}`)
    console.log(`  enhanceRedemptionCodeResponse: ${hasEnhanceCode ? '✅' : '❌'}`)
    console.log(`  preprocessCardTypeRequests: ${hasPreprocess ? '✅' : '❌'}`)
    console.log(`  forAll: ${hasForAll ? '✅' : '❌'}`)

    const success = hasEnhanceApiKey && hasEnhanceCode && hasPreprocess && hasForAll

    if (success) {
      logger.success('✅ 中间件集成功能加载正确')
    } else {
      logger.error('❌ 中间件集成功能方法缺失')
    }

    return success
  } catch (error) {
    logger.error('❌ 中间件集成测试出错:', error)
    return false
  }
}

// 主测试函数
async function runIntegrationTests() {
  logger.info('🧪 开始卡类型系统集成验证...')

  const results = []

  try {
    // 运行各项测试
    const inferenceResult = await testCardTypeInference()
    results.push({ test: '推断功能', success: inferenceResult })

    const enhancementResult = await testDataEnhancement()
    results.push({ test: '数据增强', success: enhancementResult })

    const compatibilityResult = await testCompatibilityValidation()
    results.push({ test: '兼容性验证', success: compatibilityResult })

    const statsResult = await testIntegrationStats()
    results.push({ test: '集成统计', success: statsResult })

    const middlewareResult = await testMiddlewareIntegration()
    results.push({ test: '中间件集成', success: middlewareResult })

    // 统计结果
    const totalTests = results.length
    const passedTests = results.filter((r) => r.success).length
    const failedTests = totalTests - passedTests

    console.log('\n📊 测试结果汇总:')
    results.forEach((result) => {
      const status = result.success ? '✅ 通过' : '❌ 失败'
      console.log(`  ${result.test}: ${status}`)
    })

    console.log(`\n🧪 总计: ${passedTests}/${totalTests} 通过`)

    if (passedTests === totalTests) {
      logger.success('🎉 所有集成测试通过！卡类型系统集成就绪')
    } else {
      logger.warn(`⚠️ ${failedTests} 个测试失败，请检查相关功能`)
    }

    return {
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
      success: failedTests === 0,
      details: results
    }
  } catch (error) {
    logger.error('❌ 集成测试执行失败:', error)
    return { success: false, error: error.message }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  runIntegrationTests()
    .then((result) => {
      if (!result.success) {
        process.exit(1)
      }
    })
    .catch((error) => {
      console.error('❌ 测试脚本执行失败:', error)
      process.exit(1)
    })
}

module.exports = {
  runIntegrationTests,
  testCardTypeInference,
  testDataEnhancement,
  testCompatibilityValidation,
  testIntegrationStats,
  testMiddlewareIntegration
}
