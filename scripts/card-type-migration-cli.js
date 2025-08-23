#!/usr/bin/env node

/**
 * 卡类型系统迁移命令行工具
 *
 * 功能:
 * - 分析现有数据
 * - 预览迁移计划
 * - 执行批量迁移
 * - 验证迁移结果
 * - 生成迁移报告
 *
 * 使用示例:
 * node scripts/card-type-migration-cli.js analyze
 * node scripts/card-type-migration-cli.js migrate --dry-run
 * node scripts/card-type-migration-cli.js migrate --force
 * node scripts/card-type-migration-cli.js validate
 * node scripts/card-type-migration-cli.js rollback --confirm
 */

const { program } = require('commander')
const chalk = require('chalk')
const readline = require('readline')
const fs = require('fs').promises
const path = require('path')

// 引入服务
const CardTypeMigrationService = require('../src/services/cardTypeMigrationService')
const { logger } = require('../src/utils/logger')

// 创建读取输入接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

// 工具函数：询问用户确认
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve)
  })
}

// 工具函数：格式化时间
function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`
  }
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) {
    return `${seconds}秒`
  }
  const minutes = Math.floor(seconds / 60)
  return `${minutes}分${seconds % 60}秒`
}

// 工具函数：显示进度条
function showProgress(current, total, label = '') {
  const percentage = Math.floor((current / total) * 100)
  const barLength = 30
  const filledLength = Math.floor((current / total) * barLength)
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength)

  process.stdout.write(`\r${label} [${bar}] ${percentage}% (${current}/${total})`)

  if (current === total) {
    console.log() // 换行
  }
}

// 工具函数：创建报告文件
async function saveReport(data, filename) {
  const reportsDir = path.join(__dirname, '../reports')
  try {
    await fs.access(reportsDir)
  } catch {
    await fs.mkdir(reportsDir, { recursive: true })
  }

  const filepath = path.join(reportsDir, filename)
  await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf8')
  return filepath
}

// 分析命令：分析现有数据
async function analyzeCommand() {
  console.log(chalk.blue('🔍 开始分析现有数据...'))

  try {
    const analysis = await CardTypeMigrationService.analyzeData()

    console.log(chalk.green('\n📊 数据分析结果:'))
    console.log('─'.repeat(50))

    // API Keys 分析
    console.log(chalk.cyan('API Keys:'))
    console.log(`  总数: ${analysis.apiKeys.total}`)
    console.log(`  需迁移: ${chalk.yellow(analysis.apiKeys.needsMigration)}`)
    console.log(`  日卡: ${chalk.blue(analysis.apiKeys.dailyCards)}`)
    console.log(`  月卡: ${chalk.green(analysis.apiKeys.monthlyCards)}`)

    // 兑换码分析
    console.log(chalk.cyan('\n兑换码:'))
    console.log(`  总数: ${analysis.redemptionCodes.total}`)
    console.log(`  日卡: ${chalk.blue(analysis.redemptionCodes.daily)}`)
    console.log(`  月卡: ${chalk.green(analysis.redemptionCodes.monthly)}`)

    // 内置类型检查
    if (analysis.builtinTypes) {
      console.log(chalk.cyan('\n内置类型:'))
      console.log(`  日卡: ${analysis.builtinTypes.daily ? '✅ 已存在' : '❌ 不存在'}`)
      console.log(`  月卡: ${analysis.builtinTypes.monthly ? '✅ 已存在' : '❌ 不存在'}`)
    }

    // 保存分析报告
    const reportPath = await saveReport(analysis, `analysis-${Date.now()}.json`)
    console.log(chalk.gray(`\n📄 分析报告已保存: ${reportPath}`))
  } catch (error) {
    console.error(chalk.red('❌ 分析失败:'), error.message)
    logger.error('Migration CLI analysis failed:', error)
    process.exit(1)
  }
}

// 预览命令：预览迁移计划
async function previewCommand() {
  console.log(chalk.blue('👀 开始预览迁移计划...'))

  try {
    const preview = await CardTypeMigrationService.executeMigration({ dryRun: true })

    console.log(chalk.green('\n🔮 迁移预览:'))
    console.log('─'.repeat(50))

    // 内置类型状态
    console.log(chalk.cyan('内置类型:'))
    console.log(`  日卡: ${preview.builtinTypes.daily}`)
    console.log(`  月卡: ${preview.builtinTypes.monthly}`)

    // 预计变更
    console.log(chalk.cyan('\n预计变更:'))
    console.log(`  API Keys: ${preview.estimatedChanges.apiKeys} 条记录`)
    console.log(`  兑换码: ${preview.estimatedChanges.redemptionCodes} 条记录`)

    // 数据分析
    if (preview.analysis) {
      console.log(chalk.cyan('\n数据统计:'))
      console.log(`  总 API Keys: ${preview.analysis.apiKeys.total}`)
      console.log(`  需迁移: ${chalk.yellow(preview.analysis.apiKeys.needsMigration)}`)
    }

    // 保存预览报告
    const reportPath = await saveReport(preview, `preview-${Date.now()}.json`)
    console.log(chalk.gray(`\n📄 预览报告已保存: ${reportPath}`))
  } catch (error) {
    console.error(chalk.red('❌ 预览失败:'), error.message)
    logger.error('Migration CLI preview failed:', error)
    process.exit(1)
  }
}

// 迁移命令：执行迁移
async function migrateCommand(options) {
  const { dryRun, force } = options

  if (dryRun) {
    return await previewCommand()
  }

  console.log(chalk.blue('🚀 准备执行卡类型系统迁移...'))

  // 安全确认
  if (!force) {
    console.log(chalk.yellow('\n⚠️  警告: 此操作将修改现有的数据结构!'))
    console.log('   - API Keys 将从 tags 迁移到 cardTypeId')
    console.log('   - 兑换码将从 cardType 迁移到 cardTypeId')
    console.log('   - 建议先进行数据备份')

    const confirm = await askQuestion('\n确定要继续吗? (输入 "YES" 确认): ')
    if (confirm !== 'YES') {
      console.log(chalk.gray('迁移已取消'))
      rl.close()
      return
    }
  }

  console.log(chalk.blue('\n🔄 开始执行迁移...'))
  const startTime = Date.now()

  try {
    const result = await CardTypeMigrationService.executeMigration({
      dryRun: false,
      progressCallback: (current, total, type) => {
        showProgress(current, total, `迁移${type}`)
      }
    })

    const duration = Date.now() - startTime

    console.log(chalk.green('\n✅ 迁移执行完成!'))
    console.log('─'.repeat(50))
    console.log(`迁移ID: ${result.migrationId}`)
    console.log(`耗时: ${formatDuration(duration)}`)

    if (result.results) {
      console.log(chalk.cyan('\n迁移结果:'))
      console.log(`  API Keys: 已迁移 ${result.results.apiKeys?.migrated || 0} 个`)
      console.log(`  兑换码: 已迁移 ${result.results.redemption?.migrated || 0} 个`)
    }

    // 保存迁移报告
    const reportData = { ...result, duration, timestamp: new Date().toISOString() }
    const reportPath = await saveReport(reportData, `migration-${result.migrationId}.json`)
    console.log(chalk.gray(`\n📄 迁移报告已保存: ${reportPath}`))
  } catch (error) {
    console.error(chalk.red('\n❌ 迁移执行失败:'), error.message)
    logger.error('Migration CLI execution failed:', error)
    process.exit(1)
  } finally {
    rl.close()
  }
}

// 验证命令：验证迁移结果
async function validateCommand() {
  console.log(chalk.blue('🔍 开始验证迁移结果...'))

  try {
    const validation = await CardTypeMigrationService.validateMigration()

    console.log(chalk.green('\n📋 验证结果:'))
    console.log('─'.repeat(50))

    // 迁移状态
    const status = validation.migrationStatus.isCompleted ? '✅ 已完成' : '❌ 未完成'
    console.log(`迁移状态: ${status}`)

    if (validation.migrationStatus.endTime) {
      console.log(`完成时间: ${new Date(validation.migrationStatus.endTime).toLocaleString()}`)
    }

    // 内置类型验证
    console.log(chalk.cyan('\n内置类型:'))
    console.log(`  日卡存在: ${validation.builtinTypes.daily.exists ? '✅' : '❌'}`)
    console.log(`  日卡配置: ${validation.builtinTypes.daily.valid ? '✅' : '❌'}`)
    console.log(`  月卡存在: ${validation.builtinTypes.monthly.exists ? '✅' : '❌'}`)
    console.log(`  月卡配置: ${validation.builtinTypes.monthly.valid ? '✅' : '❌'}`)

    // 数据一致性
    console.log(chalk.cyan('\n数据一致性:'))
    console.log(`  API Keys 总数: ${validation.dataConsistency.apiKeys.total}`)
    console.log(`  需迁移: ${validation.dataConsistency.apiKeys.needsMigration}`)
    console.log(`  兑换码总数: ${validation.dataConsistency.redemptionCodes.total}`)

    // 建议
    if (validation.recommendations && validation.recommendations.length > 0) {
      console.log(chalk.yellow('\n⚠️  建议:'))
      validation.recommendations.forEach((rec) => {
        console.log(`  • ${rec}`)
      })
    }

    // 总体评估
    const isValid =
      validation.migrationStatus.isCompleted &&
      validation.builtinTypes.daily.valid &&
      validation.builtinTypes.monthly.valid &&
      validation.dataConsistency.apiKeys.needsMigration === 0

    console.log(`\n${'─'.repeat(50)}`)
    if (isValid) {
      console.log(chalk.green('🎉 验证通过! 迁移已成功完成。'))
    } else {
      console.log(chalk.red('⚠️  验证未通过，请检查上述问题。'))
    }

    // 保存验证报告
    const reportPath = await saveReport(validation, `validation-${Date.now()}.json`)
    console.log(chalk.gray(`\n📄 验证报告已保存: ${reportPath}`))
  } catch (error) {
    console.error(chalk.red('❌ 验证失败:'), error.message)
    logger.error('Migration CLI validation failed:', error)
    process.exit(1)
  }
}

// 回滚命令：回滚迁移
async function rollbackCommand(options) {
  const { confirm } = options

  console.log(chalk.red('🔄 准备回滚卡类型系统迁移...'))

  // 安全确认
  if (!confirm) {
    console.log(chalk.yellow('\n⚠️  警告: 此操作将撤销所有迁移变更!'))
    console.log('   - 将恢复到硬编码的日卡/月卡系统')
    console.log('   - 删除动态卡类型数据')
    console.log('   - 此操作不可撤销')

    const userConfirm = await askQuestion('\n确定要回滚吗? (输入 "ROLLBACK" 确认): ')
    if (userConfirm !== 'ROLLBACK') {
      console.log(chalk.gray('回滚已取消'))
      rl.close()
      return
    }
  }

  console.log(chalk.red('\n🔄 开始执行回滚...'))
  const startTime = Date.now()

  try {
    const result = await CardTypeMigrationService.rollbackMigration({
      confirm: 'CONFIRM_ROLLBACK'
    })

    const duration = Date.now() - startTime

    if (result.success) {
      console.log(chalk.green('\n✅ 回滚执行完成!'))
      console.log(`耗时: ${formatDuration(duration)}`)

      // 保存回滚报告
      const reportData = { ...result, duration, timestamp: new Date().toISOString() }
      const reportPath = await saveReport(reportData, `rollback-${Date.now()}.json`)
      console.log(chalk.gray(`\n📄 回滚报告已保存: ${reportPath}`))
    } else {
      throw new Error(result.error || '回滚失败')
    }
  } catch (error) {
    console.error(chalk.red('\n❌ 回滚执行失败:'), error.message)
    logger.error('Migration CLI rollback failed:', error)
    process.exit(1)
  } finally {
    rl.close()
  }
}

// 状态命令：查看迁移状态
async function statusCommand() {
  console.log(chalk.blue('📊 查看迁移状态...'))

  try {
    const status = await CardTypeMigrationService.getMigrationStatus()

    console.log(chalk.green('\n📈 迁移状态:'))
    console.log('─'.repeat(50))

    const statusText = status.isCompleted
      ? '✅ 已完成'
      : status.inProgress
        ? '🔄 进行中'
        : '⏸️  未开始'
    console.log(`状态: ${statusText}`)

    if (status.startTime) {
      console.log(`开始时间: ${new Date(status.startTime).toLocaleString()}`)
    }

    if (status.endTime) {
      console.log(`完成时间: ${new Date(status.endTime).toLocaleString()}`)
    }

    if (status.duration) {
      console.log(`耗时: ${formatDuration(status.duration)}`)
    }

    if (status.migrationId) {
      console.log(`迁移ID: ${status.migrationId}`)
    }
  } catch (error) {
    console.error(chalk.red('❌ 获取状态失败:'), error.message)
    logger.error('Migration CLI status failed:', error)
    process.exit(1)
  }
}

// 配置命令行界面
program.name('card-type-migration-cli').description('卡类型系统迁移命令行工具').version('1.0.0')

// 分析命令
program.command('analyze').description('分析现有数据，生成迁移计划').action(analyzeCommand)

// 预览命令
program.command('preview').description('预览迁移计划，不执行实际迁移').action(previewCommand)

// 迁移命令
program
  .command('migrate')
  .description('执行卡类型系统迁移')
  .option('--dry-run', '仅预览，不执行实际迁移')
  .option('--force', '跳过安全确认，强制执行')
  .action(migrateCommand)

// 验证命令
program.command('validate').description('验证迁移结果的完整性和正确性').action(validateCommand)

// 回滚命令
program
  .command('rollback')
  .description('回滚迁移，恢复到硬编码系统')
  .option('--confirm', '跳过安全确认，强制回滚')
  .action(rollbackCommand)

// 状态命令
program.command('status').description('查看当前迁移状态').action(statusCommand)

// 解析命令行参数
program.parse()
