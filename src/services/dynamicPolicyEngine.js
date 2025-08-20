const redis = require('../models/redis')
const logger = require('../utils/logger')
const keyLogsService = require('./keyLogsService')
const redemptionPolicyService = require('./redemptionPolicyService')
const rateTemplateService = require('./rateTemplateService')
// apiKeyService 将在需要时动态引入，以避免循环依赖

class DynamicPolicyEngine {
  constructor() {
    this.POLICY_CHECK_QUEUE = 'policy_check_queue'
    this.TEMPLATE_SWITCH_HISTORY_PREFIX = 'template_switch_history:'
    this.ACTIVE_POLICIES_INDEX = 'active_policies:redemption'
    this.isRunning = false
    this.checkInterval = null
  }

  /**
   * 启动策略引擎
   */
  start() {
    if (this.isRunning) {
      logger.warn('[策略引擎] 引擎已在运行中')
      return
    }

    this.isRunning = true
    this.checkInterval = setInterval(() => {
      this.processCheckQueue()
    }, 30 * 1000) // 每30秒检查一次队列

    logger.info('[策略引擎] 动态策略引擎已启动')
  }

  /**
   * 停止策略引擎
   */
  stop() {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }

    logger.info('[策略引擎] 动态策略引擎已停止')
  }

  /**
   * 处理使用量更新（API调用时触发）
   */
  async handleUsageUpdate(apiKeyId, usageData) {
    try {
      // 检查是否有策略绑定
      const policyBinding = await redemptionPolicyService.getApiKeyPolicy(apiKeyId)
      if (!policyBinding || policyBinding.isActive !== 'true') {
        return
      }

      // 更新使用量监控数据
      const currentPercentage = await redemptionPolicyService.updateUsageMonitor(
        apiKeyId,
        usageData
      )

      // 检查是否需要触发策略
      await this.checkAndTriggerPolicy(apiKeyId, currentPercentage)
    } catch (error) {
      logger.error(`[策略引擎] 处理使用量更新失败: ${error.message}`)
    }
  }

  /**
   * 检查并触发策略（核心逻辑）
   */
  async checkAndTriggerPolicy(apiKeyId, currentPercentage) {
    try {
      const policyBinding = await redemptionPolicyService.getApiKeyPolicy(apiKeyId)
      if (!policyBinding || policyBinding.isActive !== 'true') {
        return
      }

      // 获取源策略配置
      const { metadata } = policyBinding
      const effectivePolicy = await redemptionPolicyService.getEffectivePolicy(
        metadata.originalCode,
        metadata.codeType
      )

      if (
        !effectivePolicy ||
        !effectivePolicy.thresholds ||
        effectivePolicy.thresholds.length === 0
      ) {
        return
      }

      // 检查阈值（按优先级排序）
      const thresholds = [...effectivePolicy.thresholds].sort(
        (a, b) => (b.priority || 0) - (a.priority || 0)
      )
      const appliedThresholds = policyBinding.appliedThresholds || []

      for (const threshold of thresholds) {
        if (currentPercentage >= threshold.percentage) {
          // 检查是否已经应用过这个阈值
          const alreadyApplied = appliedThresholds.some(
            (applied) =>
              applied.percentage === threshold.percentage &&
              applied.templateId === threshold.templateId
          )

          if (!alreadyApplied) {
            await this.applyTemplateSwitch(apiKeyId, threshold, currentPercentage, policyBinding)
            break // 只应用最高优先级的阈值
          }
        }
      }
    } catch (error) {
      logger.error(`[策略引擎] 检查策略失败: ${error.message}`)
    }
  }

  /**
   * 应用模板切换
   */
  async applyTemplateSwitch(apiKeyId, threshold, currentPercentage, policyBinding) {
    try {
      const fromTemplateId = policyBinding.currentTemplate
      const toTemplateId = threshold.templateId

      if (fromTemplateId === toTemplateId) {
        return // 模板相同，无需切换
      }

      // 获取源模板和目标模板的信息
      const fromTemplate = await rateTemplateService.getTemplate(fromTemplateId)
      const toTemplate = await rateTemplateService.getTemplate(toTemplateId)

      if (!toTemplate) {
        logger.error(`[策略引擎] 目标模板 ${toTemplateId} 不存在，跳过切换`)
        return
      }

      // 获取模板名称用于日志
      const fromTemplateName = fromTemplate ? fromTemplate.name : `未知模板(${fromTemplateId})`
      const toTemplateName = toTemplate.name || `模板(${toTemplateId})`

      // 执行模板切换
      await this.executeTemplateSwitch(apiKeyId, fromTemplateId, toTemplateId, {
        reason: `threshold_${threshold.percentage}_exceeded`,
        percentage: currentPercentage,
        thresholdConfig: threshold,
        fromTemplateName,
        toTemplateName
      })

      logger.info(
        `[策略引擎] API Key ${apiKeyId} 模板已从 【${fromTemplateName}】 切换到 【${toTemplateName}】`
      )
    } catch (error) {
      logger.error(`[策略引擎] 应用模板切换失败: ${error.message}`)
    }
  }

  /**
   * 执行模板切换
   */
  async executeTemplateSwitch(apiKeyId, fromTemplate, toTemplate, switchData) {
    try {
      const timestamp = new Date().toISOString()

      // 更新API Key的模板绑定
      await this.updateApiKeyTemplate(apiKeyId, toTemplate, switchData.toTemplateName)

      // 更新策略绑定状态
      const policyBinding = await redemptionPolicyService.getApiKeyPolicy(apiKeyId)
      const updatedAppliedThresholds = [
        ...(policyBinding.appliedThresholds || []),
        {
          percentage: switchData.thresholdConfig.percentage,
          templateId: toTemplate,
          templateName: switchData.toTemplateName,
          triggeredAt: timestamp,
          usagePercentage: switchData.percentage
        }
      ]

      await redis.hset(`api_key_policy:${apiKeyId}`, {
        currentTemplate: toTemplate,
        appliedThresholds: JSON.stringify(updatedAppliedThresholds),
        lastCheck: timestamp
      })

      // 记录切换历史（包含模板名称）
      await this.recordSwitchHistory(apiKeyId, {
        fromTemplate,
        toTemplate,
        fromTemplateName: switchData.fromTemplateName,
        toTemplateName: switchData.toTemplateName,
        reason: switchData.reason,
        triggeredAt: timestamp,
        usagePercentage: switchData.percentage,
        thresholdConfig: switchData.thresholdConfig
      })

      // 记录关键日志
      await keyLogsService.logTemplateSwitch(
        apiKeyId,
        fromTemplate,
        toTemplate,
        switchData.reason,
        {
          usagePercentage: switchData.percentage,
          threshold: switchData.thresholdConfig.percentage,
          fromTemplateName: switchData.fromTemplateName,
          toTemplateName: switchData.toTemplateName
        }
      )
    } catch (error) {
      logger.error(`[策略引擎] 执行模板切换失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 更新API Key的模板绑定（使用apiKeyService标准方法）
   */
  async updateApiKeyTemplate(apiKeyId, templateId, templateName) {
    try {
      // 动态引入 apiKeyService 以避免循环依赖
      const apiKeyService = require('./apiKeyService')
      // 使用apiKeyService的专用方法更新模板
      await apiKeyService.updateApiKeyFromDynamicPolicy(apiKeyId, {
        rateTemplateId: templateId
      })

      const displayName = templateName || templateId
      logger.debug(`[策略引擎] 已更新 API Key ${apiKeyId} 的模板为 【${displayName}】`)
    } catch (error) {
      logger.error(`[策略引擎] 更新API Key模板失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 记录模板切换历史
   */
  async recordSwitchHistory(apiKeyId, switchRecord) {
    try {
      const historyKey = `${this.TEMPLATE_SWITCH_HISTORY_PREFIX}${apiKeyId}`

      // 添加到历史记录列表
      await redis.lpush(historyKey, JSON.stringify(switchRecord))

      // 限制历史记录数量（保留最近100条）
      await redis.ltrim(historyKey, 0, 99)

      // 设置过期时间（90天）
      await redis.expire(historyKey, 90 * 24 * 60 * 60)

      logger.debug(`[策略引擎] 已记录 ${apiKeyId} 的模板切换历史`)
    } catch (error) {
      logger.error(`[策略引擎] 记录切换历史失败: ${error.message}`)
    }
  }

  /**
   * 处理检查队列（定时任务）
   */
  async processCheckQueue() {
    try {
      const now = Date.now()

      // 获取需要检查的API Key
      const apiKeysToCheck = await redis.zrangebyscore(
        this.POLICY_CHECK_QUEUE,
        '-inf',
        now,
        'LIMIT',
        0,
        10
      )

      if (apiKeysToCheck.length === 0) {
        return
      }

      logger.debug(`[策略引擎] 处理 ${apiKeysToCheck.length} 个API Key的策略检查`)

      for (const apiKeyId of apiKeysToCheck) {
        await this.performScheduledCheck(apiKeyId)

        // 从队列中移除
        await redis.zrem(this.POLICY_CHECK_QUEUE, apiKeyId)

        // 重新安排下次检查
        const policyBinding = await redemptionPolicyService.getApiKeyPolicy(apiKeyId)
        if (policyBinding && policyBinding.isActive === 'true') {
          const { metadata } = policyBinding
          const effectivePolicy = await redemptionPolicyService.getEffectivePolicy(
            metadata.originalCode,
            metadata.codeType
          )

          const nextCheck = now + (parseInt(effectivePolicy.monitorInterval) || 5) * 60 * 1000
          await redis.zadd(this.POLICY_CHECK_QUEUE, nextCheck, apiKeyId)
        }
      }
    } catch (error) {
      logger.error(`[策略引擎] 处理检查队列失败: ${error.message}`)
    }
  }

  /**
   * 执行定时检查
   */
  async performScheduledCheck(apiKeyId) {
    try {
      // 获取当前使用量
      const usageData = await redemptionPolicyService.getUsageMonitor(apiKeyId)
      if (!usageData) {
        return
      }

      const currentPercentage = parseFloat(usageData.currentPercentage) || 0

      // 检查策略
      await this.checkAndTriggerPolicy(apiKeyId, currentPercentage)
    } catch (error) {
      logger.error(`[策略引擎] 定时检查失败: ${error.message}`)
    }
  }

  /**
   * 重置API Key的策略状态（每日重置）
   */
  async resetApiKeyPolicy(apiKeyId) {
    try {
      const policyBinding = await redemptionPolicyService.getApiKeyPolicy(apiKeyId)
      if (!policyBinding || policyBinding.isActive !== 'true') {
        return
      }

      // 检查API Key是否为日卡类型，如果是则跳过重置
      const apiKeyData = await redis.getApiKey(apiKeyId)
      if (apiKeyData && apiKeyData.tags) {
        let tags = []

        // 增强的标签解析逻辑
        try {
          if (typeof apiKeyData.tags === 'string') {
            const trimmedTags = apiKeyData.tags.trim()

            // 尝试JSON解析
            if (trimmedTags.startsWith('[') && trimmedTags.endsWith(']')) {
              try {
                tags = JSON.parse(trimmedTags)
              } catch (jsonError) {
                logger.debug(`[策略引擎] JSON解析失败，尝试其他方式: ${jsonError.message}`)
                // JSON解析失败，按逗号分割
                tags = trimmedTags
                  .slice(1, -1)
                  .split(',')
                  .map((tag) =>
                    // 移除引号和空格
                    tag.replace(/['"]/g, '').trim()
                  )
                  .filter((tag) => tag.length > 0)
              }
            } else {
              // 不是JSON格式，按逗号分割
              tags = trimmedTags
                .split(',')
                .map((tag) => tag.trim())
                .filter((tag) => tag.length > 0)
            }
          } else if (Array.isArray(apiKeyData.tags)) {
            tags = [...apiKeyData.tags]
          }
        } catch (error) {
          logger.warn(`[策略引擎] 标签解析失败: ${error.message}, 使用空标签列表`)
          tags = []
        }

        logger.debug(`[策略引擎] API Key ${apiKeyId} 标签解析结果: ${JSON.stringify(tags)}`)

        // 如果包含 daily-card 标签，跳过重置
        if (tags.includes('daily-card')) {
          logger.info(`[策略引擎] API Key ${apiKeyId} 为日卡类型，跳过每日重置`)
          return
        } else {
          logger.debug(
            `[策略引擎] API Key ${apiKeyId} 非日卡类型，将执行重置。标签: ${JSON.stringify(tags)}`
          )
        }
      }

      const { metadata } = policyBinding
      const { initialTemplate } = policyBinding

      // 重置到初始模板
      if (policyBinding.currentTemplate !== initialTemplate) {
        // 获取模板名称
        const currentTemplate = await rateTemplateService.getTemplate(policyBinding.currentTemplate)
        const initTemplate = await rateTemplateService.getTemplate(initialTemplate)

        await this.executeTemplateSwitch(apiKeyId, policyBinding.currentTemplate, initialTemplate, {
          reason: 'daily_reset',
          percentage: 0,
          thresholdConfig: { description: '每日重置' },
          fromTemplateName: currentTemplate
            ? currentTemplate.name
            : `模板(${policyBinding.currentTemplate})`,
          toTemplateName: initTemplate ? initTemplate.name : `模板(${initialTemplate})`
        })
      }

      // 重置策略绑定状态
      await redis.hset(`api_key_policy:${apiKeyId}`, {
        currentTemplate: initialTemplate,
        appliedThresholds: JSON.stringify([]),
        lastReset: new Date().toISOString()
      })

      // 初始化新的使用量监控
      const effectivePolicy = await redemptionPolicyService.getEffectivePolicy(
        metadata.originalCode,
        metadata.codeType
      )
      await redemptionPolicyService._initUsageMonitor(apiKeyId, effectivePolicy)

      logger.info(`[策略引擎] API Key ${apiKeyId} 策略状态已重置`)
    } catch (error) {
      logger.error(`[策略引擎] 重置API Key策略失败: ${error.message}`)
    }
  }

  /**
   * 获取模板切换历史
   */
  async getSwitchHistory(apiKeyId, limit = 10) {
    try {
      const historyKey = `${this.TEMPLATE_SWITCH_HISTORY_PREFIX}${apiKeyId}`
      const records = await redis.lrange(historyKey, 0, limit - 1)

      return records.map((record) => JSON.parse(record))
    } catch (error) {
      logger.error(`[策略引擎] 获取切换历史失败: ${error.message}`)
      return []
    }
  }

  /**
   * 获取策略引擎状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      hasInterval: this.checkInterval !== null,
      startTime: this.startTime || null
    }
  }
}

module.exports = new DynamicPolicyEngine()
