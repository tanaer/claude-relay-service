const { v4: uuidv4 } = require('uuid')
const logger = require('../utils/logger')
const redis = require('../models/redis')

class RateTemplateService {
  constructor() {
    this.TEMPLATES_KEY = 'rate_templates'
    this.TEMPLATE_PREFIX = 'rate_template:'
    this.defaultModels = [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'gemini-1.5-pro-latest',
      'gemini-1.5-flash-latest',
      'gemini-2.0-flash-exp',
      'us-east-1.anthropic.claude-3-5-sonnet-20241022-v2:0',
      'us-east-1.anthropic.claude-3-5-haiku-20241022-v1:0',
      'us-east-1.anthropic.claude-3-opus-20240229-v1:0'
    ]
  }

  // 创建倍率模板
  async createTemplate(templateData) {
    try {
      const { name, description = '', rates = {}, isDefault = false } = templateData

      if (!name) {
        return {
          success: false,
          error: '模板名称为必填项'
        }
      }

      const client = redis.getClientSafe()
      const templateId = uuidv4()
      const now = new Date().toISOString()

      // 如果设置为默认模板，先取消其他默认模板
      if (isDefault) {
        await this.clearDefaultTemplate()
      }

      const template = {
        id: templateId,
        name,
        description,
        rates: JSON.stringify(rates),
        isDefault: isDefault ? '1' : '0',
        createdAt: now,
        updatedAt: now
      }

      // 保存模板
      await client.hmset(`${this.TEMPLATE_PREFIX}${templateId}`, template)
      await client.sadd(this.TEMPLATES_KEY, templateId)

      logger.success(`✅ Created rate template: ${name} (${templateId})`)

      return {
        success: true,
        data: {
          ...template,
          rates: typeof template.rates === 'string' ? JSON.parse(template.rates) : template.rates,
          isDefault: template.isDefault === '1'
        }
      }
    } catch (error) {
      logger.error('❌ Failed to create rate template:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // 获取模板列表
  async getTemplates() {
    try {
      const client = redis.getClientSafe()
      const templateIds = await client.smembers(this.TEMPLATES_KEY)

      const templates = []
      for (const templateId of templateIds) {
        const templateData = await client.hgetall(`${this.TEMPLATE_PREFIX}${templateId}`)
        if (templateData && templateData.id) {
          templates.push({
            ...templateData,
            rates: templateData.rates ? JSON.parse(templateData.rates) : {},
            isDefault: templateData.isDefault === '1'
          })
        }
      }

      // 按创建时间排序，默认模板排在前面
      return templates.sort((a, b) => {
        if (a.isDefault && !b.isDefault) {
          return -1
        }
        if (!a.isDefault && b.isDefault) {
          return 1
        }
        return new Date(b.createdAt) - new Date(a.createdAt)
      })
    } catch (error) {
      logger.error('❌ Failed to get templates:', error)
      return []
    }
  }

  // 获取单个模板
  async getTemplate(templateId) {
    try {
      const client = redis.getClientSafe()
      const templateData = await client.hgetall(`${this.TEMPLATE_PREFIX}${templateId}`)

      if (!templateData || !templateData.id) {
        return null
      }

      return {
        ...templateData,
        rates: templateData.rates ? JSON.parse(templateData.rates) : {},
        isDefault: templateData.isDefault === '1'
      }
    } catch (error) {
      logger.error('❌ Failed to get template:', error)
      return null
    }
  }

  // 更新模板
  async updateTemplate(templateId, updates) {
    try {
      const client = redis.getClientSafe()
      const templateKey = `${this.TEMPLATE_PREFIX}${templateId}`

      // 检查模板是否存在
      const exists = await client.exists(templateKey)
      if (!exists) {
        return {
          success: false,
          error: '模板不存在'
        }
      }

      // 如果设置为默认模板，先取消其他默认模板
      if (updates.isDefault) {
        await this.clearDefaultTemplate()
      }

      const updateData = {
        ...updates,
        updatedAt: new Date().toISOString()
      }

      // 处理 rates 字段
      if (updateData.rates) {
        updateData.rates = JSON.stringify(updateData.rates)
      }

      // 处理 isDefault 字段
      if (typeof updateData.isDefault === 'boolean') {
        updateData.isDefault = updateData.isDefault ? '1' : '0'
      }

      // 移除不允许修改的字段
      delete updateData.id
      delete updateData.createdAt

      // 更新模板
      await client.hmset(templateKey, updateData)

      const updatedTemplate = await this.getTemplate(templateId)
      logger.success(`✅ Updated rate template: ${updatedTemplate.name}`)

      return {
        success: true,
        data: updatedTemplate
      }
    } catch (error) {
      logger.error('❌ Failed to update template:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // 删除模板
  async deleteTemplate(templateId) {
    try {
      const client = redis.getClientSafe()
      const template = await this.getTemplate(templateId)

      if (!template) {
        return {
          success: false,
          error: '模板不存在'
        }
      }

      if (template.isDefault) {
        return {
          success: false,
          error: '不能删除默认模板'
        }
      }

      // 删除模板
      await client.del(`${this.TEMPLATE_PREFIX}${templateId}`)
      await client.srem(this.TEMPLATES_KEY, templateId)

      logger.success(`✅ Deleted rate template: ${template.name}`)
      return {
        success: true,
        message: '模板删除成功'
      }
    } catch (error) {
      logger.error('❌ Failed to delete template:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // 设置默认模板
  async setDefaultTemplate(templateId) {
    try {
      const template = await this.getTemplate(templateId)
      if (!template) {
        return {
          success: false,
          error: '模板不存在'
        }
      }

      // 先取消其他默认模板
      await this.clearDefaultTemplate()

      // 设置新的默认模板
      await this.updateTemplate(templateId, { isDefault: true })

      logger.success(`✅ Set default template: ${template.name}`)
      return {
        success: true,
        message: '默认模板设置成功'
      }
    } catch (error) {
      logger.error('❌ Failed to set default template:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // 清除默认模板设置
  async clearDefaultTemplate() {
    try {
      const client = redis.getClientSafe()
      const templateIds = await client.smembers(this.TEMPLATES_KEY)

      for (const templateId of templateIds) {
        const templateData = await client.hgetall(`${this.TEMPLATE_PREFIX}${templateId}`)
        if (templateData.isDefault === '1') {
          await client.hset(`${this.TEMPLATE_PREFIX}${templateId}`, 'isDefault', '0')
        }
      }
    } catch (error) {
      logger.error('❌ Failed to clear default template:', error)
    }
  }

  // 获取默认模板
  async getDefaultTemplate() {
    try {
      const templates = await this.getTemplates()
      const defaultTemplate = templates.find((t) => t.isDefault)

      if (!defaultTemplate) {
        logger.warn('⚠️ No default rate template found')
        return null
      }

      const defaultTemplateId = defaultTemplate.id

      return await this.getTemplate(defaultTemplateId)
    } catch (error) {
      logger.error('❌ Failed to get default template:', error)
      return null
    }
  }

  // 批量设置某一列的倍率
  async batchSetColumnRate(templateId, column, rate) {
    try {
      const template = await this.getTemplate(templateId)
      if (!template) {
        return {
          success: false,
          error: '模板不存在'
        }
      }

      const rates = template.rates || {}

      // 根据列类型设置倍率
      if (column === 'all') {
        // 设置所有模型
        for (const model of this.defaultModels) {
          rates[model] = rate
        }
      } else if (this.defaultModels.includes(column)) {
        // 设置特定模型
        rates[column] = rate
      } else {
        return {
          success: false,
          error: '无效的列名'
        }
      }

      await this.updateTemplate(templateId, { rates })

      return {
        success: true,
        message: '批量设置倍率成功',
        data: await this.getTemplate(templateId)
      }
    } catch (error) {
      logger.error('❌ Failed to batch set column rate:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // 获取系统分组的倍率模板ID（从localStorage配置）
  async getSystemGroupRateTemplate(accountType) {
    try {
      // 在服务端，我们可以使用一个简单的配置存储
      const client = redis.getClientSafe()
      const systemGroupKey = `system_group_rate:${accountType}`
      const templateId = await client.get(systemGroupKey)
      return templateId || null
    } catch (error) {
      logger.warn(`⚠️ Failed to get system group rate template for ${accountType}:`, error)
      return null
    }
  }

  // 设置系统分组的倍率模板
  async setSystemGroupRateTemplate(accountType, templateId) {
    try {
      const client = redis.getClientSafe()
      const systemGroupKey = `system_group_rate:${accountType}`

      if (templateId) {
        await client.set(systemGroupKey, templateId)
        logger.info(`✅ Set system group rate template: ${accountType} -> ${templateId}`)
      } else {
        await client.del(systemGroupKey)
        logger.info(`✅ Cleared system group rate template: ${accountType}`)
      }

      return true
    } catch (error) {
      logger.error(`❌ Failed to set system group rate template for ${accountType}:`, error)
      throw error
    }
  }

  // 获取API Key或账户的倍率
  async getRatesForEntity(entityId, entityType = 'apikey', providedApiKeyData = null) {
    try {
      const client = redis.getClientSafe()
      let templateId = null
      const searchPath = []

      if (entityType === 'apikey') {
        // 优先使用传入的 apiKeyData，避免重复查询
        const apiKeyData = providedApiKeyData || (await client.hgetall(`apikey:${entityId}`))
        templateId = apiKeyData?.rateTemplateId
        searchPath.push(`API Key direct: ${templateId || 'null'}`)

        // 输出API Key的详细信息用于调试
        logger.info(
          `🔍 API Key ${entityId} data: claudeAccountId=${apiKeyData?.claudeAccountId || 'null'}, geminiAccountId=${apiKeyData?.geminiAccountId || 'null'}, groupId=${apiKeyData?.groupId || 'null'}`
        )

        // 如果API Key没有设置倍率模板，尝试从绑定的账户或分组获取（Claude OAuth / Claude Console / Gemini）
        if (!templateId) {
          // 检查API Key是否绑定到分组（通过 claudeAccountId 或 geminiAccountId 的 group: 前缀）
          let boundGroupId = null
          if (apiKeyData?.claudeAccountId?.startsWith('group:')) {
            boundGroupId = apiKeyData.claudeAccountId.replace('group:', '')
          } else if (apiKeyData?.claudeConsoleAccountId?.startsWith('group:')) {
            boundGroupId = apiKeyData.claudeConsoleAccountId.replace('group:', '')
          } else if (apiKeyData?.geminiAccountId?.startsWith('group:')) {
            boundGroupId = apiKeyData.geminiAccountId.replace('group:', '')
          } else if (apiKeyData?.groupId) {
            // 兼容直接 groupId 字段
            boundGroupId = apiKeyData.groupId
          }

          if (boundGroupId) {
            const groupData = await client.hgetall(`account_group:${boundGroupId}`)
            templateId = groupData?.rateTemplateId
            searchPath.push(`API Key group ${boundGroupId}: ${templateId || 'null'}`)
            logger.info(
              `🔍 API Key bound to group ${boundGroupId}: rateTemplateId=${templateId || 'null'}`
            )
          }

          // 检查Claude OAuth账户绑定（只有在不是分组绑定时）
          if (
            !templateId &&
            apiKeyData?.claudeAccountId &&
            !apiKeyData.claudeAccountId.startsWith('group:')
          ) {
            const accountData = await client.hgetall(`claude_account:${apiKeyData.claudeAccountId}`)
            templateId = accountData?.rateTemplateId
            searchPath.push(`Claude account ${apiKeyData.claudeAccountId}: ${templateId || 'null'}`)

            // 输出Claude账户的详细信息用于调试
            logger.info(
              `🔍 Claude account ${apiKeyData.claudeAccountId} data: accountType=${accountData?.accountType || 'null'}, rateTemplateId=${accountData?.rateTemplateId || 'null'}`
            )

            // 如果账户也没有倍率模板，根据账户类型获取系统分组模板
            if (!templateId && accountData?.accountType) {
              if (accountData.accountType === 'group') {
                // 查找账户所属的分组
                const accountGroupService = require('./accountGroupService')
                const group = await accountGroupService.getAccountGroup(apiKeyData.claudeAccountId)
                if (group) {
                  templateId = group.rateTemplateId
                  searchPath.push(`Account group ${group.id}: ${templateId || 'null'}`)
                  logger.info(
                    `🔍 Found account group ${group.id}: rateTemplateId=${templateId || 'null'}`
                  )
                } else {
                  searchPath.push(`Account group: not found`)
                  logger.warn(
                    `🔍 No account group found for Claude account ${apiKeyData.claudeAccountId}`
                  )
                }
              } else if (['shared', 'dedicated'].includes(accountData.accountType)) {
                // 检查系统分组（共享账户池、专属账户池）的倍率模板
                templateId = await this.getSystemGroupRateTemplate(accountData.accountType)
                searchPath.push(`System group ${accountData.accountType}: ${templateId || 'null'}`)
                logger.info(
                  `🔍 System group ${accountData.accountType}: templateId=${templateId || 'null'}`
                )
              }
            }
          }

          // 检查 Claude Console 账户绑定（只有在不是分组绑定时）
          if (
            !templateId &&
            apiKeyData?.claudeConsoleAccountId &&
            !apiKeyData.claudeConsoleAccountId.startsWith('group:')
          ) {
            const accountData = await client.hgetall(
              `claude_console_account:${apiKeyData.claudeConsoleAccountId}`
            )
            templateId = accountData?.rateTemplateId
            searchPath.push(
              `Claude Console account ${apiKeyData.claudeConsoleAccountId}: ${templateId || 'null'}`
            )

            // 输出Console账户的详细信息用于调试
            logger.info(
              `🔍 Claude Console account ${apiKeyData.claudeConsoleAccountId} data: accountType=${accountData?.accountType || 'null'}, rateTemplateId=${accountData?.rateTemplateId || 'null'}`
            )

            // 如果账户也没有倍率模板，根据账户类型获取系统分组模板
            if (!templateId && accountData?.accountType) {
              if (accountData.accountType === 'group') {
                // 查找账户所属的分组
                const accountGroupService = require('./accountGroupService')
                const group = await accountGroupService.getAccountGroup(
                  apiKeyData.claudeConsoleAccountId
                )
                if (group) {
                  templateId = group.rateTemplateId
                  searchPath.push(`Account group ${group.id}: ${templateId || 'null'}`)
                  logger.info(
                    `🔍 Found account group ${group.id}: rateTemplateId=${templateId || 'null'}`
                  )
                } else {
                  searchPath.push(`Account group: not found`)
                  logger.warn(
                    `🔍 No account group found for Claude Console account ${apiKeyData.claudeConsoleAccountId}`
                  )
                }
              } else if (['shared', 'dedicated'].includes(accountData.accountType)) {
                // 检查系统分组（共享账户池、专属账户池）的倍率模板
                templateId = await this.getSystemGroupRateTemplate(accountData.accountType)
                searchPath.push(`System group ${accountData.accountType}: ${templateId || 'null'}`)
                logger.info(
                  `🔍 System group ${accountData.accountType}: templateId=${templateId || 'null'}`
                )
              }
            }
          }

          // 检查Gemini账户绑定（只有在不是分组绑定时）
          if (
            !templateId &&
            apiKeyData?.geminiAccountId &&
            !apiKeyData.geminiAccountId.startsWith('group:')
          ) {
            const accountData = await client.hgetall(`gemini_account:${apiKeyData.geminiAccountId}`)
            templateId = accountData?.rateTemplateId
            searchPath.push(`Gemini account ${apiKeyData.geminiAccountId}: ${templateId || 'null'}`)

            // 输出Gemini账户的详细信息用于调试
            logger.info(
              `🔍 Gemini account ${apiKeyData.geminiAccountId} data: accountType=${accountData?.accountType || 'null'}, rateTemplateId=${accountData?.rateTemplateId || 'null'}`
            )

            // 如果账户也没有倍率模板，根据账户类型获取系统分组模板
            if (!templateId && accountData?.accountType) {
              if (accountData.accountType === 'group') {
                // 查找账户所属的分组
                const accountGroupService = require('./accountGroupService')
                const group = await accountGroupService.getAccountGroup(apiKeyData.geminiAccountId)
                if (group) {
                  templateId = group.rateTemplateId
                  searchPath.push(`Account group ${group.id}: ${templateId || 'null'}`)
                  logger.info(
                    `🔍 Found account group ${group.id}: rateTemplateId=${templateId || 'null'}`
                  )
                } else {
                  searchPath.push(`Account group: not found`)
                  logger.warn(
                    `🔍 No account group found for Gemini account ${apiKeyData.geminiAccountId}`
                  )
                }
              } else if (['shared', 'dedicated'].includes(accountData.accountType)) {
                // 检查系统分组（共享账户池、专属账户池）的倍率模板
                templateId = await this.getSystemGroupRateTemplate(accountData.accountType)
                searchPath.push(`System group ${accountData.accountType}: ${templateId || 'null'}`)
                logger.info(
                  `🔍 System group ${accountData.accountType}: templateId=${templateId || 'null'}`
                )
              }
            }
          }

          // 检查API Key是否来自卡类型兑换（新增：卡类型倍率查找）
          if (!templateId && apiKeyData?.cardTypeId) {
            const cardTypeService = require('./cardTypeService')
            const cardType = await cardTypeService.getCardType(apiKeyData.cardTypeId)

            if (cardType) {
              // 如果卡类型有自定义倍率，直接使用
              if (cardType.customRates && Object.keys(cardType.customRates).length > 0) {
                logger.info(
                  `🔍 API Key ${entityId} using card type custom rates: ${JSON.stringify(cardType.customRates)}`
                )
                return cardType.customRates
              }

              // 否则使用卡类型关联的模版
              templateId = cardType.rateTemplateId
              searchPath.push(`Card type ${apiKeyData.cardTypeId}: ${templateId || 'null'}`)
              logger.info(
                `🔍 API Key bound to card type ${apiKeyData.cardTypeId}: rateTemplateId=${templateId || 'null'}`
              )
            } else {
              searchPath.push(`Card type ${apiKeyData.cardTypeId}: not found`)
            }
          }

          // 如果API Key没有绑定任何账户，默认使用共享账户池的倍率模板
          if (
            !templateId &&
            !apiKeyData?.claudeAccountId &&
            !apiKeyData?.claudeConsoleAccountId &&
            !apiKeyData?.geminiAccountId
          ) {
            // API Key未绑定账户，使用共享账户池的系统分组倍率模板
            templateId = await this.getSystemGroupRateTemplate('shared')
            searchPath.push(`System group shared (no binding): ${templateId || 'null'}`)
            logger.info(
              `🔍 API Key has no account binding, using shared pool rate template: ${templateId || 'null'}`
            )
          }
        }
      } else if (entityType === 'claude_account') {
        const accountData = await client.hgetall(`claude_account:${entityId}`)
        templateId = accountData?.rateTemplateId
        searchPath.push(`Claude account direct: ${templateId || 'null'}`)

        // 如果账户没有倍率模板，根据账户类型获取模板
        if (!templateId && accountData?.accountType) {
          if (accountData.accountType === 'group') {
            const accountGroupService = require('./accountGroupService')
            const group = await accountGroupService.getAccountGroup(entityId)
            if (group) {
              templateId = group.rateTemplateId
              searchPath.push(`Account group ${group.id}: ${templateId || 'null'}`)
            }
          } else if (['shared', 'dedicated'].includes(accountData.accountType)) {
            templateId = await this.getSystemGroupRateTemplate(accountData.accountType)
            searchPath.push(`System group ${accountData.accountType}: ${templateId || 'null'}`)
          }
        }
      } else if (entityType === 'gemini_account') {
        const accountData = await client.hgetall(`gemini_account:${entityId}`)
        templateId = accountData?.rateTemplateId
        searchPath.push(`Gemini account direct: ${templateId || 'null'}`)

        // 如果账户没有倍率模板，根据账户类型获取模板
        if (!templateId && accountData?.accountType) {
          if (accountData.accountType === 'group') {
            const accountGroupService = require('./accountGroupService')
            const group = await accountGroupService.getAccountGroup(entityId)
            if (group) {
              templateId = group.rateTemplateId
              searchPath.push(`Account group ${group.id}: ${templateId || 'null'}`)
            }
          } else if (['shared', 'dedicated'].includes(accountData.accountType)) {
            templateId = await this.getSystemGroupRateTemplate(accountData.accountType)
            searchPath.push(`System group ${accountData.accountType}: ${templateId || 'null'}`)
          }
        }
      } else if (entityType === 'claude_console_account') {
        // 支持 Claude Console 账户倍率查找（与官方/Gemini 账户一致的逻辑）
        const accountData = await client.hgetall(`claude_console_account:${entityId}`)
        templateId = accountData?.rateTemplateId
        searchPath.push(`Claude Console account ${entityId}: ${templateId || 'null'}`)

        // 如果账户没有倍率模板，根据账户类型获取模板
        if (!templateId && accountData?.accountType) {
          if (accountData.accountType === 'group') {
            const accountGroupService = require('./accountGroupService')
            const group = await accountGroupService.getAccountGroup(entityId)
            if (group) {
              templateId = group.rateTemplateId
              searchPath.push(`Account group ${group.id}: ${templateId || 'null'}`)
            } else {
              searchPath.push('Account group: not found')
            }
          } else if (['shared', 'dedicated'].includes(accountData.accountType)) {
            // 共享/专属池对应系统分组倍率
            templateId = await this.getSystemGroupRateTemplate(accountData.accountType)
            searchPath.push(`System group ${accountData.accountType}: ${templateId || 'null'}`)
          }
        }
      } else if (entityType === 'account_group') {
        const groupData = await client.hgetall(`account_group:${entityId}`)
        templateId = groupData?.rateTemplateId
        searchPath.push(`Account group direct: ${templateId || 'null'}`)
      } else if (entityType === 'system_group') {
        // 直接获取系统分组的倍率模板
        templateId = await this.getSystemGroupRateTemplate(entityId)
        searchPath.push(`System group direct: ${templateId || 'null'}`)
      } else if (entityType === 'card_type') {
        // 新增：卡类型倍率查找支持
        const cardTypeService = require('./cardTypeService')
        const cardType = await cardTypeService.getCardType(entityId)

        if (cardType) {
          // 优先使用卡类型的关联模版
          templateId = cardType.rateTemplateId
          searchPath.push(`Card type template: ${templateId || 'null'}`)

          // 如果卡类型有自定义倍率，直接返回自定义倍率
          if (cardType.customRates && Object.keys(cardType.customRates).length > 0) {
            logger.info(
              `🔍 Card type ${entityId} using custom rates: ${JSON.stringify(cardType.customRates)}`
            )
            return cardType.customRates
          }
        } else {
          searchPath.push(`Card type not found`)
        }
      }

      logger.info(
        `🔍 Rate template search for ${entityType}:${entityId} - Path: ${searchPath.join(' -> ')}`
      )

      // 如果没有指定模板，使用默认模板
      if (!templateId) {
        const defaultTemplate = await this.getDefaultTemplate()
        if (defaultTemplate) {
          logger.info(`🔍 Using default template: ${defaultTemplate.id}`)
          return defaultTemplate.rates || {}
        }
        logger.info('🔍 No default template configured; returning empty rates')
        return {}
      }

      const template = await this.getTemplate(templateId)
      logger.info(
        `🔍 Found template ${templateId}: ${template ? 'exists' : 'missing'}, rates=${JSON.stringify(template?.rates || {})}`
      )
      return template?.rates || {}
    } catch (error) {
      logger.error('❌ Failed to get rates for entity:', error)
      return {}
    }
  }

  // 应用倍率到费用计算（兼容数字与对象四项倍率）
  applyRatesToCost(originalCost, modelName, rates) {
    if (!rates || !rates[modelName]) {
      return originalCost
    }

    const modelRate = rates[modelName]

    // 情况1：传入是单个数字成本
    if (typeof originalCost === 'number') {
      const multiplier = typeof modelRate === 'number' ? parseFloat(modelRate) || 1.0 : 1.0
      const newCost = originalCost * multiplier
      logger.debug(
        `💰 Applied rate multiplier: ${originalCost} * ${multiplier} = ${newCost} for model ${modelName}`
      )
      return newCost
    }

    // 情况2：传入是包含 costs 的对象（{ costs: { input, output, cacheWrite, cacheRead, total }, ... }）
    if (
      originalCost &&
      typeof originalCost === 'object' &&
      originalCost.costs &&
      typeof originalCost.costs === 'object'
    ) {
      const multipliers = {
        input: 1.0,
        output: 1.0,
        cacheWrite: 1.0,
        cacheRead: 1.0
      }

      if (typeof modelRate === 'number') {
        const m = parseFloat(modelRate) || 1.0
        multipliers.input = multipliers.output = multipliers.cacheWrite = multipliers.cacheRead = m
      } else if (typeof modelRate === 'object' && modelRate !== null) {
        multipliers.input = parseFloat(modelRate.input) || 1.0
        multipliers.output = parseFloat(modelRate.output) || 1.0
        multipliers.cacheWrite =
          parseFloat(
            modelRate.cacheWrite !== undefined ? modelRate.cacheWrite : modelRate.cacheCreate
          ) || 1.0
        multipliers.cacheRead = parseFloat(modelRate.cacheRead) || 1.0
      }

      const multipliedCosts = {
        input: (originalCost.costs.input || 0) * multipliers.input,
        output: (originalCost.costs.output || 0) * multipliers.output,
        cacheWrite: (originalCost.costs.cacheWrite || 0) * multipliers.cacheWrite,
        cacheRead: (originalCost.costs.cacheRead || 0) * multipliers.cacheRead
      }
      const multipliedTotal =
        multipliedCosts.input +
        multipliedCosts.output +
        multipliedCosts.cacheWrite +
        multipliedCosts.cacheRead

      const result = {
        ...originalCost,
        costs: { ...multipliedCosts, total: multipliedTotal },
        appliedMultipliers: multipliers
      }

      logger.debug(
        `💰 Applied rate multipliers for model ${modelName}: [input:${multipliers.input}x, output:${multipliers.output}x, cacheCreate/cacheWrite:${multipliers.cacheWrite}x, cacheRead:${multipliers.cacheRead}x] ${originalCost.costs.total?.toFixed ? originalCost.costs.total.toFixed(6) : originalCost.costs.total} -> ${result.costs.total.toFixed(6)}`
      )
      return result
    }

    // 兜底：无法识别的结构，原样返回
    return originalCost
  }

  // 获取所有相关实体的概览统计
  async getUsageStats() {
    try {
      const client = redis.getClientSafe()

      // 统计模板数量
      const templateCount = await client.scard(this.TEMPLATES_KEY)

      // 统计使用模板的API Keys数量
      const apiKeys = await client.keys('api_key:*')
      let apiKeysWithTemplates = 0

      for (const keyPath of apiKeys) {
        const data = await client.hgetall(keyPath)
        if (data.rateTemplateId) {
          apiKeysWithTemplates++
        }
      }

      // 统计使用模板的账户分组数量
      const accountGroups = await client.keys('account_group:*')
      let groupsWithTemplates = 0

      for (const groupPath of accountGroups) {
        const data = await client.hgetall(groupPath)
        if (data.rateTemplateId) {
          groupsWithTemplates++
        }
      }

      return {
        templateCount,
        apiKeysWithTemplates,
        groupsWithTemplates,
        totalApiKeys: apiKeys.length,
        totalGroups: accountGroups.length
      }
    } catch (error) {
      logger.error('❌ Failed to get usage stats:', error)
      return {
        templateCount: 0,
        apiKeysWithTemplates: 0,
        groupsWithTemplates: 0,
        totalApiKeys: 0,
        totalGroups: 0
      }
    }
  }

  // ==================== 卡类型倍率支持方法 ====================

  /**
   * 获取卡类型的有效倍率（自定义倍率优先，然后是关联模版）
   * @param {string} cardTypeId - 卡类型ID
   * @returns {Promise<Object>} 倍率配置
   */
  async getCardTypeRates(cardTypeId) {
    try {
      return await this.getRatesForEntity(cardTypeId, 'card_type')
    } catch (error) {
      logger.error(`❌ Failed to get card type rates for ${cardTypeId}:`, error)
      return {}
    }
  }

  /**
   * 为卡类型推荐适合的计费模版
   * @param {Object} cardType - 卡类型数据
   * @returns {Promise<Array>} 推荐的模版列表
   */
  async recommendTemplatesForCardType(cardType) {
    try {
      const templates = await this.getTemplates()
      const recommendations = []

      // 基于卡类型分类推荐模版
      const categoryKeywords = {
        daily: ['daily', 'day', '日', '天'],
        monthly: ['monthly', 'month', '月'],
        unlimited: ['unlimited', 'premium', '不限', '无限']
      }

      const keywords = categoryKeywords[cardType.category] || []

      for (const template of templates) {
        let score = 0

        // 名称匹配
        const templateName = template.name.toLowerCase()
        for (const keyword of keywords) {
          if (templateName.includes(keyword.toLowerCase())) {
            score += 10
          }
        }

        // 描述匹配
        if (template.description) {
          const templateDesc = template.description.toLowerCase()
          for (const keyword of keywords) {
            if (templateDesc.includes(keyword.toLowerCase())) {
              score += 5
            }
          }
        }

        // 如果是默认模版，额外加分
        if (template.isDefault) {
          score += 3
        }

        if (score > 0) {
          recommendations.push({
            template,
            score,
            reason: `匹配${cardType.category}类型，评分: ${score}`
          })
        }
      }

      // 按评分排序
      recommendations.sort((a, b) => b.score - a.score)

      // 如果没有匹配的推荐，返回默认模版
      if (recommendations.length === 0) {
        const defaultTemplate = await this.getDefaultTemplate()
        if (defaultTemplate) {
          recommendations.push({
            template: defaultTemplate,
            score: 1,
            reason: '默认模版'
          })
        }
      }

      return recommendations
    } catch (error) {
      logger.error('❌ Failed to recommend templates for card type:', error)
      return []
    }
  }

  /**
   * 批量更新使用指定模版的卡类型
   * @param {string} templateId - 模版ID
   * @param {Object} updates - 更新数据
   * @returns {Promise<Object>} 更新结果
   */
  async updateCardTypesUsingTemplate(templateId, updates) {
    try {
      const cardTypeService = require('./cardTypeService')
      const client = redis.getClientSafe()

      // 查找使用该模版的卡类型
      const cardTypeIds = await client.smembers(`card_types:template:${templateId}`)
      const results = { updated: [], failed: [] }

      for (const cardTypeId of cardTypeIds) {
        try {
          const result = await cardTypeService.updateCardType(cardTypeId, updates)
          if (result.success) {
            results.updated.push(cardTypeId)
          } else {
            results.failed.push({ cardTypeId, error: result.error })
          }
        } catch (error) {
          results.failed.push({ cardTypeId, error: error.message })
        }
      }

      logger.info(
        `✅ Batch updated card types using template ${templateId}: ${results.updated.length} updated, ${results.failed.length} failed`
      )

      return {
        success: true,
        results
      }
    } catch (error) {
      logger.error(`❌ Failed to batch update card types using template ${templateId}:`, error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 获取模版使用统计（包括卡类型）
   * @param {string} templateId - 模版ID
   * @returns {Promise<Object>} 使用统计
   */
  async getTemplateUsageStats(templateId) {
    try {
      const client = redis.getClientSafe()

      // 统计各种实体的使用情况
      const stats = {
        templateId,
        cardTypes: 0,
        apiKeys: 0,
        accountGroups: 0,
        claudeAccounts: 0,
        geminiAccounts: 0
      }

      // 统计卡类型使用
      const cardTypeIds = await client.smembers(`card_types:template:${templateId}`)
      stats.cardTypes = cardTypeIds.length

      // 统计API Key使用
      const apiKeys = await client.keys('api_key:*')
      for (const keyPath of apiKeys) {
        const data = await client.hgetall(keyPath)
        if (data.rateTemplateId === templateId) {
          stats.apiKeys++
        }
      }

      // 统计账户分组使用
      const accountGroups = await client.keys('account_group:*')
      for (const groupPath of accountGroups) {
        const data = await client.hgetall(groupPath)
        if (data.rateTemplateId === templateId) {
          stats.accountGroups++
        }
      }

      // 统计Claude账户使用
      const claudeAccounts = await client.keys('claude_account:*')
      for (const accountPath of claudeAccounts) {
        const data = await client.hgetall(accountPath)
        if (data.rateTemplateId === templateId) {
          stats.claudeAccounts++
        }
      }

      // 统计Gemini账户使用
      const geminiAccounts = await client.keys('gemini_account:*')
      for (const accountPath of geminiAccounts) {
        const data = await client.hgetall(accountPath)
        if (data.rateTemplateId === templateId) {
          stats.geminiAccounts++
        }
      }

      stats.total =
        stats.cardTypes +
        stats.apiKeys +
        stats.accountGroups +
        stats.claudeAccounts +
        stats.geminiAccounts

      return stats
    } catch (error) {
      logger.error(`❌ Failed to get template usage stats for ${templateId}:`, error)
      return {
        templateId,
        cardTypes: 0,
        apiKeys: 0,
        accountGroups: 0,
        claudeAccounts: 0,
        geminiAccounts: 0,
        total: 0
      }
    }
  }
}

module.exports = new RateTemplateService()
