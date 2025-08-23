<template>
  <div class="gradient-bg min-h-screen p-4 md:p-6">
    <!-- 顶部导航 -->
    <div class="glass-strong mb-6 rounded-3xl p-4 shadow-xl md:mb-8 md:p-6">
      <div class="flex flex-col items-center justify-between gap-4 md:flex-row">
        <LogoTitle
          :loading="oemLoading"
          :logo-src="oemSettings.siteIconData || oemSettings.siteIcon"
          :subtitle="
            currentTab === 'stats'
              ? 'API Key 使用统计'
              : currentTab === 'redeem'
                ? '兑换码激活'
                : '使用教程'
          "
          :title="oemSettings.siteName"
        />
        <div class="flex items-center gap-3">
          <button
            class="relative inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 px-3 py-2 text-sm font-semibold text-white shadow-lg ring-2 ring-white/20 transition-all duration-300 hover:from-blue-700 hover:to-purple-700 hover:shadow-xl md:px-4 md:py-2 md:text-base"
            title="点击复制QQ群号"
            @click="copyToClipboard('452758314')"
          >
            <i class="fab fa-qq"></i>
            <span class="whitespace-nowrap">QQ群：452758314</span>
            <i class="fas fa-copy hidden md:inline"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Tab 切换 -->
    <div class="mb-6 md:mb-8">
      <div class="flex justify-center">
        <div
          class="inline-flex w-full max-w-2xl rounded-full border border-white/20 bg-white/10 p-1 shadow-lg backdrop-blur-xl md:w-auto"
        >
          <button
            :class="['tab-pill-button', currentTab === 'stats' ? 'active' : '']"
            @click="currentTab = 'stats'"
          >
            <i class="fas fa-chart-line mr-1 md:mr-2" />
            <span class="text-sm md:text-base">统计查询</span>
          </button>
          <button
            :class="['tab-pill-button', currentTab === 'redeem' ? 'active' : '']"
            @click="currentTab = 'redeem'"
          >
            <i class="fas fa-ticket-alt mr-1 md:mr-2" />
            <span class="text-sm md:text-base">兑换码</span>
          </button>
          <button
            :class="['tab-pill-button', currentTab === 'tutorial' ? 'active' : '']"
            @click="currentTab = 'tutorial'"
          >
            <i class="fas fa-graduation-cap mr-1 md:mr-2" />
            <span class="text-sm md:text-base">使用教程</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 统计内容 -->
    <div v-if="currentTab === 'stats'" class="tab-content">
      <!-- API Key 输入区域 -->
      <ApiKeyInput />

      <!-- 错误提示 -->
      <div v-if="error" class="mb-6 md:mb-8">
        <div
          class="rounded-xl border border-red-500 bg-white/95 p-3 text-sm text-red-700 shadow-md backdrop-blur-sm md:p-4 md:text-base"
        >
          <i class="fas fa-exclamation-triangle mr-2" />
          {{ error }}
        </div>
      </div>

      <!-- 统计数据展示区域 -->
      <div v-if="statsData" class="fade-in">
        <div class="glass-strong rounded-3xl p-4 shadow-xl md:p-6">
          <!-- 时间范围选择器 -->
          <div class="mb-4 border-b border-gray-200 pb-4 md:mb-6 md:pb-6">
            <div
              class="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center md:gap-4"
            >
              <div class="flex items-center gap-2 md:gap-3">
                <i class="fas fa-clock text-base text-blue-500 md:text-lg" />
                <span class="text-base font-medium text-gray-700 md:text-lg">统计时间范围</span>
              </div>
            </div>
          </div>

          <!-- 基本信息和统计概览 -->
          <StatsOverview />

          <!-- Token 分布和限制配置 -->
          <!-- <div class="mb-6 grid grid-cols-1 gap-4 md:mb-8 md:gap-6 lg:grid-cols-2">
            <TokenDistribution /> -->
          <!-- <LimitConfig /> -->
          <!-- </div> -->

          <!-- 模型使用统计 -->
          <!-- <ModelUsageStats /> -->
        </div>
      </div>
    </div>

    <!-- 兑换码内容 -->
    <div v-if="currentTab === 'redeem'" class="tab-content">
      <div class="glass-strong rounded-3xl p-4 shadow-xl md:p-6">
        <div class="mb-6">
          <h3 class="mb-2 text-lg font-semibold text-gray-900 md:text-xl">兑换码激活</h3>
          <p class="text-sm text-gray-600 md:text-base">
            输入兑换码激活日卡或月卡，提升API Key的费用限制
          </p>
        </div>

        <!-- 兑换表单 -->
        <div class="space-y-4 md:space-y-6">
          <!-- 兑换码输入 -->
          <div>
            <label class="mb-2 block text-sm font-medium text-gray-700">兑换码</label>
            <div class="relative">
              <input
                v-model="redeemCode"
                class="w-full rounded-xl border-2 border-gray-200 bg-white/50 px-4 py-3 text-gray-900 placeholder-gray-500 backdrop-blur-sm transition-colors focus:border-blue-500 focus:outline-none"
                :disabled="isRedeeming"
                placeholder="请输入兑换码，如：D-xxxxxxxx 或 M-xxxxxxxx"
                type="text"
              />
              <div class="absolute right-3 top-1/2 -translate-y-1/2">
                <i class="fas fa-ticket-alt text-gray-400"></i>
              </div>
            </div>
          </div>

          <!-- 兑换按钮 -->
          <div class="pt-2">
            <button
              class="w-full rounded-xl px-6 py-3 font-semibold text-white shadow-lg transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
              :class="
                canRedeem
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 hover:shadow-xl'
                  : 'bg-gray-400'
              "
              :disabled="!canRedeem"
              @click="handleRedeem"
            >
              <i v-if="isRedeeming" class="fas fa-spinner fa-spin mr-2"></i>
              <i v-else class="fas fa-gift mr-2"></i>
              {{ isRedeeming ? '兑换中...' : '立即兑换' }}
            </button>
          </div>

          <!-- 兑换结果显示 -->
          <div
            v-if="redemptionResult"
            :class="[
              'rounded-xl p-4 backdrop-blur-sm',
              redemptionResult.alreadyUsed ? 'bg-blue-50/50' : 'bg-green-50/50'
            ]"
          >
            <h4
              :class="[
                'mb-3 flex items-center text-sm font-medium',
                redemptionResult.alreadyUsed ? 'text-blue-900' : 'text-green-900'
              ]"
            >
              <i
                :class="[
                  'mr-2',
                  redemptionResult.alreadyUsed ? 'fas fa-info-circle' : 'fas fa-check-circle'
                ]"
              ></i>
              {{ redemptionResult.alreadyUsed ? '兑换码信息' : '兑换成功' }}
            </h4>
            <div
              :class="[
                'space-y-2 text-sm',
                redemptionResult.alreadyUsed ? 'text-blue-800' : 'text-green-800'
              ]"
            >
              <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <span>API Key（密钥）:</span>
                <div class="flex items-start gap-2 md:items-center">
                  <code
                    :class="[
                      'max-w-full whitespace-pre-wrap break-all rounded px-2 py-1 text-xs md:max-w-[28rem]',
                      redemptionResult.alreadyUsed ? 'bg-blue-100' : 'bg-green-100'
                    ]"
                    >{{ redemptionResult.apiKey }}</code
                  >
                  <button
                    :class="[
                      'hover:text-opacity-80',
                      redemptionResult.alreadyUsed
                        ? 'text-blue-600 hover:text-blue-800'
                        : 'text-green-600 hover:text-green-800'
                    ]"
                    @click="copyToClipboard(redemptionResult.apiKey)"
                  >
                    <i class="fas fa-copy"></i>
                  </button>
                </div>
              </div>
              <div class="flex justify-between">
                <span>名称:</span>
                <span>{{ redemptionResult.name }}</span>
              </div>
              <div class="flex justify-between">
                <span>有效期:</span>
                <span>{{ redemptionResult.duration }}天</span>
              </div>
              <div class="flex justify-between">
                <span>每日用量限制:</span>
                <span>
                  {{ getPackageTokenDisplay(redemptionResult.name) }}
                </span>
              </div>
              <div
                v-if="redemptionResult.alreadyUsed && redemptionResult.usedAt"
                class="flex justify-between"
              >
                <span>使用时间:</span>
                <span>{{ formatDateTime(redemptionResult.usedAt) }}</span>
              </div>
              <div class="flex justify-between">
                <span>过期时间:</span>
                <span>{{ formatDateTime(redemptionResult.expiresAt) }}</span>
              </div>

              <div class="mt-3 rounded-xl bg-gray-50 p-3 md:p-4">
                <h5 class="mb-2 text-sm font-medium text-gray-900">环境一键安装</h5>
                <div class="space-y-3">
                  <div class="flex items-start gap-2">
                    <span class="min-w-[9rem] text-xs font-medium text-gray-700 md:text-sm"
                      >Windows (PowerShell):</span
                    >
                    <div class="flex-1">
                      <div class="relative">
                        <code
                          class="block w-full whitespace-pre-wrap break-all rounded bg-gray-800 p-2 text-xs text-green-100 md:text-sm"
                          >{{ windowsCommand }}</code
                        >
                        <button
                          class="absolute right-2 top-2 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                          @click="copyToClipboard(windowsCommand)"
                        >
                          复制
                        </button>
                      </div>
                    </div>
                  </div>
                  <div class="flex items-start gap-2">
                    <span class="min-w-[9rem] text-xs font-medium text-gray-700 md:text-sm"
                      >Linux / macOS:</span
                    >
                    <div class="flex-1">
                      <div class="relative">
                        <code
                          class="block w-full whitespace-pre-wrap break-all rounded bg-gray-800 p-2 text-xs text-green-100 md:text-sm"
                          >{{ bashCommand }}</code
                        >
                        <button
                          class="absolute right-2 top-2 rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                          @click="copyToClipboard(bashCommand)"
                        >
                          复制
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <p class="mt-2 text-xs text-gray-600">
                  执行后将自动配置 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。
                </p>

                <!-- 安装后重要提示（更醒目） -->
                <div class="mt-4 rounded-2xl border-2 border-amber-400 bg-amber-50 p-3 md:p-4">
                  <div class="mb-2 flex items-center text-amber-800">
                    <i class="fas fa-exclamation-triangle mr-2"></i>
                    <span class="text-base font-bold md:text-lg">重要提示（安装完成后）</span>
                  </div>
                  <ul class="space-y-2 text-amber-800">
                    <li class="text-sm md:text-base">
                      <b>Windows（PowerShell）</b>：请<strong>关闭并重新打开 PowerShell</strong>
                      再使用。
                    </li>
                    <li class="text-sm md:text-base">
                      <b>Linux / macOS</b
                      >：建议<strong>重新打开终端</strong>，或执行下方命令使当前会话生效：
                    </li>
                  </ul>
                  <div class="mt-3 grid gap-3 md:grid-cols-2">
                    <div class="relative">
                      <code
                        class="block w-full whitespace-pre-wrap break-all rounded bg-gray-800 p-2 text-xs text-green-100 md:text-sm"
                        >{{ linuxReloadCmd }}</code
                      >
                      <button
                        class="absolute right-2 top-2 rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-700"
                        @click="copyToClipboard(linuxReloadCmd)"
                      >
                        复制
                      </button>
                    </div>
                    <div class="relative">
                      <code
                        class="block w-full whitespace-pre-wrap break-all rounded bg-gray-800 p-2 text-xs text-green-100 md:text-sm"
                        >{{ linuxNvmFixCmd }}</code
                      >
                      <button
                        class="absolute right-2 top-2 rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-700"
                        @click="copyToClipboard(linuxNvmFixCmd)"
                      >
                        复制
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- 提示信息 -->
          <div class="rounded-xl bg-blue-50/50 p-4 backdrop-blur-sm">
            <h4 class="mb-2 flex items-center text-sm font-medium text-blue-900">
              <i class="fas fa-info-circle mr-2"></i>
              兑换说明
            </h4>
            <ul class="space-y-1 text-xs text-blue-800 md:text-sm">
              <li>
                • <strong>日卡 (D-xxxxxxxx):</strong> 有效期1天，每日用量限制{{
                  getPackageTokenDisplay('日卡')
                }}
              </li>
              <li>
                • <strong>月卡 (M-xxxxxxxx):</strong> 有效期30天，每日用量限制{{
                  getPackageTokenDisplay('月卡')
                }}, 北京时间 00:00:00 重置用量
              </li>
              <li>• 兑换成功后会自动生成对应的API Key</li>
              <li>
                •
                <span style="color: red"
                  >如果您忘记API Key（密钥），可以使用兑换码重新兑换查看</span
                >
              </li>
              <li>• 兑换成功后可复制上方命令，一键安装并自动注入你的 API Key</li>
              <li>• 安装脚本为 Windows 系统专用，下载后右键点击文件，“使用管理员身份运行”</li>
              <li>
                • 电脑环境千差万别，如果安装脚本无法使用，请自行<b>用点心</b>花2分钟
                <a
                  class="cursor-pointer text-red-600 underline hover:text-red-800"
                  href="#"
                  role="button"
                  @click.prevent="currentTab = 'tutorial'"
                >
                  查看使用教程
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- 教程内容 -->
    <div v-if="currentTab === 'tutorial'" class="tab-content">
      <div class="glass-strong rounded-3xl shadow-xl">
        <TutorialView />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useApiStatsStore } from '@/stores/apistats'
import { showToast } from '@/utils/toast'
import LogoTitle from '@/components/common/LogoTitle.vue'
import ApiKeyInput from '@/components/apistats/ApiKeyInput.vue'
import StatsOverview from '@/components/apistats/StatsOverview.vue'
import TutorialView from './TutorialView.vue'
import { pricingService } from '@/services/pricingService'

const route = useRoute()
const apiStatsStore = useApiStatsStore()

// 当前标签页
const currentTab = ref('redeem') // 默认打开兑换码页面

// 兑换码相关数据
const redeemCode = ref('')
const isRedeeming = ref(false)
const redemptionResult = ref(null)

// 动态价格配置
const packages = ref([])
const modelsInfo = ref([])
const pricingLoaded = ref(false)

const { apiKey, apiId, loading, oemLoading, error, statsData, oemSettings } =
  storeToRefs(apiStatsStore)

const { queryStats, loadStatsWithApiId, loadOemSettings, reset } = apiStatsStore

// 计算属性
const canRedeem = computed(() => {
  return redeemCode.value.trim() && !isRedeeming.value
})

// 复制到剪贴板
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    showToast('已复制到剪贴板', 'success')
  } catch (error) {
    showToast('复制失败', 'error')
  }
}

// 格式化日期时间
const formatDateTime = (dateString) => {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 兑换码处理函数
const handleRedeem = async () => {
  if (!canRedeem.value) return

  isRedeeming.value = true
  redemptionResult.value = null

  try {
    const response = await fetch('/redeem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: redeemCode.value.trim()
      })
    })

    const result = await response.json()

    if (result.success) {
      showToast(result.message, result.alreadyUsed ? 'info' : 'success')
      redemptionResult.value = {
        ...result.data,
        alreadyUsed: result.alreadyUsed || false
      }
      redeemCode.value = ''
    } else {
      showToast(result.error || '兑换失败', 'error')
    }
  } catch (error) {
    showToast('兑换失败，请稍后重试', 'error')
  } finally {
    isRedeeming.value = false
  }
}

// 动态安装命令（带注入 apiKey）
const windowsCommand = computed(() => {
  const key = redemptionResult.value?.apiKey || ''
  if (!key) return '请先兑换获取 API Key'
  const origin = window.location.origin
  const psUrl = `${origin}/install.ps1?apiKey=${encodeURIComponent(key)}&t=${Date.now()}`
  return `irm '${psUrl}' | iex`
})

const bashCommand = computed(() => {
  const key = redemptionResult.value?.apiKey || ''
  if (!key) return '请先兑换获取 API Key'
  const origin = window.location.origin
  const shUrl = `${origin}/install.sh?apiKey=${encodeURIComponent(key)}&t=${Date.now()}`
  return `curl -fsSL '${shUrl}' -o install.sh && bash install.sh`
})

// 安装后提示中的辅助命令
const linuxReloadCmd = `source ~/.bashrc || source ~/.profile`
const linuxNvmFixCmd = `export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm use 20 || true`

// 加载定价数据
const loadPricingData = async () => {
  try {
    const [packagesResponse, modelsResponse] = await Promise.all([
      pricingService.getPackages(),
      pricingService.getModels()
    ])

    if (packagesResponse?.success) {
      packages.value = packagesResponse.data.packages || []
    }

    if (modelsResponse?.success) {
      modelsInfo.value = modelsResponse.data.models || []
    }

    pricingLoaded.value = true
  } catch (error) {
    console.error('加载定价数据失败:', error)
    // 使用默认值
    const defaultTokens = pricingService.calculateDefaultPackageTokens()
    packages.value = [
      {
        id: 'daily',
        name: '日卡',
        type: 'D',
        defaultDailyTokens: defaultTokens.dailyCard.dailyTokens,
        defaultFormattedDaily: defaultTokens.dailyCard.formattedDaily
      },
      {
        id: 'monthly',
        name: '月卡',
        type: 'M',
        defaultDailyTokens: defaultTokens.monthlyCard.dailyTokens,
        defaultFormattedDaily: defaultTokens.monthlyCard.formattedDaily
      }
    ]
    pricingLoaded.value = true
  }
}

// 根据套餐类型获取token限制显示
const getPackageTokenDisplay = (packageName) => {
  if (!pricingLoaded.value || packages.value.length === 0) {
    // 加载中或失败时使用用户标准的固定值
    const defaultTokens = pricingService.calculateDefaultPackageTokens()
    if (packageName?.includes('日卡')) {
      return defaultTokens.dailyCard.formattedDaily // 1千500万
    } else if (packageName?.includes('月卡')) {
      return defaultTokens.monthlyCard.formattedDaily // 8千万
    }
    return ''
  }

  // 根据套餐名称匹配对应的package
  let targetPackage = null
  if (packageName?.includes('日卡')) {
    targetPackage = packages.value.find((p) => p.type === 'D' || p.id === 'daily')
  } else if (packageName?.includes('月卡')) {
    targetPackage = packages.value.find((p) => p.type === 'M' || p.id === 'monthly')
  }

  if (targetPackage) {
    return targetPackage.defaultFormattedDaily // 后端已经包含 " Tokens" 后缀
  }

  return ''
}

// 处理键盘快捷键
const handleKeyDown = (event) => {
  // Ctrl/Cmd + Enter 查询
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    if (!loading.value && apiKey.value.trim()) {
      queryStats()
    }
    event.preventDefault()
  }

  // ESC 清除数据
  if (event.key === 'Escape') {
    reset()
  }
}

// 初始化
onMounted(() => {
  // console.log('API Stats Page loaded')

  // 加载 OEM 设置
  loadOemSettings()

  // 检查 URL 参数
  const urlApiId = route.query.apiId
  const urlApiKey = route.query.apiKey

  if (
    urlApiId &&
    urlApiId.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
  ) {
    // 如果 URL 中有 apiId，直接使用 apiId 加载数据
    apiId.value = urlApiId
    loadStatsWithApiId()
  } else if (urlApiKey && urlApiKey.length > 10) {
    // 向后兼容，支持 apiKey 参数
    apiKey.value = urlApiKey
  }

  // 根据 URL 参数设置默认 Tab（支持 stats / redeem / tutorial）
  let urlTab = route.query.tab
  // 兼容 t= 简写
  if (!urlTab && typeof route.query.t === 'string') {
    urlTab = route.query.t
  }
  if (typeof urlTab === 'string' && ['stats', 'redeem', 'tutorial'].includes(urlTab)) {
    currentTab.value = urlTab
  }

  // 添加键盘事件监听
  document.addEventListener('keydown', handleKeyDown)

  // 加载定价配置
  loadPricingData()
})

// 清理
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})

// 监听 API Key 变化
watch(apiKey, (newValue) => {
  if (!newValue) {
    apiStatsStore.clearData()
  }
})
</script>

<style scoped>
/* 渐变背景 */
.gradient-bg {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  background-attachment: fixed;
  min-height: 100vh;
  position: relative;
}

.gradient-bg::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background:
    radial-gradient(circle at 20% 80%, rgba(240, 147, 251, 0.2) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(102, 126, 234, 0.2) 0%, transparent 50%),
    radial-gradient(circle at 40% 40%, rgba(118, 75, 162, 0.1) 0%, transparent 50%);
  pointer-events: none;
  z-index: 0;
}

/* 玻璃态效果 */
.glass-strong {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(25px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba(255, 255, 255, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  position: relative;
  z-index: 1;
}

/* 标题渐变 */
.header-title {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 700;
  letter-spacing: -0.025em;
}

/* 管理后台按钮 */
.admin-button {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  text-decoration: none;
  box-shadow:
    0 4px 6px -1px rgba(102, 126, 234, 0.3),
    0 2px 4px -1px rgba(102, 126, 234, 0.1);
  position: relative;
  overflow: hidden;
}

.admin-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s;
}

.admin-button:hover {
  transform: translateY(-2px);
  box-shadow:
    0 10px 15px -3px rgba(102, 126, 234, 0.4),
    0 4px 6px -2px rgba(102, 126, 234, 0.15);
}

.admin-button:hover::before {
  left: 100%;
}

/* 时间范围按钮 */
.period-btn {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  font-weight: 500;
  letter-spacing: 0.025em;
  transition: all 0.3s ease;
  border: none;
  cursor: pointer;
}

.period-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow:
    0 10px 15px -3px rgba(102, 126, 234, 0.3),
    0 4px 6px -2px rgba(102, 126, 234, 0.05);
  transform: translateY(-1px);
}

.period-btn:not(.active) {
  color: #374151;
  background: transparent;
}

.period-btn:not(.active):hover {
  background: rgba(255, 255, 255, 0.1);
  color: #1f2937;
}

/* Tab 胶囊按钮样式 */
.tab-pill-button {
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-weight: 500;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.8);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  flex: 1;
  justify-content: center;
}

@media (min-width: 768px) {
  .tab-pill-button {
    padding: 0.625rem 1.25rem;
    flex: none;
  }
}

.tab-pill-button:hover {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

.tab-pill-button.active {
  background: white;
  color: #764ba2;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.tab-pill-button i {
  font-size: 0.875rem;
}

/* Tab 内容切换动画 */
.tab-content {
  animation: tabFadeIn 0.4s ease-out;
}

@keyframes tabFadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 动画效果 */
.fade-in {
  animation: fadeIn 0.6s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
