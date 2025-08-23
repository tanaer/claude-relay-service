const cardTypeService = require('./src/services/cardTypeService')
// const logger = require('./src/utils/logger') // 未使用，已注释

async function testCardTypeService() {
  console.log('🧪 开始测试卡类型服务...')

  try {
    // 1. 测试初始化内置卡类型
    console.log('\n📋 测试1: 初始化内置卡类型')
    const initResult = await cardTypeService.initializeBuiltinCardTypes()
    console.log('初始化结果:', JSON.stringify(initResult, null, 2))

    // 2. 测试获取所有卡类型
    console.log('\n📋 测试2: 获取所有卡类型')
    const allCardTypes = await cardTypeService.getAllCardTypes()
    console.log(`找到 ${allCardTypes.length} 个卡类型:`)
    allCardTypes.forEach((cardType) => {
      console.log(
        `  - ${cardType.name} (${cardType.category}) - ${cardType.isActive ? '启用' : '禁用'}`
      )
    })

    // 3. 测试创建新卡类型
    console.log('\n📋 测试3: 创建新卡类型')
    const newCardType = {
      name: '测试周卡',
      description: '测试用的周卡类型',
      category: 'daily', // 使用daily分类作为测试
      duration: 7,
      dailyReset: true,
      totalTokens: 7000000, // 700万tokens
      dailyTokens: 1000000, // 每日100万tokens
      priceUsd: 7 // $7
    }

    const createResult = await cardTypeService.createCardType(newCardType)
    console.log('创建结果:', JSON.stringify(createResult, null, 2))

    // 4. 测试统计信息
    console.log('\n📋 测试4: 获取统计信息')
    const stats = await cardTypeService.getCardTypeStats()
    console.log('统计信息:', JSON.stringify(stats, null, 2))

    console.log('\n✅ 所有测试完成!')
  } catch (error) {
    console.error('❌ 测试失败:', error)
  } finally {
    process.exit(0)
  }
}

testCardTypeService()
