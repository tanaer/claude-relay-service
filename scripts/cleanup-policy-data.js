#!/usr/bin/env node

/**
 * Redis 策略数据清理工具
 * 用于清理策略绑定中的混乱数据和修复数据一致性问题
 */

const redis = require('../src/models/redis')
const logger = require('../src/utils/logger')

class PolicyDataCleanup {
  constructor() {
    this.client = redis.getClientSafe()
    this.ACTIVE_POLICIES_INDEX = 'active_policies:redemption'
    this.TYPE_INDEX_PREFIX = 'policy_type_index:'
    this.API_KEY_POLICY_PREFIX = 'api_key_policy:'
  }

  /**
   * 主清理流程
   */
  async run() {
    try {
      logger.info('[数据清理] 开始清理策略绑定数据...')

      // 1. 检查并清理活跃策略索引
      await this.cleanupActivePoliciesIndex()

      // 2. 清理类型索引
      await this.cleanupTypeIndexes()

      // 3. 清理无效的策略绑定
      await this.cleanupInvalidPolicyBindings()

      // 4. 重建索引
      await this.rebuildIndexes()

      // 5. 验证数据一致性
      await this.validateDataConsistency()

      logger.info('[数据清理] 策略数据清理完成！')
    } catch (error) {
      logger.error(`[数据清理] 清理过程失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 清理活跃策略索引
   */
  async cleanupActivePoliciesIndex() {
    try {
      logger.info('[数据清理] 检查活跃策略索引...')

      const activeApiKeys = await this.client.smembers(this.ACTIVE_POLICIES_INDEX)
      let removedCount = 0

      for (const apiKey of activeApiKeys) {
        // 检查对应的策略绑定是否存在
        const policyBinding = await this.client.hgetall(`${this.API_KEY_POLICY_PREFIX}${apiKey}`)

        if (!policyBinding || Object.keys(policyBinding).length === 0) {
          // 策略绑定不存在，从索引中移除
          await this.client.srem(this.ACTIVE_POLICIES_INDEX, apiKey)
          logger.warn(`[数据清理] 从活跃索引中移除无效的API Key: ${apiKey}`)
          removedCount++
        } else if (policyBinding.isActive !== 'true') {
          // 策略已禁用，从索引中移除
          await this.client.srem(this.ACTIVE_POLICIES_INDEX, apiKey)
          logger.warn(`[数据清理] 从活跃索引中移除已禁用的API Key: ${apiKey}`)
          removedCount++
        }
      }

      logger.info(`[数据清理] 活跃策略索引清理完成，移除了 ${removedCount} 个无效条目`)
    } catch (error) {
      logger.error(`[数据清理] 清理活跃策略索引失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 清理类型索引
   */
  async cleanupTypeIndexes() {
    try {
      logger.info('[数据清理] 检查策略类型索引...')

      const types = ['daily', 'monthly']
      let totalRemoved = 0

      for (const type of types) {
        const typeIndex = `${this.TYPE_INDEX_PREFIX}${type}`
        const apiKeys = await this.client.smembers(typeIndex)
        let removedCount = 0

        for (const apiKey of apiKeys) {
          // 检查策略绑定是否存在且类型匹配
          const policyBinding = await this.client.hgetall(`${this.API_KEY_POLICY_PREFIX}${apiKey}`)

          if (!policyBinding || Object.keys(policyBinding).length === 0) {
            // 策略绑定不存在
            await this.client.srem(typeIndex, apiKey)
            logger.warn(`[数据清理] 从 ${type} 索引中移除无效的API Key: ${apiKey}`)
            removedCount++
          } else {
            // 检查策略类型是否匹配
            let metadata = {}
            try {
              if (policyBinding.metadata) {
                metadata = JSON.parse(policyBinding.metadata)
              }
            } catch (e) {
              logger.warn(`[数据清理] API Key ${apiKey} 的metadata解析失败`)
            }

            if (metadata.codeType !== type) {
              await this.client.srem(typeIndex, apiKey)
              logger.warn(
                `[数据清理] 从 ${type} 索引中移除类型不匹配的API Key: ${apiKey} (实际类型: ${metadata.codeType})`
              )
              removedCount++
            }
          }
        }

        logger.info(`[数据清理] ${type} 类型索引清理完成，移除了 ${removedCount} 个无效条目`)
        totalRemoved += removedCount
      }

      logger.info(`[数据清理] 策略类型索引清理完成，总共移除了 ${totalRemoved} 个无效条目`)
    } catch (error) {
      logger.error(`[数据清理] 清理类型索引失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 清理无效的策略绑定
   */
  async cleanupInvalidPolicyBindings() {
    try {
      logger.info('[数据清理] 检查策略绑定数据...')

      const policyKeys = await this.client.keys(`${this.API_KEY_POLICY_PREFIX}*`)
      let removedCount = 0

      for (const policyKey of policyKeys) {
        const apiKey = policyKey.replace(this.API_KEY_POLICY_PREFIX, '')
        const policyBinding = await this.client.hgetall(policyKey)

        // 检查API Key是否实际存在
        const apiKeyExists = await this.checkApiKeyExists(apiKey)

        if (!apiKeyExists) {
          // API Key不存在，删除策略绑定
          await this.client.del(policyKey)
          logger.warn(`[数据清理] 删除无效的策略绑定: ${apiKey}`)
          removedCount++
        } else if (!policyBinding.isActive || policyBinding.isActive !== 'true') {
          // 策略已禁用，但仍保留数据以供查询
          logger.debug(`[数据清理] 保留已禁用的策略绑定: ${apiKey}`)
        }
      }

      logger.info(`[数据清理] 策略绑定数据清理完成，移除了 ${removedCount} 个无效绑定`)
    } catch (error) {
      logger.error(`[数据清理] 清理策略绑定失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 检查API Key是否存在
   */
  async checkApiKeyExists(apiKey) {
    try {
      // 检查是否是UUID格式（错误的ID格式）
      if (apiKey.length === 36 && apiKey.includes('-')) {
        // 这是UUID，需要查找对应的实际API Key
        const allApiKeys = await redis.getAllApiKeys()
        const foundApiKey = allApiKeys.find((key) => key.id === apiKey)
        return !!foundApiKey
      }

      // 检查是否是cr_格式的API Key
      if (apiKey.startsWith('cr_')) {
        const keyData = await redis.findApiKeyByHash(apiKey)
        return !!keyData
      }

      // 其他格式，直接检查
      const keyData = await this.client.hgetall(`apikey:${apiKey}`)
      return keyData && Object.keys(keyData).length > 0
    } catch (error) {
      logger.error(`[数据清理] 检查API Key存在性失败: ${error.message}`)
      return false
    }
  }

  /**
   * 重建索引
   */
  async rebuildIndexes() {
    try {
      logger.info('[数据清理] 重建策略索引...')

      // 清空现有索引
      await this.client.del(this.ACTIVE_POLICIES_INDEX)
      await this.client.del(`${this.TYPE_INDEX_PREFIX}daily`)
      await this.client.del(`${this.TYPE_INDEX_PREFIX}monthly`)

      const policyKeys = await this.client.keys(`${this.API_KEY_POLICY_PREFIX}*`)
      let rebuildCount = 0

      for (const policyKey of policyKeys) {
        const apiKey = policyKey.replace(this.API_KEY_POLICY_PREFIX, '')
        const policyBinding = await this.client.hgetall(policyKey)

        if (policyBinding.isActive === 'true') {
          // 添加到活跃索引
          await this.client.sadd(this.ACTIVE_POLICIES_INDEX, apiKey)

          // 添加到类型索引
          let metadata = {}
          try {
            if (policyBinding.metadata) {
              metadata = JSON.parse(policyBinding.metadata)
            }
          } catch (e) {
            logger.warn(`[数据清理] API Key ${apiKey} 的metadata解析失败，跳过类型索引`)
            continue
          }

          if (metadata.codeType && ['daily', 'monthly'].includes(metadata.codeType)) {
            await this.client.sadd(`${this.TYPE_INDEX_PREFIX}${metadata.codeType}`, apiKey)
          }

          rebuildCount++
        }
      }

      logger.info(`[数据清理] 索引重建完成，重建了 ${rebuildCount} 个有效条目`)
    } catch (error) {
      logger.error(`[数据清理] 重建索引失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 验证数据一致性
   */
  async validateDataConsistency() {
    try {
      logger.info('[数据清理] 验证数据一致性...')

      const activePolicies = await this.client.smembers(this.ACTIVE_POLICIES_INDEX)
      const dailyPolicies = await this.client.smembers(`${this.TYPE_INDEX_PREFIX}daily`)
      const monthlyPolicies = await this.client.smembers(`${this.TYPE_INDEX_PREFIX}monthly`)

      let inconsistencies = 0

      // 验证活跃策略索引
      for (const apiKey of activePolicies) {
        const policyBinding = await this.client.hgetall(`${this.API_KEY_POLICY_PREFIX}${apiKey}`)
        if (!policyBinding || policyBinding.isActive !== 'true') {
          logger.warn(`[数据验证] 活跃索引中的API Key ${apiKey} 策略绑定不一致`)
          inconsistencies++
        }
      }

      // 验证类型索引
      for (const apiKey of [...dailyPolicies, ...monthlyPolicies]) {
        const policyBinding = await this.client.hgetall(`${this.API_KEY_POLICY_PREFIX}${apiKey}`)
        if (!policyBinding || policyBinding.isActive !== 'true') {
          logger.warn(`[数据验证] 类型索引中的API Key ${apiKey} 策略绑定不一致`)
          inconsistencies++
        }
      }

      const stats = {
        activePolicies: activePolicies.length,
        dailyPolicies: dailyPolicies.length,
        monthlyPolicies: monthlyPolicies.length,
        totalTypePolicies: dailyPolicies.length + monthlyPolicies.length,
        inconsistencies
      }

      logger.info('[数据验证] 数据一致性验证完成')
      logger.info(`[数据验证] 统计信息: ${JSON.stringify(stats, null, 2)}`)

      if (inconsistencies > 0) {
        logger.warn(`[数据验证] 发现 ${inconsistencies} 个数据不一致问题`)
      } else {
        logger.info('[数据验证] 数据一致性验证通过')
      }

      return stats
    } catch (error) {
      logger.error(`[数据清理] 验证数据一致性失败: ${error.message}`)
      throw error
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const cleanup = new PolicyDataCleanup()
  cleanup
    .run()
    .then(() => {
      logger.info('[数据清理] 脚本执行完成')
      process.exit(0)
    })
    .catch((error) => {
      logger.error(`[数据清理] 脚本执行失败: ${error.message}`)
      process.exit(1)
    })
}

module.exports = PolicyDataCleanup
