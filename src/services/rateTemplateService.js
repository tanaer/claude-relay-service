const { v4: uuidv4 } = require('uuid')
const redis = require('../models/redis')
const logger = require('../utils/logger')

class RateTemplateService {
  constructor() {
    this.defaultModels = [
      // Claude 系列
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-2.1',
      'claude-2.0',
      'claude-instant-1.2',
      // GPT 系列
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4-turbo-preview',
      'gpt-4',
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-16k',
      // Gemini 系列
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.0-pro',
      'gemini-2.0-flash-exp',
      // 其他模型
      'llama-3.1-405b',
      'llama-3.1-70b',
      'llama-3.1-8b',
      'mistral-large',
      'mistral-medium',
      'mistral-small'
    ]
  }

  // 创建新的倍率模板
  async createTemplate(data) {
    try {
      const { name, description = '', rates = {}, customModels = [], isDefault = false } = data

      const templateId = uuidv4()
      const now = new Date().toISOString()

      // 初始化所有模型的倍率（默认为1）
      const allModels = [...this.defaultModels, ...customModels]
      const fullRates = {}

      for (const model of allModels) {
        fullRates[model] = rates[model] || {
          input: 1,
          output: 1,
          cacheCreate: 1,
          cacheRead: 1
        }
      }

      const templateData = {
        id: templateId,
        name,
        description,
        rates: JSON.stringify(fullRates),
        customModels: JSON.stringify(customModels),
        isDefault: String(isDefault),
        createdAt: now,
        updatedAt: now
      }

      const client = redis.getClientSafe()

      // 如果设置为默认，先取消其他默认模板
      if (isDefault) {
        await this.clearDefaultTemplate()
      }

      // 保存模板
      await client.hset(`rate_template:${templateId}`, templateData)

      // 如果是默认模板，设置标记
      if (isDefault) {
        await client.set('default_rate_template', templateId)
      }

      logger.success(`✅ Created rate template: ${name} (${templateId})`)

      return {
        success: true,
        data: {
          ...templateData,
          rates: fullRates,
          customModels,
          isDefault
        }
      }
    } catch (error) {
      logger.error('❌ Failed to create rate template:', error)
      return { success: false, error: '创建倍率模板失败' }
    }
  }

  // 更新倍率模板
  async updateTemplate(templateId, updates) {
    try {
      const client = redis.getClientSafe()
      const existingData = await client.hgetall(`rate_template:${templateId}`)

      if (!existingData || Object.keys(existingData).length === 0) {
        return { success: false, error: '倍率模板不存在' }
      }

      const {
        name = existingData.name,
        description = existingData.description,
        rates,
        customModels,
        isDefault = existingData.isDefault === 'true'
      } = updates

      // 合并倍率数据
      const fullRates = JSON.parse(existingData.rates || '{}')
      if (rates) {
        // 如果有新的自定义模型，添加到倍率中
        if (customModels) {
          for (const model of customModels) {
            if (!fullRates[model]) {
              fullRates[model] = {
                input: 1,
                output: 1,
                cacheCreate: 1,
                cacheRead: 1
              }
            }
          }
        }
        // 更新倍率
        Object.assign(fullRates, rates)
      }

      const updatedData = {
        ...existingData,
        name,
        description,
        rates: JSON.stringify(fullRates),
        customModels: JSON.stringify(customModels || JSON.parse(existingData.customModels || '[]')),
        isDefault: String(isDefault),
        updatedAt: new Date().toISOString()
      }

      // 如果设置为默认，先取消其他默认模板
      if (isDefault && existingData.isDefault !== 'true') {
        await this.clearDefaultTemplate()
        await client.set('default_rate_template', templateId)
      }

      // 更新模板
      await client.hset(`rate_template:${templateId}`, updatedData)

      logger.success(`✅ Updated rate template: ${name} (${templateId})`)

      return {
        success: true,
        data: {
          ...updatedData,
          rates: fullRates,
          customModels: customModels || JSON.parse(existingData.customModels || '[]'),
          isDefault
        }
      }
    } catch (error) {
      logger.error('❌ Failed to update rate template:', error)
      return { success: false, error: '更新倍率模板失败' }
    }
  }

  // 批量设置某一列的倍率
  async batchSetColumnRate(templateId, column, rate) {
    try {
      const client = redis.getClientSafe()
      const existingData = await client.hgetall(`rate_template:${templateId}`)

      if (!existingData || Object.keys(existingData).length === 0) {
        return { success: false, error: '倍率模板不存在' }
      }

      const validColumns = ['input', 'output', 'cacheCreate', 'cacheRead']
      if (!validColumns.includes(column)) {
        return { success: false, error: '无效的列名' }
      }

      const rates = JSON.parse(existingData.rates || '{}')

      // 批量设置所有模型的指定列倍率
      for (const model in rates) {
        rates[model][column] = parseFloat(rate) || 1
      }

      existingData.rates = JSON.stringify(rates)
      existingData.updatedAt = new Date().toISOString()

      await client.hset(`rate_template:${templateId}`, existingData)

      logger.success(`✅ Batch set ${column} rate to ${rate} for template ${templateId}`)

      return {
        success: true,
        data: {
          ...existingData,
          rates,
          customModels: JSON.parse(existingData.customModels || '[]'),
          isDefault: existingData.isDefault === 'true'
        }
      }
    } catch (error) {
      logger.error('❌ Failed to batch set column rate:', error)
      return { success: false, error: '批量设置倍率失败' }
    }
  }

  // 获取所有倍率模板
  async getAllTemplates() {
    try {
      const client = redis.getClientSafe()
      const keys = await client.keys('rate_template:*')
      const templates = []
      const defaultTemplateId = await client.get('default_rate_template')

      for (const key of keys) {
        const data = await client.hgetall(key)
        if (data && Object.keys(data).length > 0) {
          templates.push({
            ...data,
            rates: JSON.parse(data.rates || '{}'),
            customModels: JSON.parse(data.customModels || '[]'),
            isDefault: data.id === defaultTemplateId || data.isDefault === 'true'
          })
        }
      }

      // 按创建时间倒序排列
      templates.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      return templates
    } catch (error) {
      logger.error('❌ Failed to get rate templates:', error)
      return []
    }
  }

  // 获取单个倍率模板
  async getTemplate(templateId) {
    try {
      const client = redis.getClientSafe()
      const data = await client.hgetall(`rate_template:${templateId}`)

      if (!data || Object.keys(data).length === 0) {
        return null
      }

      const defaultTemplateId = await client.get('default_rate_template')

      return {
        ...data,
        rates: JSON.parse(data.rates || '{}'),
        customModels: JSON.parse(data.customModels || '[]'),
        isDefault: data.id === defaultTemplateId || data.isDefault === 'true'
      }
    } catch (error) {
      logger.error('❌ Failed to get rate template:', error)
      return null
    }
  }

  // 删除倍率模板
  async deleteTemplate(templateId) {
    try {
      const client = redis.getClientSafe()
      const data = await client.hgetall(`rate_template:${templateId}`)

      if (!data || Object.keys(data).length === 0) {
        return { success: false, error: '倍率模板不存在' }
      }

      // 检查是否为默认模板
      const defaultTemplateId = await client.get('default_rate_template')
      if (templateId === defaultTemplateId) {
        return { success: false, error: '不能删除默认倍率模板' }
      }

      // 检查是否有分组或账户在使用此模板
      const inUse = await this.checkTemplateInUse(templateId)
      if (inUse) {
        return { success: false, error: '该倍率模板正在被使用，无法删除' }
      }

      await client.del(`rate_template:${templateId}`)

      logger.success(`✅ Deleted rate template: ${templateId}`)

      return { success: true }
    } catch (error) {
      logger.error('❌ Failed to delete rate template:', error)
      return { success: false, error: '删除倍率模板失败' }
    }
  }

  // 设置默认倍率模板
  async setDefaultTemplate(templateId) {
    try {
      const client = redis.getClientSafe()
      const data = await client.hgetall(`rate_template:${templateId}`)

      if (!data || Object.keys(data).length === 0) {
        return { success: false, error: '倍率模板不存在' }
      }

      // 清除其他默认模板标记
      await this.clearDefaultTemplate()

      // 设置新的默认模板
      await client.set('default_rate_template', templateId)
      data.isDefault = 'true'
      await client.hset(`rate_template:${templateId}`, data)

      logger.success(`✅ Set default rate template: ${templateId}`)

      return { success: true }
    } catch (error) {
      logger.error('❌ Failed to set default template:', error)
      return { success: false, error: '设置默认模板失败' }
    }
  }

  // 清除默认模板标记
  async clearDefaultTemplate() {
    try {
      const client = redis.getClientSafe()
      const currentDefault = await client.get('default_rate_template')

      if (currentDefault) {
        const data = await client.hgetall(`rate_template:${currentDefault}`)
        if (data) {
          data.isDefault = 'false'
          await client.hset(`rate_template:${currentDefault}`, data)
        }
      }

      await client.del('default_rate_template')
    } catch (error) {
      logger.error('❌ Failed to clear default template:', error)
    }
  }

  // 检查模板是否被使用
  async checkTemplateInUse(templateId) {
    try {
      const client = redis.getClientSafe()

      // 检查API Keys是否使用此模板
      const apiKeys = await client.keys('apikey:*')
      for (const key of apiKeys) {
        const data = await client.hgetall(key)
        if (data && data.rateTemplateId === templateId) {
          return true
        }
      }

      // 检查Claude账户是否使用此模板
      const claudeAccounts = await client.keys('claude_account:*')
      for (const key of claudeAccounts) {
        const data = await client.hgetall(key)
        if (data && data.rateTemplateId === templateId) {
          return true
        }
      }

      return false
    } catch (error) {
      logger.error('❌ Failed to check template usage:', error)
      return true // 安全起见，返回true
    }
  }

  // 获取默认倍率模板
  async getDefaultTemplate() {
    try {
      const client = redis.getClientSafe()
      const defaultTemplateId = await client.get('default_rate_template')

      if (!defaultTemplateId) {
        // 如果没有默认模板，创建一个
        const result = await this.createTemplate({
          name: '默认倍率模板',
          description: '系统默认倍率模板',
          rates: {},
          isDefault: true
        })
        return result.data
      }

      return await this.getTemplate(defaultTemplateId)
    } catch (error) {
      logger.error('❌ Failed to get default template:', error)
      return null
    }
  }

  // 获取API Key或账户的倍率
  async getRatesForEntity(entityId, entityType = 'apikey') {
    try {
      const client = redis.getClientSafe()
      let templateId = null

      if (entityType === 'apikey') {
        const apiKeyData = await client.hgetall(`apikey:${entityId}`)
        templateId = apiKeyData?.rateTemplateId
      } else if (entityType === 'claude_account') {
        const accountData = await client.hgetall(`claude_account:${entityId}`)
        templateId = accountData?.rateTemplateId
      }

      // 如果没有指定模板，使用默认模板
      if (!templateId) {
        const defaultTemplate = await this.getDefaultTemplate()
        return defaultTemplate?.rates || {}
      }

      const template = await this.getTemplate(templateId)
      return template?.rates || {}
    } catch (error) {
      logger.error('❌ Failed to get rates for entity:', error)
      return {}
    }
  }

  // 应用倍率到费用计算
  applyRatesToCost(originalCost, modelName, rates) {
    if (!rates || !rates[modelName]) {
      return originalCost
    }

    const modelRates = rates[modelName]

    return {
      inputCost: originalCost.inputCost * (modelRates.input || 1),
      outputCost: originalCost.outputCost * (modelRates.output || 1),
      cacheCreateCost: originalCost.cacheCreateCost * (modelRates.cacheCreate || 1),
      cacheReadCost: originalCost.cacheReadCost * (modelRates.cacheRead || 1),
      totalCost:
        originalCost.inputCost * (modelRates.input || 1) +
        originalCost.outputCost * (modelRates.output || 1) +
        originalCost.cacheCreateCost * (modelRates.cacheCreate || 1) +
        originalCost.cacheReadCost * (modelRates.cacheRead || 1),
      originalCost,
      appliedRates: modelRates
    }
  }
}

module.exports = new RateTemplateService()
