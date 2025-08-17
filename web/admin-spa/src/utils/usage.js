/**
 * Usage Calculation Utilities
 *
 * Provides unified calculations for usage percentages, ensuring consistency
 * across all UI components (API Keys, Strategy Monitoring, etc.)
 */

/**
 * Calculate usage percentage with overflow protection
 * @param {number} current - Current usage value
 * @param {number} limit - Maximum limit value
 * @returns {number} Usage percentage (0-100)
 */
export function calculateUsagePercentage(current, limit) {
  if (!limit || limit <= 0) return 0
  return Math.min((current / limit) * 100, 100)
}

/**
 * Calculate token usage percentage
 * @param {number} currentTokens - Current token usage
 * @param {number} tokenLimit - Token limit
 * @returns {number} Token usage percentage (0-100)
 */
export function calculateTokenUsagePercentage(currentTokens, tokenLimit) {
  return calculateUsagePercentage(currentTokens, tokenLimit)
}

/**
 * Calculate cost usage percentage
 * @param {number} currentCost - Current cost
 * @param {number} costLimit - Cost limit
 * @returns {number} Cost usage percentage (0-100)
 */
export function calculateCostUsagePercentage(currentCost, costLimit) {
  return calculateUsagePercentage(currentCost, costLimit)
}

/**
 * Calculate request usage percentage
 * @param {number} currentRequests - Current request count
 * @param {number} requestLimit - Request limit
 * @returns {number} Request usage percentage (0-100)
 */
export function calculateRequestUsagePercentage(currentRequests, requestLimit) {
  return calculateUsagePercentage(currentRequests, requestLimit)
}

/**
 * Format cost value with appropriate precision
 * Follows the rule:
 * - >= 1: 2 decimal places
 * - >= 0.01: 4 decimal places
 * - < 0.01: 6 decimal places
 *
 * @param {number} cost - Cost value to format
 * @returns {string} Formatted cost string with $ prefix
 */
export function formatCost(cost) {
  if (typeof cost !== 'number' || cost === 0) {
    return '$0.000000'
  }

  // 根据数值大小选择精度
  if (cost >= 1) {
    return '$' + cost.toFixed(2)
  } else if (cost >= 0.01) {
    return '$' + cost.toFixed(4)
  } else {
    return '$' + cost.toFixed(6)
  }
}

/**
 * Format token count with K/M suffixes for large numbers
 * @param {number} count - Token count
 * @returns {string} Formatted token count
 */
export function formatTokenCount(count) {
  if (!count && count !== 0) return '0'

  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M'
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K'
  }
  return count.toString()
}

/**
 * Format number with locale-specific thousands separator
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 */
export function formatNumber(num) {
  if (!num && num !== 0) return '0'
  return num.toLocaleString('zh-CN')
}

/**
 * Get progress bar color class based on percentage
 * @param {number} percentage - Usage percentage
 * @returns {string} CSS class name for progress bar color
 */
export function getProgressColorClass(percentage) {
  if (percentage >= 90) return 'bg-red-500'
  if (percentage >= 70) return 'bg-yellow-500'
  return 'bg-green-500'
}

/**
 * Get status color class based on percentage (for text)
 * @param {number} percentage - Usage percentage
 * @returns {string} CSS class name for text color
 */
export function getStatusColorClass(percentage) {
  if (percentage >= 90) return 'text-red-600'
  if (percentage >= 70) return 'text-yellow-600'
  return 'text-green-600'
}
