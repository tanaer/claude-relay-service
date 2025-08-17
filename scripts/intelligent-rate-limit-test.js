#!/usr/bin/env node

/**
 * 智能限流一键测试脚本
 * 功能：
 * 1) 管理员登录并缓存token
 * 2) 获取当前智能限流配置并打印
 * 3) （可选）应用推荐测试配置并回读验证
 *
 * 用法示例（Windows）：
 *   node scripts\\intelligent-rate-limit-test.js --base http://localhost:3000
 *   node scripts\\intelligent-rate-limit-test.js --base http://localhost:3000 --apply
 *   node scripts\\intelligent-rate-limit-test.js --base http://localhost:3000 --username admin --password 123456
 *
 * 参数：
 *   --base                 服务基础地址，默认 http://localhost:3000
 *   --username, --password 管理员账号密码（可选，缺省从 data/init.json 读取）
 *   --apply                应用推荐测试配置（默认只读取不修改）
 */

const fs = require('fs')
const path = require('path')
const axios = require('axios')

const CACHE_PATH = path.join(__dirname, '.admin-session.json')

function logInfo(...args) {
  console.log('[INFO]', ...args)
}
function logWarn(...args) {
  console.warn('[WARN]', ...args)
}
function logError(...args) {
  console.error('[ERROR]', ...args)
}

function parseArgs() {
  const args = process.argv.slice(2)
  const res = {
    base: process.env.CC_RELAY_BASE_URL || 'http://localhost:3000',
    username: process.env.ADMIN_USERNAME || null,
    password: process.env.ADMIN_PASSWORD || null,
    apply: false
  }

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--base' && args[i + 1]) {
      res.base = args[++i]
    } else if ((a === '--username' || a === '-u') && args[i + 1]) {
      res.username = args[++i]
    } else if ((a === '--password' || a === '-p') && args[i + 1]) {
      res.password = args[++i]
    } else if (a === '--apply') {
      res.apply = true
    }
  }
  return res
}

function readInitCredentials() {
  try {
    const initPath = path.join(__dirname, '..', 'data', 'init.json')
    if (!fs.existsSync(initPath)) {
      return null
    }
    const json = JSON.parse(fs.readFileSync(initPath, 'utf8'))
    if (json && json.adminUsername && json.adminPassword) {
      return { username: json.adminUsername, password: json.adminPassword }
    }
    return null
  } catch (e) {
    logWarn('读取 data/init.json 失败：', e.message)
    return null
  }
}

function loadCachedSession() {
  try {
    if (!fs.existsSync(CACHE_PATH)) {
      return null
    }
    const json = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
    return json
  } catch (e) {
    return null
  }
}

function saveCachedSession(session) {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(session, null, 2), 'utf8')
  } catch (e) {
    logWarn('写入缓存失败：', e.message)
  }
}

function isSessionValid(session) {
  if (!session || !session.token || !session.expiresIn || !session.createdAt) {
    return false
  }
  const createdAt = new Date(session.createdAt).getTime()
  const age = Date.now() - createdAt
  // 提前5分钟失效，避免边界问题
  return age < session.expiresIn - 5 * 60 * 1000
}

async function doLogin(base, provided) {
  let { username, password } = provided || {}
  if (!username || !password) {
    const fromInit = readInitCredentials()
    if (fromInit) {
      username = username || fromInit.username
      password = password || fromInit.password
      logInfo('将使用 data/init.json 中的管理员凭据登录')
    }
  }
  if (!username || !password) {
    throw new Error('缺少管理员凭据，请通过 --username/--password 或 data/init.json 提供')
  }

  const url = `${base}/web/auth/login`
  logInfo('请求管理员登录：', url)
  const resp = await axios.post(url, { username, password }, { timeout: 15000 })
  if (!resp.data || !resp.data.success || !resp.data.token) {
    throw new Error('登录失败：未返回有效 token')
  }

  const session = {
    token: resp.data.token,
    username: resp.data.username,
    expiresIn: resp.data.expiresIn || 24 * 60 * 60 * 1000,
    createdAt: new Date().toISOString(),
    base
  }
  saveCachedSession(session)
  logInfo('登录成功，token 已缓存')
  return session
}

async function getAdminSession(base, cred) {
  const cached = loadCachedSession()
  if (cached && cached.base === base && isSessionValid(cached)) {
    logInfo('使用缓存的管理员 token')
    return cached
  }
  return await doLogin(base, cred)
}

function msToHuman(ms) {
  if (typeof ms !== 'number' || isNaN(ms)) {
    return { value: ms, human: 'N/A' }
  }
  if (ms % 60000 === 0) {
    return { value: ms, human: `${ms / 60000} min` }
  }
  if (ms % 1000 === 0) {
    return { value: ms, human: `${ms / 1000} s` }
  }
  return { value: ms, human: `${ms} ms` }
}

function toArray(val) {
  if (!val) {
    return []
  }
  if (Array.isArray(val)) {
    return val
  }
  if (typeof val === 'string') {
    return val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

async function fetchConfig(base, token) {
  const url = `${base}/admin/smart-rate-limit/config`
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  })
  if (!resp.data || !resp.data.success) {
    throw new Error('获取配置失败')
  }
  return resp.data.data
}

function buildRecommendedTestConfig() {
  // 推荐测试配置（安全默认，不影响生产）
  // - 1 分钟恢复测试间隔（便于观察）
  // - 5 秒单次恢复测试超时
  // - 关键字：immediate 命中 “rate limit”、“overloaded”；accumulative 命中 “unauthorized”、“token”、“network”、“timeout”
  // - 累积阈值 2 次
  return {
    enabled: true,
    triggerOnAnyError: false,
    recoveryTestInterval: 1, // 分钟（后端会转换成毫秒）
    recoveryTestTimeout: 5, // 秒（后端会转换成毫秒）
    maxFaultLogs: 2000,
    faultLogRetentionDays: 7,
    errorCategories: {
      immediate: ['rate limit', 'overloaded'],
      accumulative: ['unauthorized', 'token', 'network', 'timeout'],
      accumulativeThreshold: 2
    },
    alerting: {
      enabled: false,
      webhookUrl: null,
      emailNotification: false
    }
  }
}

async function updateConfig(base, token, configData) {
  const url = `${base}/admin/smart-rate-limit/config`
  const resp = await axios.post(
    url,
    { configData },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
  )
  if (!resp.data || !resp.data.success) {
    throw new Error(`更新配置失败：${resp.data?.message || 'Unknown error'}`)
  }
  return resp.data.data
}

function printConfig(title, cfg) {
  console.log('')
  console.log('====================')
  console.log(title)
  console.log('====================')
  const i = msToHuman(cfg.recoveryTestInterval)
  const t = msToHuman(cfg.recoveryTestTimeout)
  console.log('enabled:', cfg.enabled)
  console.log('triggerOnAnyError:', cfg.triggerOnAnyError)
  console.log('recoveryTestInterval:', `${i.value} (${i.human})`)
  console.log('recoveryTestTimeout:', `${t.value} (${t.human})`)
  console.log('maxFaultLogs:', cfg.maxFaultLogs)
  console.log('faultLogRetentionDays:', cfg.faultLogRetentionDays)
  console.log(
    'errorCategories.immediate:',
    toArray(cfg.errorCategories?.immediate).join(', ') || '[]'
  )
  console.log(
    'errorCategories.accumulative:',
    toArray(cfg.errorCategories?.accumulative).join(', ') || '[]'
  )
  console.log('errorCategories.accumulativeThreshold:', cfg.errorCategories?.accumulativeThreshold)
  if (cfg.alerting) {
    console.log('alerting.enabled:', cfg.alerting.enabled)
    console.log('alerting.emailNotification:', cfg.alerting.emailNotification)
    console.log('alerting.webhookUrl:', cfg.alerting.webhookUrl || 'null')
  }
}

async function main() {
  const args = parseArgs()
  const base = args.base.replace(/\/+$/, '')

  logInfo('服务地址：', base)

  // 1) 登录 / 复用 token
  let session
  try {
    session = await getAdminSession(base, {
      username: args.username,
      password: args.password
    })
  } catch (e) {
    logError('管理员登录失败：', e.message)
    process.exitCode = 1
    return
  }

  const tokenMasked = `${session.token.slice(0, 8)}...${session.token.slice(-4)}`
  logInfo(
    `管理员 token: ${tokenMasked}（过期：${new Date(new Date(session.createdAt).getTime() + session.expiresIn).toISOString()}）`
  )

  // 2) 获取当前配置
  try {
    const current = await fetchConfig(base, session.token)
    printConfig('当前配置', current)
  } catch (e) {
    // 若 401，尝试强制重登一次
    if (e.response && e.response.status === 401) {
      logWarn('配置接口返回 401，尝试重新登录...')
      try {
        session = await doLogin(base, {
          username: args.username,
          password: args.password
        })
        const current = await fetchConfig(base, session.token)
        printConfig('当前配置', current)
      } catch (e2) {
        logError('重登录后仍无法获取配置：', e2.message)
        process.exitCode = 1
        return
      }
    } else {
      logError('获取配置失败：', e.message)
      process.exitCode = 1
      return
    }
  }

  // 3) 可选：应用推荐测试配置并回读
  if (args.apply) {
    try {
      const recommend = buildRecommendedTestConfig()
      logInfo('开始应用推荐测试配置...')
      await updateConfig(base, session.token, recommend)
      // 回读验证
      const reloaded = await fetchConfig(base, session.token)
      printConfig('已更新并回读验证的配置', reloaded)

      // 基本校验反馈
      const intervalOk = Math.abs(reloaded.recoveryTestInterval - 1 * 60 * 1000) < 5
      const timeoutOk = Math.abs(reloaded.recoveryTestTimeout - 5 * 1000) < 5
      const enabledOk = !!reloaded.enabled
      if (intervalOk && timeoutOk && enabledOk) {
        logInfo('配置已成功生效（单位转换与热加载验证通过）')
      } else {
        logWarn('配置已更新，但单位转换或热加载可能存在问题，请人工核查')
      }
    } catch (e) {
      logError('更新配置失败：', e.message)
      process.exitCode = 1
      return
    }
  }

  console.log('')
  logInfo('脚本执行完成')
}

main().catch((e) => {
  logError('未捕获异常：', e)
  process.exitCode = 1
})
