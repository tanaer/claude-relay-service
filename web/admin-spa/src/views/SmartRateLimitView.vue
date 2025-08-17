<template>
  <div class="tab-content">
    <div class="card p-4 sm:p-6">
      <!-- 页面标题 -->
      <div class="mb-4 flex flex-col gap-4 sm:mb-6">
        <div>
          <h3 class="mb-1 text-lg font-bold text-gray-900 sm:mb-2 sm:text-xl">🧠 智能限流配置</h3>
          <p class="text-sm text-gray-600 sm:text-base">
            基于上游错误关键词智能触发限流，保护账户安全
          </p>
        </div>
      </div>

      <!-- 全局设置卡片 -->
      <el-card class="mb-6" header="全局设置">
        <el-form label-position="left" label-width="140px" :model="config.globalSettings">
          <el-row :gutter="24">
            <el-col :span="6">
              <el-form-item label="启用智能限流">
                <el-switch v-model="config.globalSettings.enabled" @change="updateGlobalSettings" />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="限流默认时长">
                <el-input-number
                  v-model="config.globalSettings.defaultDuration"
                  :max="86400"
                  :min="60"
                  @change="updateGlobalSettings"
                />
                <span class="ml-2 text-gray-500">秒</span>
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="恢复检查间隔">
                <el-input-number
                  v-model="config.globalSettings.recoveryCheckInterval"
                  :max="600"
                  :min="30"
                  @change="updateGlobalSettings"
                />
                <span class="ml-2 text-gray-500">秒</span>
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="最大重试次数">
                <el-input-number
                  v-model="config.globalSettings.maxRetries"
                  :max="10"
                  :min="1"
                  @change="updateGlobalSettings"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </el-card>

      <!-- 选项卡 -->
      <el-tabs v-model="activeTab" class="smart-tabs" type="card">
        <el-tab-pane :label="`⚡ 立即限流规则 (${config.instantRules.length})`" name="instant">
          <!-- 工具栏 -->
          <div class="mb-4 flex gap-3">
            <el-button type="primary" @click="showAddInstantRule">
              <i class="fas fa-plus mr-2"></i>
              添加规则
            </el-button>
            <el-button @click="exportConfig">
              <i class="fas fa-download mr-2"></i>
              导出配置
            </el-button>
            <el-button @click="showImportDialog = true">
              <i class="fas fa-upload mr-2"></i>
              导入配置
            </el-button>
          </div>

          <!-- 规则表格 -->
          <el-table border :data="config.instantRules" stripe>
            <el-table-column align="center" label="启用" width="80">
              <template #default="{ row }">
                <el-switch v-model="row.enabled" @change="updateRule('instant', row)" />
              </template>
            </el-table-column>
            <el-table-column label="规则名称" prop="name" />
            <el-table-column label="关键词" width="200">
              <template #default="{ row }">
                <code class="text-xs">{{ row.keywords.join(', ') }}</code>
              </template>
            </el-table-column>
            <el-table-column align="center" label="匹配模式" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="getMatchModeTagType(row.matchMode)">
                  {{ getMatchModeText(row.matchMode) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column align="center" label="区分大小写" width="120">
              <template #default="{ row }">
                <el-tag size="small" :type="row.caseSensitive ? 'warning' : 'info'">
                  {{ row.caseSensitive ? '是' : '否' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column align="center" label="限流时长(秒)" width="120">
              <template #default="{ row }">
                {{ row.duration || config.globalSettings.defaultDuration }}
              </template>
            </el-table-column>
            <el-table-column align="center" label="优先级" prop="priority" width="80" />
            <el-table-column align="center" label="触发次数" width="100">
              <template #default="{ row }">
                {{ getStatistics('instant', row.id) }}
              </template>
            </el-table-column>
            <el-table-column align="center" label="操作" width="150">
              <template #default="{ row }">
                <el-button size="small" @click="editRule('instant', row)"> 编辑 </el-button>
                <el-button size="small" type="danger" @click="deleteRule('instant', row.id)">
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane
          :label="`📊 累计触发规则 (${config.cumulativeRules.length})`"
          name="cumulative"
        >
          <!-- 工具栏 -->
          <div class="mb-4 flex gap-3">
            <el-button type="primary" @click="showAddCumulativeRule">
              <i class="fas fa-plus mr-2"></i>
              添加规则
            </el-button>
          </div>

          <!-- 规则表格 -->
          <el-table border :data="config.cumulativeRules" stripe>
            <el-table-column align="center" label="启用" width="80">
              <template #default="{ row }">
                <el-switch v-model="row.enabled" @change="updateRule('cumulative', row)" />
              </template>
            </el-table-column>
            <el-table-column label="规则名称" prop="name" />
            <el-table-column label="关键词" width="200">
              <template #default="{ row }">
                <code class="text-xs">{{ row.keywords.join(', ') }}</code>
              </template>
            </el-table-column>
            <el-table-column align="center" label="匹配模式" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="getMatchModeTagType(row.matchMode)">
                  {{ getMatchModeText(row.matchMode) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column align="center" label="触发阈值" prop="threshold" width="100" />
            <el-table-column align="center" label="时间窗口(秒)" prop="windowSeconds" width="120" />
            <el-table-column align="center" label="限流时长(秒)" width="120">
              <template #default="{ row }">
                {{ row.duration || config.globalSettings.defaultDuration }}
              </template>
            </el-table-column>
            <el-table-column align="center" label="优先级" prop="priority" width="80" />
            <el-table-column align="center" label="触发次数" width="100">
              <template #default="{ row }">
                {{ getStatistics('cumulative', row.id) }}
              </template>
            </el-table-column>
            <el-table-column align="center" label="操作" width="150">
              <template #default="{ row }">
                <el-button size="small" @click="editRule('cumulative', row)"> 编辑 </el-button>
                <el-button size="small" type="danger" @click="deleteRule('cumulative', row.id)">
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane :label="`🚫 被限流账户 (${limitedAccounts.length})`" name="limited">
          <!-- 工具栏 -->
          <div class="mb-4 flex gap-3">
            <el-button
              :disabled="limitedAccounts.length === 0"
              type="warning"
              @click="clearAllRateLimits"
            >
              <i class="fas fa-unlock mr-2"></i>
              解除所有限流
            </el-button>
            <el-button @click="refreshLimitedAccounts">
              <i class="fas fa-refresh mr-2"></i>
              刷新
            </el-button>
          </div>

          <!-- 账户表格 -->
          <el-table border :data="limitedAccounts" stripe>
            <el-table-column label="账户ID" width="120">
              <template #default="{ row }">
                <code class="text-xs">{{ row.accountId.substring(0, 8) }}...</code>
              </template>
            </el-table-column>
            <el-table-column label="账户名称">
              <template #default="{ row }">
                {{ row.accountName || '未知' }}
              </template>
            </el-table-column>
            <el-table-column label="限流原因" prop="reason" />
            <el-table-column align="center" label="触发规则" width="120">
              <template #default="{ row }">
                <el-tag size="small" type="info">
                  {{ row.triggeredRule || '手动' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="限流时间" width="180">
              <template #default="{ row }">
                {{ formatDate(row.limitedAt) }}
              </template>
            </el-table-column>
            <el-table-column align="center" label="剩余时间" width="120">
              <template #default="{ row }">
                <el-tag size="small" type="warning">
                  {{ formatRemainingTime(row.expiresAt) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column align="center" label="操作" width="100">
              <template #default="{ row }">
                <el-button size="small" type="success" @click="removeRateLimit(row.accountId)">
                  解除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="📈 统计信息" name="statistics">
          <!-- 统计卡片 -->
          <el-row class="mb-6" :gutter="16">
            <el-col :span="6">
              <el-statistic title="总触发次数" :value="statistics.totalTriggers || 0" />
            </el-col>
            <el-col :span="6">
              <el-statistic title="立即限流触发" :value="statistics.instantTriggers || 0" />
            </el-col>
            <el-col :span="6">
              <el-statistic title="累计限流触发" :value="statistics.cumulativeTriggers || 0" />
            </el-col>
            <el-col :span="6">
              <el-statistic title="当前限流账户" :value="statistics.currentLimited || 0" />
            </el-col>
          </el-row>

          <!-- 规则触发排行 -->
          <el-card header="规则触发排行">
            <el-table border :data="topRules" stripe>
              <el-table-column label="规则名称" prop="ruleName" />
              <el-table-column align="center" label="类型" width="100">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.type === 'instant' ? 'danger' : 'warning'">
                    {{ row.type === 'instant' ? '立即' : '累计' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column align="center" label="触发次数" prop="triggerCount" width="120" />
              <el-table-column label="最后触发" width="180">
                <template #default="{ row }">
                  {{ formatDate(row.lastTriggered) }}
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-tab-pane>
      </el-tabs>

      <!-- 添加立即限流规则对话框 -->
      <el-dialog
        v-model="showInstantRuleDialog"
        :close-on-click-modal="false"
        :title="editingRule ? '编辑立即限流规则' : '添加立即限流规则'"
        width="700px"
      >
        <el-form label-width="120px" :model="instantRuleForm">
          <el-form-item label="规则名称" required>
            <el-input v-model="instantRuleForm.name" placeholder="例如：Token 过期错误" />
          </el-form-item>
          <el-form-item label="关键词列表" required>
            <el-input
              v-model="instantRuleForm.keywordsText"
              placeholder="每行一个关键词，例如：&#10;token_expired&#10;invalid_token&#10;authentication_failed"
              :rows="3"
              type="textarea"
            />
          </el-form-item>
          <el-row :gutter="16">
            <el-col :span="8">
              <el-form-item label="匹配模式">
                <el-select v-model="instantRuleForm.matchMode" style="width: 100%">
                  <el-option label="包含匹配" value="contains" />
                  <el-option label="精确匹配" value="exact" />
                  <el-option label="正则表达式" value="regex" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="限流时长（秒）">
                <el-input-number
                  v-model="instantRuleForm.duration"
                  :max="86400"
                  :min="60"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="优先级">
                <el-input-number
                  v-model="instantRuleForm.priority"
                  :max="100"
                  :min="1"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item>
            <el-checkbox v-model="instantRuleForm.caseSensitive">区分大小写</el-checkbox>
            <el-checkbox v-model="instantRuleForm.enabled" class="ml-4">立即启用规则</el-checkbox>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="closeInstantRuleDialog">取消</el-button>
          <el-button type="primary" @click="saveInstantRule">
            {{ editingRule ? '更新' : '添加' }}
          </el-button>
        </template>
      </el-dialog>

      <!-- 添加累计触发规则对话框 -->
      <el-dialog
        v-model="showCumulativeRuleDialog"
        :close-on-click-modal="false"
        :title="editingRule ? '编辑累计触发规则' : '添加累计触发规则'"
        width="700px"
      >
        <el-form label-width="120px" :model="cumulativeRuleForm">
          <el-form-item label="规则名称" required>
            <el-input v-model="cumulativeRuleForm.name" placeholder="例如：频繁限流错误" />
          </el-form-item>
          <el-form-item label="关键词列表" required>
            <el-input
              v-model="cumulativeRuleForm.keywordsText"
              placeholder="每行一个关键词"
              :rows="3"
              type="textarea"
            />
          </el-form-item>
          <el-row :gutter="16">
            <el-col :span="6">
              <el-form-item label="匹配模式">
                <el-select v-model="cumulativeRuleForm.matchMode" style="width: 100%">
                  <el-option label="包含匹配" value="contains" />
                  <el-option label="精确匹配" value="exact" />
                  <el-option label="正则表达式" value="regex" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="触发阈值">
                <el-input-number
                  v-model="cumulativeRuleForm.threshold"
                  :max="100"
                  :min="2"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="时间窗口（秒）">
                <el-input-number
                  v-model="cumulativeRuleForm.windowSeconds"
                  :max="3600"
                  :min="60"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="限流时长（秒）">
                <el-input-number
                  v-model="cumulativeRuleForm.duration"
                  :max="86400"
                  :min="60"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="优先级">
            <el-input-number
              v-model="cumulativeRuleForm.priority"
              :max="100"
              :min="1"
              style="width: 200px"
            />
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="cumulativeRuleForm.caseSensitive">区分大小写</el-checkbox>
            <el-checkbox v-model="cumulativeRuleForm.enabled" class="ml-4"
              >立即启用规则</el-checkbox
            >
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="closeCumulativeRuleDialog">取消</el-button>
          <el-button type="primary" @click="saveCumulativeRule">
            {{ editingRule ? '更新' : '添加' }}
          </el-button>
        </template>
      </el-dialog>

      <!-- 导入配置对话框 -->
      <el-dialog
        v-model="showImportDialog"
        :close-on-click-modal="false"
        title="导入配置"
        width="700px"
      >
        <el-form>
          <el-form-item label="配置JSON">
            <el-input
              v-model="importConfigText"
              placeholder="粘贴导出的配置JSON"
              :rows="10"
              type="textarea"
            />
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="mergeImport">合并现有配置（不勾选则覆盖）</el-checkbox>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showImportDialog = false">取消</el-button>
          <el-button type="primary" @click="importConfig">导入</el-button>
        </template>
      </el-dialog>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useApi } from '@/composables/useApi'

const api = useApi()

// 响应式数据
const config = ref({
  globalSettings: {
    enabled: true,
    defaultDuration: 300,
    recoveryCheckInterval: 60,
    maxRetries: 3
  },
  instantRules: [],
  cumulativeRules: []
})

const statistics = ref({})
const limitedAccounts = ref([])
const activeTab = ref('instant')
const showInstantRuleDialog = ref(false)
const showCumulativeRuleDialog = ref(false)
const showImportDialog = ref(false)
const editingRule = ref(null)
const refreshTimer = ref(null)

// 表单数据
const instantRuleForm = ref({
  name: '',
  keywordsText: '',
  matchMode: 'contains',
  caseSensitive: false,
  duration: 300,
  priority: 50,
  enabled: true
})

const cumulativeRuleForm = ref({
  name: '',
  keywordsText: '',
  matchMode: 'contains',
  caseSensitive: false,
  threshold: 3,
  windowSeconds: 300,
  duration: 600,
  priority: 50,
  enabled: true
})

const importConfigText = ref('')
const mergeImport = ref(false)

// 计算属性
const topRules = computed(() => {
  if (!statistics.value.ruleStatistics) return []

  return Object.entries(statistics.value.ruleStatistics)
    .map(([ruleId, stats]) => ({
      ruleId,
      ruleName: stats.ruleName || ruleId,
      type: stats.type,
      triggerCount: stats.triggerCount || 0,
      lastTriggered: stats.lastTriggered
    }))
    .sort((a, b) => b.triggerCount - a.triggerCount)
    .slice(0, 10)
})

// 工具函数
function getMatchModeTagType(mode) {
  const typeMap = {
    contains: 'info',
    exact: 'success',
    regex: 'danger'
  }
  return typeMap[mode] || 'info'
}

function getMatchModeText(mode) {
  const textMap = {
    contains: '包含',
    exact: '精确',
    regex: '正则'
  }
  return textMap[mode] || mode
}

function getStatistics(type, ruleId) {
  if (!statistics.value.ruleStatistics) return 0
  const key = `${type}:${ruleId}`
  return statistics.value.ruleStatistics[key]?.triggerCount || 0
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN')
}

function formatRemainingTime(expiresAt) {
  if (!expiresAt) return '永久'

  const now = Date.now()
  const expires = new Date(expiresAt).getTime()
  const remaining = expires - now

  if (remaining <= 0) return '已过期'

  const seconds = Math.floor(remaining / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}小时${minutes % 60}分钟`
  } else if (minutes > 0) {
    return `${minutes}分钟`
  } else {
    return `${seconds}秒`
  }
}

// API 方法
async function loadConfig() {
  try {
    const response = await api.get('/admin/smart-rate-limit/config')
    if (response.data) {
      config.value = response.data
    }
  } catch (error) {
    console.error('Failed to load config:', error)
    ElMessage.error('加载配置失败')
  }
}

async function loadStatistics() {
  try {
    const response = await api.get('/admin/smart-rate-limit/statistics')
    statistics.value = response.data || {}
  } catch (error) {
    console.error('Failed to load statistics:', error)
  }
}

async function loadLimitedAccounts() {
  try {
    const response = await api.get('/admin/smart-rate-limit/limited-accounts')
    limitedAccounts.value = response.data || []
  } catch (error) {
    console.error('Failed to load limited accounts:', error)
  }
}

async function updateGlobalSettings() {
  try {
    await api.put('/admin/smart-rate-limit/global-settings', config.value.globalSettings)
    ElMessage.success('全局设置已更新')
  } catch (error) {
    console.error('Failed to update global settings:', error)
    ElMessage.error('更新全局设置失败')
  }
}

async function updateRule(type, rule) {
  try {
    await api.put(`/admin/smart-rate-limit/rules/${type}/${rule.id}`, rule)
  } catch (error) {
    console.error('Failed to update rule:', error)
    ElMessage.error('更新规则失败')
    await loadConfig()
  }
}

async function deleteRule(type, ruleId) {
  try {
    await api.delete(`/admin/smart-rate-limit/rules/${type}/${ruleId}`)
    ElMessage.success('规则已删除')
    await loadConfig()
  } catch (error) {
    console.error('Failed to delete rule:', error)
    ElMessage.error('删除规则失败')
  }
}

async function removeRateLimit(accountId) {
  try {
    await api.delete(`/admin/smart-rate-limit/limited-accounts/${accountId}`)
    ElMessage.success('限流已解除')
    await loadLimitedAccounts()
  } catch (error) {
    console.error('Failed to remove rate limit:', error)
    ElMessage.error('解除限流失败')
  }
}

async function clearAllRateLimits() {
  try {
    await api.post('/admin/smart-rate-limit/clear-all')
    ElMessage.success('所有限流已解除')
    await loadLimitedAccounts()
  } catch (error) {
    console.error('Failed to clear all rate limits:', error)
    ElMessage.error('清除限流失败')
  }
}

async function exportConfig() {
  try {
    const response = await api.get('/admin/smart-rate-limit/export')
    const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `smart-rate-limit-config-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('配置已导出')
  } catch (error) {
    console.error('Failed to export config:', error)
    ElMessage.error('导出配置失败')
  }
}

async function importConfig() {
  try {
    const configData = JSON.parse(importConfigText.value)
    await api.post('/admin/smart-rate-limit/import', {
      config: configData,
      merge: mergeImport.value
    })
    ElMessage.success('配置已导入')
    showImportDialog.value = false
    importConfigText.value = ''
    await loadConfig()
  } catch (error) {
    console.error('Failed to import config:', error)
    ElMessage.error('导入配置失败：' + error.message)
  }
}

function showAddInstantRule() {
  editingRule.value = null
  instantRuleForm.value = {
    name: '',
    keywordsText: '',
    matchMode: 'contains',
    caseSensitive: false,
    duration: 300,
    priority: 50,
    enabled: true
  }
  showInstantRuleDialog.value = true
}

function showAddCumulativeRule() {
  editingRule.value = null
  cumulativeRuleForm.value = {
    name: '',
    keywordsText: '',
    matchMode: 'contains',
    caseSensitive: false,
    threshold: 3,
    windowSeconds: 300,
    duration: 600,
    priority: 50,
    enabled: true
  }
  showCumulativeRuleDialog.value = true
}

function editRule(type, rule) {
  editingRule.value = rule
  if (type === 'instant') {
    instantRuleForm.value = {
      name: rule.name,
      keywordsText: rule.keywords.join('\n'),
      matchMode: rule.matchMode,
      caseSensitive: rule.caseSensitive,
      duration: rule.duration,
      priority: rule.priority,
      enabled: rule.enabled
    }
    showInstantRuleDialog.value = true
  } else {
    cumulativeRuleForm.value = {
      name: rule.name,
      keywordsText: rule.keywords.join('\n'),
      matchMode: rule.matchMode,
      caseSensitive: rule.caseSensitive,
      threshold: rule.threshold,
      windowSeconds: rule.windowSeconds,
      duration: rule.duration,
      priority: rule.priority,
      enabled: rule.enabled
    }
    showCumulativeRuleDialog.value = true
  }
}

async function saveInstantRule() {
  try {
    const keywords = instantRuleForm.value.keywordsText
      .split('\n')
      .map((k) => k.trim())
      .filter((k) => k)

    if (!instantRuleForm.value.name || keywords.length === 0) {
      ElMessage.error('请填写规则名称和关键词')
      return
    }

    const ruleData = {
      name: instantRuleForm.value.name,
      keywords,
      matchMode: instantRuleForm.value.matchMode,
      caseSensitive: instantRuleForm.value.caseSensitive,
      duration: instantRuleForm.value.duration,
      priority: instantRuleForm.value.priority,
      enabled: instantRuleForm.value.enabled
    }

    if (editingRule.value) {
      await api.put(`/admin/smart-rate-limit/rules/instant/${editingRule.value.id}`, ruleData)
      ElMessage.success('规则已更新')
    } else {
      await api.post('/admin/smart-rate-limit/rules/instant', ruleData)
      ElMessage.success('规则已添加')
    }

    closeInstantRuleDialog()
    await loadConfig()
  } catch (error) {
    console.error('Failed to save instant rule:', error)
    ElMessage.error('保存规则失败')
  }
}

async function saveCumulativeRule() {
  try {
    const keywords = cumulativeRuleForm.value.keywordsText
      .split('\n')
      .map((k) => k.trim())
      .filter((k) => k)

    if (!cumulativeRuleForm.value.name || keywords.length === 0) {
      ElMessage.error('请填写规则名称和关键词')
      return
    }

    const ruleData = {
      name: cumulativeRuleForm.value.name,
      keywords,
      matchMode: cumulativeRuleForm.value.matchMode,
      caseSensitive: cumulativeRuleForm.value.caseSensitive,
      threshold: cumulativeRuleForm.value.threshold,
      windowSeconds: cumulativeRuleForm.value.windowSeconds,
      duration: cumulativeRuleForm.value.duration,
      priority: cumulativeRuleForm.value.priority,
      enabled: cumulativeRuleForm.value.enabled
    }

    if (editingRule.value) {
      await api.put(`/admin/smart-rate-limit/rules/cumulative/${editingRule.value.id}`, ruleData)
      ElMessage.success('规则已更新')
    } else {
      await api.post('/admin/smart-rate-limit/rules/cumulative', ruleData)
      ElMessage.success('规则已添加')
    }

    closeCumulativeRuleDialog()
    await loadConfig()
  } catch (error) {
    console.error('Failed to save cumulative rule:', error)
    ElMessage.error('保存规则失败')
  }
}

function closeInstantRuleDialog() {
  showInstantRuleDialog.value = false
  editingRule.value = null
}

function closeCumulativeRuleDialog() {
  showCumulativeRuleDialog.value = false
  editingRule.value = null
}

function refreshLimitedAccounts() {
  loadLimitedAccounts()
  loadStatistics()
}

// 自动刷新
function startAutoRefresh() {
  refreshTimer.value = setInterval(() => {
    if (activeTab.value === 'limited') {
      loadLimitedAccounts()
    } else if (activeTab.value === 'statistics') {
      loadStatistics()
    }
  }, 5000)
}

function stopAutoRefresh() {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value)
    refreshTimer.value = null
  }
}

// 生命周期钩子
onMounted(() => {
  loadConfig()
  loadStatistics()
  loadLimitedAccounts()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<style scoped>
.smart-tabs :deep(.el-tabs__content) {
  padding-top: 20px;
}

:deep(.el-statistic__content) {
  font-size: 2rem;
  font-weight: 600;
}

:deep(.el-statistic__head) {
  color: #666;
  font-size: 14px;
  margin-bottom: 8px;
}

.ml-2 {
  margin-left: 8px;
}

.ml-4 {
  margin-left: 16px;
}

.mr-2 {
  margin-right: 8px;
}

.text-xs {
  font-size: 12px;
}
</style>
