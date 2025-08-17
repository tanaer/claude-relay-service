<template>
  <div class="smart-rate-limit-view">
    <!-- 页面标题 -->
    <div class="page-header">
      <h1 class="page-title">
        <span class="icon">🧠</span>
        智能限流配置
      </h1>
      <p class="page-description">基于上游错误关键词智能触发限流，保护账户安全</p>
    </div>

    <!-- 全局设置卡片 -->
    <n-card :bordered="false" class="settings-card" title="全局设置">
      <n-form label-placement="left" label-width="140" :model="config.globalSettings">
        <n-grid :cols="4" :x-gap="24" :y-gap="16">
          <n-grid-item>
            <n-form-item label="限流默认时长">
              <n-input-number
                v-model:value="config.globalSettings.defaultDuration"
                :max="86400"
                :min="60"
                @update:value="updateGlobalSettings"
              >
                <template #suffix>秒</template>
              </n-input-number>
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item label="恢复检查间隔">
              <n-input-number
                v-model:value="config.globalSettings.recoveryCheckInterval"
                :max="600"
                :min="30"
                @update:value="updateGlobalSettings"
              >
                <template #suffix>秒</template>
              </n-input-number>
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item label="最大重试次数">
              <n-input-number
                v-model:value="config.globalSettings.maxRetries"
                :max="10"
                :min="1"
                @update:value="updateGlobalSettings"
              />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item label="启用智能限流">
              <n-switch
                v-model:value="config.globalSettings.enabled"
                @update:value="updateGlobalSettings"
              />
            </n-form-item>
          </n-grid-item>
        </n-grid>
      </n-form>
    </n-card>

    <!-- 选项卡 -->
    <n-tabs v-model:value="activeTab" class="tabs-container" type="card">
      <n-tab-pane name="instant" :tab="`⚡ 立即限流规则 (${config.instantRules.length})`">
        <div class="tab-content">
          <!-- 工具栏 -->
          <div class="toolbar">
            <n-button type="primary" @click="showAddInstantRule = true">
              <template #icon>
                <n-icon><AddIcon /></n-icon>
              </template>
              添加规则
            </n-button>
            <n-button @click="exportConfig">
              <template #icon>
                <n-icon><DownloadIcon /></n-icon>
              </template>
              导出配置
            </n-button>
            <n-button @click="showImportDialog = true">
              <template #icon>
                <n-icon><UploadIcon /></n-icon>
              </template>
              导入配置
            </n-button>
          </div>

          <!-- 规则表格 -->
          <n-data-table
            :bordered="false"
            :columns="instantRuleColumns"
            :data="config.instantRules"
            :pagination="false"
            striped
          />
        </div>
      </n-tab-pane>

      <n-tab-pane name="cumulative" :tab="`📊 累计触发规则 (${config.cumulativeRules.length})`">
        <div class="tab-content">
          <!-- 工具栏 -->
          <div class="toolbar">
            <n-button type="primary" @click="showAddCumulativeRule = true">
              <template #icon>
                <n-icon><AddIcon /></n-icon>
              </template>
              添加规则
            </n-button>
          </div>

          <!-- 规则表格 -->
          <n-data-table
            :bordered="false"
            :columns="cumulativeRuleColumns"
            :data="config.cumulativeRules"
            :pagination="false"
            striped
          />
        </div>
      </n-tab-pane>

      <n-tab-pane name="limited" :tab="`🚫 被限流账户 (${limitedAccounts.length})`">
        <div class="tab-content">
          <!-- 工具栏 -->
          <div class="toolbar">
            <n-button
              :disabled="limitedAccounts.length === 0"
              type="warning"
              @click="clearAllRateLimits"
            >
              <template #icon>
                <n-icon><UnlockIcon /></n-icon>
              </template>
              解除所有限流
            </n-button>
            <n-button @click="refreshLimitedAccounts">
              <template #icon>
                <n-icon><RefreshIcon /></n-icon>
              </template>
              刷新
            </n-button>
          </div>

          <!-- 账户表格 -->
          <n-data-table
            :bordered="false"
            :columns="limitedAccountColumns"
            :data="limitedAccounts"
            :pagination="false"
            striped
          />
        </div>
      </n-tab-pane>

      <n-tab-pane name="statistics" tab="📈 统计信息">
        <div class="tab-content">
          <!-- 统计卡片 -->
          <n-grid class="stats-grid" :cols="4" :x-gap="16" :y-gap="16">
            <n-grid-item>
              <n-statistic label="总触发次数" :value="statistics.totalTriggers || 0" />
            </n-grid-item>
            <n-grid-item>
              <n-statistic label="立即限流触发" :value="statistics.instantTriggers || 0" />
            </n-grid-item>
            <n-grid-item>
              <n-statistic label="累计限流触发" :value="statistics.cumulativeTriggers || 0" />
            </n-grid-item>
            <n-grid-item>
              <n-statistic label="当前限流账户" :value="statistics.currentLimited || 0" />
            </n-grid-item>
          </n-grid>

          <!-- 规则触发排行 -->
          <n-card :bordered="false" class="ranking-card" title="规则触发排行">
            <n-data-table
              :bordered="false"
              :columns="topRulesColumns"
              :data="topRules"
              :pagination="false"
              striped
            />
          </n-card>
        </div>
      </n-tab-pane>
    </n-tabs>

    <!-- 添加立即限流规则对话框 -->
    <n-modal
      v-model:show="showAddInstantRule"
      :mask-closable="false"
      preset="dialog"
      style="width: 700px"
      :title="editingRule ? '编辑立即限流规则' : '添加立即限流规则'"
    >
      <n-form label-placement="top" :model="instantRuleForm">
        <n-form-item label="规则名称" required>
          <n-input v-model:value="instantRuleForm.name" placeholder="例如：Token 过期错误" />
        </n-form-item>
        <n-form-item label="关键词列表" required>
          <n-input
            v-model:value="instantRuleForm.keywordsText"
            placeholder="每行一个关键词，例如：&#10;token_expired&#10;invalid_token&#10;authentication_failed"
            :rows="3"
            type="textarea"
          />
        </n-form-item>
        <n-grid :cols="3" :x-gap="16">
          <n-grid-item>
            <n-form-item label="匹配模式">
              <n-select v-model:value="instantRuleForm.matchMode" :options="matchModeOptions" />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item label="限流时长（秒）">
              <n-input-number v-model:value="instantRuleForm.duration" :max="86400" :min="60" />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item label="优先级">
              <n-input-number v-model:value="instantRuleForm.priority" :max="100" :min="1" />
            </n-form-item>
          </n-grid-item>
        </n-grid>
        <n-space>
          <n-checkbox v-model:checked="instantRuleForm.caseSensitive">区分大小写</n-checkbox>
          <n-checkbox v-model:checked="instantRuleForm.enabled">立即启用规则</n-checkbox>
        </n-space>
      </n-form>
      <template #action>
        <n-space>
          <n-button @click="closeInstantRuleDialog">取消</n-button>
          <n-button type="primary" @click="saveInstantRule">
            {{ editingRule ? '更新' : '添加' }}
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 添加累计触发规则对话框 -->
    <n-modal
      v-model:show="showAddCumulativeRule"
      :mask-closable="false"
      preset="dialog"
      style="width: 700px"
      :title="editingRule ? '编辑累计触发规则' : '添加累计触发规则'"
    >
      <n-form label-placement="top" :model="cumulativeRuleForm">
        <n-form-item label="规则名称" required>
          <n-input v-model:value="cumulativeRuleForm.name" placeholder="例如：频繁限流错误" />
        </n-form-item>
        <n-form-item label="关键词列表" required>
          <n-input
            v-model:value="cumulativeRuleForm.keywordsText"
            placeholder="每行一个关键词"
            :rows="3"
            type="textarea"
          />
        </n-form-item>
        <n-grid :cols="4" :x-gap="16">
          <n-grid-item>
            <n-form-item label="匹配模式">
              <n-select v-model:value="cumulativeRuleForm.matchMode" :options="matchModeOptions" />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item label="触发阈值">
              <n-input-number v-model:value="cumulativeRuleForm.threshold" :max="100" :min="2" />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item label="时间窗口（秒）">
              <n-input-number
                v-model:value="cumulativeRuleForm.windowSeconds"
                :max="3600"
                :min="60"
              />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item label="限流时长（秒）">
              <n-input-number v-model:value="cumulativeRuleForm.duration" :max="86400" :min="60" />
            </n-form-item>
          </n-grid-item>
        </n-grid>
        <n-form-item label="优先级">
          <n-input-number
            v-model:value="cumulativeRuleForm.priority"
            :max="100"
            :min="1"
            style="width: 200px"
          />
        </n-form-item>
        <n-space>
          <n-checkbox v-model:checked="cumulativeRuleForm.caseSensitive">区分大小写</n-checkbox>
          <n-checkbox v-model:checked="cumulativeRuleForm.enabled">立即启用规则</n-checkbox>
        </n-space>
      </n-form>
      <template #action>
        <n-space>
          <n-button @click="closeCumulativeRuleDialog">取消</n-button>
          <n-button type="primary" @click="saveCumulativeRule">
            {{ editingRule ? '更新' : '添加' }}
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 导入配置对话框 -->
    <n-modal
      v-model:show="showImportDialog"
      :mask-closable="false"
      preset="dialog"
      style="width: 700px"
      title="导入配置"
    >
      <n-form>
        <n-form-item label="配置JSON">
          <n-input
            v-model:value="importConfigText"
            placeholder="粘贴导出的配置JSON"
            :rows="10"
            type="textarea"
          />
        </n-form-item>
        <n-checkbox v-model:checked="mergeImport">合并现有配置（不勾选则覆盖）</n-checkbox>
      </n-form>
      <template #action>
        <n-space>
          <n-button @click="showImportDialog = false">取消</n-button>
          <n-button type="primary" @click="importConfig">导入</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, h } from 'vue'
import { useMessage } from 'naive-ui'
import { NButton, NTag, NSwitch, NSpace } from 'naive-ui'
import {
  Add as AddIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  Refresh as RefreshIcon,
  LockOpen as UnlockIcon
} from '@vicons/ionicons5'
import api from '@/api'

const message = useMessage()

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
const showAddInstantRule = ref(false)
const showAddCumulativeRule = ref(false)
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

// 选项配置
const matchModeOptions = [
  { label: '包含匹配', value: 'contains' },
  { label: '精确匹配', value: 'exact' },
  { label: '正则表达式', value: 'regex' }
]

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

// 表格列配置
const instantRuleColumns = [
  {
    title: '启用',
    key: 'enabled',
    width: 80,
    render(row) {
      return h(NSwitch, {
        value: row.enabled,
        onUpdateValue: (val) => {
          row.enabled = val
          updateRule('instant', row)
        }
      })
    }
  },
  {
    title: '规则名称',
    key: 'name'
  },
  {
    title: '关键词',
    key: 'keywords',
    render(row) {
      return h('code', row.keywords.join(', '))
    }
  },
  {
    title: '匹配模式',
    key: 'matchMode',
    render(row) {
      const typeMap = {
        contains: { type: 'info', text: '包含' },
        exact: { type: 'success', text: '精确' },
        regex: { type: 'error', text: '正则' }
      }
      const info = typeMap[row.matchMode] || { type: 'default', text: row.matchMode }
      return h(NTag, { type: info.type, size: 'small' }, () => info.text)
    }
  },
  {
    title: '区分大小写',
    key: 'caseSensitive',
    render(row) {
      return h(
        NTag,
        {
          type: row.caseSensitive ? 'warning' : 'default',
          size: 'small'
        },
        () => (row.caseSensitive ? '是' : '否')
      )
    }
  },
  {
    title: '限流时长(秒)',
    key: 'duration',
    render(row) {
      return row.duration || config.value.globalSettings.defaultDuration
    }
  },
  {
    title: '优先级',
    key: 'priority'
  },
  {
    title: '触发次数',
    key: 'triggerCount',
    render(row) {
      return getStatistics('instant', row.id)
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 150,
    render(row) {
      return h(NSpace, null, () => [
        h(
          NButton,
          {
            size: 'small',
            onClick: () => editRule('instant', row)
          },
          () => '编辑'
        ),
        h(
          NButton,
          {
            size: 'small',
            type: 'error',
            onClick: () => deleteRule('instant', row.id)
          },
          () => '删除'
        )
      ])
    }
  }
]

const cumulativeRuleColumns = [
  {
    title: '启用',
    key: 'enabled',
    width: 80,
    render(row) {
      return h(NSwitch, {
        value: row.enabled,
        onUpdateValue: (val) => {
          row.enabled = val
          updateRule('cumulative', row)
        }
      })
    }
  },
  {
    title: '规则名称',
    key: 'name'
  },
  {
    title: '关键词',
    key: 'keywords',
    render(row) {
      return h('code', row.keywords.join(', '))
    }
  },
  {
    title: '匹配模式',
    key: 'matchMode',
    render(row) {
      const typeMap = {
        contains: { type: 'info', text: '包含' },
        exact: { type: 'success', text: '精确' },
        regex: { type: 'error', text: '正则' }
      }
      const info = typeMap[row.matchMode] || { type: 'default', text: row.matchMode }
      return h(NTag, { type: info.type, size: 'small' }, () => info.text)
    }
  },
  {
    title: '触发阈值',
    key: 'threshold'
  },
  {
    title: '时间窗口(秒)',
    key: 'windowSeconds'
  },
  {
    title: '限流时长(秒)',
    key: 'duration',
    render(row) {
      return row.duration || config.value.globalSettings.defaultDuration
    }
  },
  {
    title: '优先级',
    key: 'priority'
  },
  {
    title: '触发次数',
    key: 'triggerCount',
    render(row) {
      return getStatistics('cumulative', row.id)
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 150,
    render(row) {
      return h(NSpace, null, () => [
        h(
          NButton,
          {
            size: 'small',
            onClick: () => editRule('cumulative', row)
          },
          () => '编辑'
        ),
        h(
          NButton,
          {
            size: 'small',
            type: 'error',
            onClick: () => deleteRule('cumulative', row.id)
          },
          () => '删除'
        )
      ])
    }
  }
]

const limitedAccountColumns = [
  {
    title: '账户ID',
    key: 'accountId',
    render(row) {
      return h('code', row.accountId.substring(0, 8) + '...')
    }
  },
  {
    title: '账户名称',
    key: 'accountName',
    render(row) {
      return row.accountName || '未知'
    }
  },
  {
    title: '限流原因',
    key: 'reason'
  },
  {
    title: '触发规则',
    key: 'triggeredRule',
    render(row) {
      return h(NTag, { type: 'info', size: 'small' }, () => row.triggeredRule || '手动')
    }
  },
  {
    title: '限流时间',
    key: 'limitedAt',
    render(row) {
      return formatDate(row.limitedAt)
    }
  },
  {
    title: '剩余时间',
    key: 'expiresAt',
    render(row) {
      return h(NTag, { type: 'warning', size: 'small' }, () => formatRemainingTime(row.expiresAt))
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 100,
    render(row) {
      return h(
        NButton,
        {
          size: 'small',
          type: 'success',
          onClick: () => removeRateLimit(row.accountId)
        },
        () => '解除'
      )
    }
  }
]

const topRulesColumns = [
  {
    title: '规则名称',
    key: 'ruleName'
  },
  {
    title: '类型',
    key: 'type',
    render(row) {
      return h(
        NTag,
        {
          type: row.type === 'instant' ? 'error' : 'warning',
          size: 'small'
        },
        () => (row.type === 'instant' ? '立即' : '累计')
      )
    }
  },
  {
    title: '触发次数',
    key: 'triggerCount'
  },
  {
    title: '最后触发',
    key: 'lastTriggered',
    render(row) {
      return formatDate(row.lastTriggered)
    }
  }
]

// API 方法
async function loadConfig() {
  try {
    const response = await api.get('/smart-rate-limit/config')
    config.value = response.data || config.value
  } catch (error) {
    console.error('Failed to load config:', error)
    message.error('加载配置失败')
  }
}

async function loadStatistics() {
  try {
    const response = await api.get('/smart-rate-limit/statistics')
    statistics.value = response.data || {}
  } catch (error) {
    console.error('Failed to load statistics:', error)
  }
}

async function loadLimitedAccounts() {
  try {
    const response = await api.get('/smart-rate-limit/limited-accounts')
    limitedAccounts.value = response.data || []
  } catch (error) {
    console.error('Failed to load limited accounts:', error)
  }
}

async function updateGlobalSettings() {
  try {
    await api.put('/smart-rate-limit/global-settings', config.value.globalSettings)
    message.success('全局设置已更新')
  } catch (error) {
    console.error('Failed to update global settings:', error)
    message.error('更新全局设置失败')
  }
}

async function saveInstantRule() {
  try {
    const keywords = instantRuleForm.value.keywordsText
      .split('\n')
      .map((k) => k.trim())
      .filter((k) => k)

    if (!instantRuleForm.value.name || keywords.length === 0) {
      message.error('请填写规则名称和关键词')
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
      await api.put(`/smart-rate-limit/rules/instant/${editingRule.value.id}`, ruleData)
      message.success('规则已更新')
    } else {
      await api.post('/smart-rate-limit/rules/instant', ruleData)
      message.success('规则已添加')
    }

    closeInstantRuleDialog()
    await loadConfig()
  } catch (error) {
    console.error('Failed to save instant rule:', error)
    message.error('保存规则失败')
  }
}

async function saveCumulativeRule() {
  try {
    const keywords = cumulativeRuleForm.value.keywordsText
      .split('\n')
      .map((k) => k.trim())
      .filter((k) => k)

    if (!cumulativeRuleForm.value.name || keywords.length === 0) {
      message.error('请填写规则名称和关键词')
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
      await api.put(`/smart-rate-limit/rules/cumulative/${editingRule.value.id}`, ruleData)
      message.success('规则已更新')
    } else {
      await api.post('/smart-rate-limit/rules/cumulative', ruleData)
      message.success('规则已添加')
    }

    closeCumulativeRuleDialog()
    await loadConfig()
  } catch (error) {
    console.error('Failed to save cumulative rule:', error)
    message.error('保存规则失败')
  }
}

async function updateRule(type, rule) {
  try {
    await api.put(`/smart-rate-limit/rules/${type}/${rule.id}`, rule)
  } catch (error) {
    console.error('Failed to update rule:', error)
    message.error('更新规则失败')
    await loadConfig()
  }
}

async function deleteRule(type, ruleId) {
  try {
    await api.delete(`/smart-rate-limit/rules/${type}/${ruleId}`)
    message.success('规则已删除')
    await loadConfig()
  } catch (error) {
    console.error('Failed to delete rule:', error)
    message.error('删除规则失败')
  }
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
    showAddInstantRule.value = true
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
    showAddCumulativeRule.value = true
  }
}

async function removeRateLimit(accountId) {
  try {
    await api.delete(`/smart-rate-limit/limited-accounts/${accountId}`)
    message.success('限流已解除')
    await loadLimitedAccounts()
  } catch (error) {
    console.error('Failed to remove rate limit:', error)
    message.error('解除限流失败')
  }
}

async function clearAllRateLimits() {
  try {
    await api.post('/smart-rate-limit/clear-all')
    message.success('所有限流已解除')
    await loadLimitedAccounts()
  } catch (error) {
    console.error('Failed to clear all rate limits:', error)
    message.error('清除限流失败')
  }
}

async function exportConfig() {
  try {
    const response = await api.get('/smart-rate-limit/export')
    const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `smart-rate-limit-config-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    message.success('配置已导出')
  } catch (error) {
    console.error('Failed to export config:', error)
    message.error('导出配置失败')
  }
}

async function importConfig() {
  try {
    const configData = JSON.parse(importConfigText.value)
    await api.post('/smart-rate-limit/import', {
      config: configData,
      merge: mergeImport.value
    })
    message.success('配置已导入')
    showImportDialog.value = false
    importConfigText.value = ''
    await loadConfig()
  } catch (error) {
    console.error('Failed to import config:', error)
    message.error('导入配置失败：' + error.message)
  }
}

function refreshLimitedAccounts() {
  loadLimitedAccounts()
  loadStatistics()
}

function closeInstantRuleDialog() {
  showAddInstantRule.value = false
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
}

function closeCumulativeRuleDialog() {
  showAddCumulativeRule.value = false
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
}

// 工具函数
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

<style lang="scss" scoped>
.smart-rate-limit-view {
  padding: 24px;

  .page-header {
    margin-bottom: 24px;

    .page-title {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;

      .icon {
        font-size: 28px;
      }
    }

    .page-description {
      color: var(--n-text-color-3);
      font-size: 14px;
    }
  }

  .settings-card {
    margin-bottom: 24px;
  }

  .tabs-container {
    .tab-content {
      padding: 16px 0;

      .toolbar {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
      }

      .stats-grid {
        margin-bottom: 24px;
      }

      .ranking-card {
        margin-top: 24px;
      }
    }
  }
}
</style>
