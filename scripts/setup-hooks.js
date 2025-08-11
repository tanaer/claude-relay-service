#!/usr/bin/env node

// 安装和配置 Husky pre-commit hooks
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

console.log('🔧 Setting up pre-commit hooks...')

try {
  // 安装 husky 和 lint-staged
  console.log('📦 Installing dependencies...')
  execSync('npm install --save-dev husky lint-staged', { stdio: 'inherit' })

  // 初始化 husky
  console.log('🐶 Initializing husky...')
  execSync('npx husky install', { stdio: 'inherit' })

  // 添加 pre-commit hook
  console.log('🪝 Adding pre-commit hook...')
  execSync('npx husky add .husky/pre-commit "npm run pre-commit"', { stdio: 'inherit' })

  // 设置 prepare 脚本
  console.log('⚙️ Setting up prepare script...')
  const packagePath = path.join(__dirname, '..', 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))

  if (!packageJson.scripts) {
    packageJson.scripts = {}
  }
  packageJson.scripts.prepare = 'husky install'

  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2))

  console.log('✅ Pre-commit hooks setup completed!')
  console.log('\n📋 What happens now:')
  console.log('  • Every git commit will automatically format and lint your code')
  console.log('  • If there are any issues, the commit will be blocked')
  console.log('  • To skip checks temporarily: git commit --no-verify')
  console.log('\n🎉 Happy coding!')
} catch (error) {
  console.error('❌ Setup failed:', error.message)
  process.exit(1)
}
