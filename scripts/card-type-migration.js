#!/usr/bin/env node

const _path = require('path')
const { program } = require('commander')
const logger = require('../src/utils/logger')
const redis = require('../src/models/redis')
const cardTypeMigrationService = require('../src/services/cardTypeMigrationService')
const cardTypeService = require('../src/services/cardTypeService')

/**
 * 卡类型迁移命令行工具
 * 提供完整的迁移功能和管理命令
 */

// 确保Redis连接
async function ensureRedisConnection() {
  try {
    await redis.connect()
    logger.info('✅ Redis连接成功')
  } catch (error) {
    logger.error('❌ Redis连接失败:', error.message)
    process.exit(1)
  }
}

// 执行完整迁移
async function runMigration() {
  console.log('🚀 开始执行卡类型系统迁移...')

  try {
    await ensureRedisConnection()

    const result = await cardTypeMigrationService.executeMigration()

    if (result.success) {
      if (result.skipped) {
        console.log('✅ 迁移已完成（跳过重复迁移）')
        console.log(JSON.stringify(result.existingStatus, null, 2))
      } else {
        console.log('✅ 迁移执行成功')
        console.log(`⏱️ 耗时: ${result.duration}ms`)
        console.log('📊 迁移结果:')
        console.log(JSON.stringify(result.results, null, 2))
      }
    } else {
      console.error('❌ 迁移执行失败:', result.error)
      console.error(`迁移ID: ${result.migrationId}`)
    }
  } catch (error) {
    console.error('❌ 迁移过程中发生错误:', error.message)
    process.exit(1)
  } finally {
    await redis.disconnect()
    process.exit(0)
  }
}

// 检查迁移状态
async function checkStatus() {
  console.log('📊 检查迁移状态...')

  try {
    await ensureRedisConnection()

    const status = await cardTypeMigrationService.getMigrationStatus()
    console.log('当前迁移状态:')
    console.log(JSON.stringify(status, null, 2))
  } catch (error) {
    console.error('❌ 检查状态失败:', error.message)
    process.exit(1)
  } finally {
    await redis.disconnect()
    process.exit(0)
  }
}

// 分析现有数据
async function analyzeData() {
  console.log('🔍 分析现有硬编码数据...')

  try {
    await ensureRedisConnection()

    const analysis = await cardTypeMigrationService.analyzeExistingData()
    console.log('数据分析结果:')
    console.log(JSON.stringify(analysis, null, 2))

    // 额外的详细分析
    console.log('\\n📋 详细分析:')
    console.log(`总API Key数量: ${analysis.apiKeys.total}`)
    console.log(`日卡API Key: ${analysis.apiKeys.dailyCards}`)
    console.log(`月卡API Key: ${analysis.apiKeys.monthlyCards}`)
    console.log(`需要迁移的API Key: ${analysis.apiKeys.needsMigration}`)
    console.log(`总兑换码数量: ${analysis.redemptionCodes.total}`)
    console.log(`日卡兑换码: ${analysis.redemptionCodes.daily}`)
    console.log(`月卡兑换码: ${analysis.redemptionCodes.monthly}`)
  } catch (error) {
    console.error('❌ 数据分析失败:', error.message)
    process.exit(1)
  } finally {
    await redis.disconnect()
    process.exit(0)
  }
}

// 只创建内置卡类型
async function createBuiltinTypes() {
  console.log('🏗️ 创建内置卡类型...')

  try {
    await ensureRedisConnection()

    const result = await cardTypeMigrationService.createBuiltinCardTypes()

    if (result.success) {
      console.log('✅ 内置卡类型创建成功')
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.error('❌ 内置卡类型创建失败:', result.error)
    }
  } catch (error) {
    console.error('❌ 创建过程中发生错误:', error.message)
    process.exit(1)
  } finally {
    await redis.disconnect()
    process.exit(0)
  }
}

// 回滚迁移
async function rollbackMigration() {
  console.log('⚠️ 警告: 即将回滚卡类型迁移')
  console.log('这将移除所有迁移产生的数据，请确认操作...')

  // 简单的确认提示
  const readline = require('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  rl.question('输入 "CONFIRM" 确认回滚操作: ', async (answer) => {
    if (answer !== 'CONFIRM') {
      console.log('❌ 回滚操作已取消')
      rl.close()
      process.exit(0)
    }

    try {
      await ensureRedisConnection()

      const result = await cardTypeMigrationService.rollbackMigration()

      if (result.success) {
        console.log('✅ 迁移回滚成功')
        console.log(`回滚了 ${result.rollbackCount} 条记录`)
      } else {
        console.error('❌ 迁移回滚失败:', result.error)
      }
    } catch (error) {
      console.error('❌ 回滚过程中发生错误:', error.message)
      process.exit(1)
    } finally {
      await redis.disconnect()
      rl.close()
      process.exit(0)
    }
  })
}

// 列出卡类型
async function listCardTypes() {
  console.log('📋 列出所有卡类型...')

  try {
    await ensureRedisConnection()

    const cardTypes = await cardTypeService.getCardTypes()

    if (cardTypes.length === 0) {
      console.log('暂无卡类型')
    } else {
      console.log(`找到 ${cardTypes.length} 个卡类型:`)
      cardTypes.forEach((cardType) => {
        console.log(`\\n🏷️ ${cardType.name} (${cardType.id})`)
        console.log(`   类别: ${cardType.category}`)
        console.log(`   价格: $${cardType.priceUsd}`)
        console.log(`   Tokens: ${(cardType.totalTokens / 1000000).toFixed(0)}万`)
        console.log(`   有效期: ${cardType.duration}天`)
        console.log(`   内置: ${cardType.isBuiltIn ? '是' : '否'}`)
        if (cardType.migrationSource) {
          console.log(`   迁移来源: ${cardType.migrationSource}`)
        }
      })
    }
  } catch (error) {
    console.error('❌ 列出卡类型失败:', error.message)
    process.exit(1)
  } finally {
    await redis.disconnect()
    process.exit(0)
  }
}

// 测试迁移逻辑（dry-run模式）
async function testMigration() {
  console.log('🧪 测试迁移逻辑（不会实际修改数据）...')

  try {
    await ensureRedisConnection()

    // 分析数据
    const analysis = await cardTypeMigrationService.analyzeExistingData()
    console.log('📊 数据分析结果:')
    console.log(JSON.stringify(analysis, null, 2))

    // 检查内置卡类型是否存在
    const dailyExists = await cardTypeService.getCardType('builtin_daily')
    const monthlyExists = await cardTypeService.getCardType('builtin_monthly')

    console.log('\\n🏗️ 内置卡类型检查:')
    console.log(`日卡存在: ${dailyExists ? '是' : '否'}`)
    console.log(`月卡存在: ${monthlyExists ? '是' : '否'}`)

    // 模拟迁移效果
    console.log('\\n🔄 迁移效果预览:')
    console.log(`将迁移 ${analysis.apiKeys.needsMigration} 个API Key`)
    console.log(
      `将迁移 ${analysis.redemptionCodes.daily + analysis.redemptionCodes.monthly} 个兑换码`
    )

    console.log('\\n✅ 测试完成，没有修改任何数据')
  } catch (error) {
    console.error('❌ 测试失败:', error.message)
    process.exit(1)
  } finally {
    await redis.disconnect()
    process.exit(0)
  }
}

// 设置命令行选项
program.name('card-type-migration').description('卡类型系统迁移工具').version('1.0.0')

program.command('migrate').description('执行完整的迁移流程').action(runMigration)

program.command('status').description('检查迁移状态').action(checkStatus)

program.command('analyze').description('分析现有硬编码数据').action(analyzeData)

program.command('create-builtin').description('只创建内置卡类型').action(createBuiltinTypes)

program.command('rollback').description('回滚迁移（危险操作）').action(rollbackMigration)

program.command('list').description('列出所有卡类型').action(listCardTypes)

program.command('test').description('测试迁移逻辑（dry-run模式）').action(testMigration)

// 解析命令行参数
program.parse()

// 如果没有提供命令，显示帮助
if (!process.argv.slice(2).length) {
  program.outputHelp()
}
