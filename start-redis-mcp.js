#!/usr/bin/env node

/**
 * Redis MCP 服务启动脚本
 * 用于启动和测试 @modelcontextprotocol/server-redis 服务
 */

const { spawn } = require('child_process')
const path = require('path')

// Redis 连接配置
const REDIS_CONFIG = {
  host: '101.36.120.191',
  port: 6666,
  password: 'qq123456.',
  db: 0
}

// 构建 Redis URL
const REDIS_URL = `redis://:${REDIS_CONFIG.password}@${REDIS_CONFIG.host}:${REDIS_CONFIG.port}/${REDIS_CONFIG.db}`

console.log('🚀 启动 Redis MCP 服务...')
console.log(`📍 连接到 Redis: ${REDIS_CONFIG.host}:${REDIS_CONFIG.port}`)

// 尝试多种启动方式
let mcpProcess

// 直接使用 MCP Redis 服务器的入口文件
const mcpEntryPath = path.join(
  __dirname,
  'node_modules',
  '@modelcontextprotocol',
  'server-redis',
  'dist',
  'index.js'
)
console.log(`📦 MCP 服务入口: ${mcpEntryPath}`)

try {
  // MCP Redis 服务器通过命令行参数接收 Redis URL
  mcpProcess = spawn('node', [mcpEntryPath, REDIS_URL], {
    stdio: ['inherit', 'inherit', 'inherit']
  })

  console.log('✅ MCP Redis 服务已启动')
  console.log('📡 服务正在监听标准输入/输出 (stdio) 用于 MCP 通信')
  console.log('⚠️  这是一个长期运行的服务，使用 Ctrl+C 停止')
} catch (err) {
  console.error('❌ 无法启动 MCP 服务:', err.message)
  process.exit(1)
}

mcpProcess.on('close', (code) => {
  console.log(`📊 MCP Redis 服务退出，代码: ${code}`)
})

mcpProcess.on('error', (err) => {
  console.error('❌ MCP Redis 服务启动失败:', err)
})

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n⏹️  正在停止 MCP Redis 服务...')
  mcpProcess.kill('SIGINT')
})

process.on('SIGTERM', () => {
  console.log('\n⏹️  正在停止 MCP Redis 服务...')
  mcpProcess.kill('SIGTERM')
})
