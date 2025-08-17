#!/usr/bin/env node

/**
 * 检查项目中是否还有 naive-ui 引用的脚本
 * 用于排查构建错误
 */

const fs = require('fs')
const path = require('path')

function searchInFile(filePath, searchPattern) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n')
    const matches = []

    lines.forEach((line, index) => {
      if (line.includes(searchPattern)) {
        matches.push({
          line: index + 1,
          content: line.trim()
        })
      }
    })

    return matches
  } catch (error) {
    return []
  }
}

function searchDirectory(dirPath, searchPattern, extensions = ['.vue', '.js', '.ts', '.json']) {
  const results = []

  function walk(dir) {
    try {
      const files = fs.readdirSync(dir)

      for (const file of files) {
        const filePath = path.join(dir, file)
        const stat = fs.statSync(filePath)

        if (stat.isDirectory()) {
          // 跳过 node_modules 和 .git 目录
          if (!['node_modules', '.git', 'dist'].includes(file)) {
            walk(filePath)
          }
        } else if (extensions.some((ext) => file.endsWith(ext))) {
          const matches = searchInFile(filePath, searchPattern)
          if (matches.length > 0) {
            results.push({
              file: filePath,
              matches
            })
          }
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dir}:`, error.message)
    }
  }

  walk(dirPath)
  return results
}

// 主函数
function main() {
  console.log('🔍 检查 naive-ui 引用...\n')

  const projectRoot = path.resolve(__dirname, '..')
  const webAppPath = path.join(projectRoot, 'web', 'admin-spa')

  console.log(`检查目录: ${webAppPath}\n`)

  const patterns = [
    'naive-ui',
    'from "naive',
    "from 'naive",
    'import.*naive',
    '<n-button',
    '<n-card',
    '<n-form',
    'NButton',
    'NCard',
    'NForm'
  ]
  let totalFound = 0

  for (const pattern of patterns) {
    console.log(`🔍 搜索模式: "${pattern}"`)
    const results = searchDirectory(webAppPath, pattern)

    if (results.length > 0) {
      totalFound += results.length
      console.log(`❌ 找到 ${results.length} 个文件包含 "${pattern}":`)

      results.forEach((result) => {
        console.log(`  📄 ${result.file}`)
        result.matches.forEach((match) => {
          console.log(`    第 ${match.line} 行: ${match.content}`)
        })
      })
    } else {
      console.log(`✅ 未找到 "${pattern}" 引用`)
    }
    console.log('')
  }

  // 检查 package.json 依赖
  console.log('📦 检查 package.json 依赖:')
  const packageJsonPath = path.join(webAppPath, 'package.json')

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
    const naiveDeps = Object.keys(deps).filter((dep) => dep.includes('naive'))

    if (naiveDeps.length > 0) {
      console.log(`❌ 发现 naive-ui 依赖: ${naiveDeps.join(', ')}`)
      totalFound += naiveDeps.length
    } else {
      console.log('✅ package.json 中未找到 naive-ui 依赖')
    }
  } catch (error) {
    console.log(`❌ 无法读取 package.json: ${error.message}`)
  }

  console.log(`\n${'='.repeat(50)}`)

  if (totalFound === 0) {
    console.log('🎉 未发现任何 naive-ui 引用，本地代码库已清理完成！')
    console.log('\n如果服务器构建仍然失败，可能是以下原因:')
    console.log('1. 服务器代码未完全同步')
    console.log('2. 构建缓存未清理 (尝试删除 node_modules 和 dist)')
    console.log('3. Vite 缓存问题 (尝试删除 .vite 目录)')
  } else {
    console.log(`❌ 发现 ${totalFound} 个 naive-ui 引用需要清理`)
  }

  console.log('\n建议在服务器上运行以下命令:')
  console.log('cd /www/wwwroot/claude-relay-service')
  console.log('node scripts/check-naive-ui-refs.js')
  console.log('cd web/admin-spa')
  console.log('rm -rf node_modules dist .vite')
  console.log('npm install')
  console.log('npm run build')
}

if (require.main === module) {
  main()
}

module.exports = { searchDirectory, searchInFile }
