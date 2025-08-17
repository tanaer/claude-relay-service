/**
 * Unit tests for usage utility functions
 */

import { describe, it, expect } from 'vitest'
import {
  calculateUsagePercentage,
  calculateTokenUsagePercentage,
  calculateCostUsagePercentage,
  calculateRequestUsagePercentage,
  formatCost,
  formatTokenCount,
  getProgressColorClass,
  getStatusColorClass
} from '../src/utils/usage'

describe('Usage Utility Functions', () => {
  describe('calculateUsagePercentage', () => {
    it('should return 0 when limit is 0', () => {
      expect(calculateUsagePercentage(100, 0)).toBe(0)
    })

    it('should return 0 when limit is null', () => {
      expect(calculateUsagePercentage(100, null)).toBe(0)
    })

    it('should return correct percentage', () => {
      expect(calculateUsagePercentage(50, 100)).toBe(50)
      expect(calculateUsagePercentage(25, 100)).toBe(25)
      expect(calculateUsagePercentage(75, 100)).toBe(75)
    })

    it('should cap at 100% when usage exceeds limit', () => {
      expect(calculateUsagePercentage(150, 100)).toBe(100)
      expect(calculateUsagePercentage(200, 100)).toBe(100)
    })
  })

  describe('specific usage percentage functions', () => {
    it('calculateTokenUsagePercentage should work correctly', () => {
      expect(calculateTokenUsagePercentage(500, 1000)).toBe(50)
      expect(calculateTokenUsagePercentage(2000, 1000)).toBe(100)
    })

    it('calculateCostUsagePercentage should work correctly', () => {
      expect(calculateCostUsagePercentage(25, 100)).toBe(25)
      expect(calculateCostUsagePercentage(150, 100)).toBe(100)
    })

    it('calculateRequestUsagePercentage should work correctly', () => {
      expect(calculateRequestUsagePercentage(30, 60)).toBe(50)
      expect(calculateRequestUsagePercentage(100, 60)).toBe(100)
    })
  })

  describe('formatCost', () => {
    it('should format zero as $0.000000', () => {
      expect(formatCost(0)).toBe('$0.000000')
    })

    it('should format costs >= 1 with 2 decimal places', () => {
      expect(formatCost(1)).toBe('$1.00')
      expect(formatCost(10.5)).toBe('$10.50')
      expect(formatCost(999.999)).toBe('$1000.00')
    })

    it('should format costs >= 0.01 with 4 decimal places', () => {
      expect(formatCost(0.01)).toBe('$0.0100')
      expect(formatCost(0.5)).toBe('$0.5000')
      expect(formatCost(0.9999)).toBe('$0.9999')
    })

    it('should format costs < 0.01 with 6 decimal places', () => {
      expect(formatCost(0.001)).toBe('$0.001000')
      expect(formatCost(0.009999)).toBe('$0.009999')
      expect(formatCost(0.000001)).toBe('$0.000001')
    })
  })

  describe('formatTokenCount', () => {
    it('should format small numbers as-is', () => {
      expect(formatTokenCount(0)).toBe('0')
      expect(formatTokenCount(999)).toBe('999')
    })

    it('should format thousands with K suffix', () => {
      expect(formatTokenCount(1000)).toBe('1.0K')
      expect(formatTokenCount(1500)).toBe('1.5K')
      expect(formatTokenCount(999999)).toBe('1000.0K')
    })

    it('should format millions with M suffix', () => {
      expect(formatTokenCount(1000000)).toBe('1.0M')
      expect(formatTokenCount(1500000)).toBe('1.5M')
      expect(formatTokenCount(10000000)).toBe('10.0M')
    })
  })

  describe('getProgressColorClass', () => {
    it('should return green for low usage', () => {
      expect(getProgressColorClass(0)).toBe('bg-green-500')
      expect(getProgressColorClass(50)).toBe('bg-green-500')
      expect(getProgressColorClass(69)).toBe('bg-green-500')
    })

    it('should return yellow for medium usage', () => {
      expect(getProgressColorClass(70)).toBe('bg-yellow-500')
      expect(getProgressColorClass(80)).toBe('bg-yellow-500')
      expect(getProgressColorClass(89)).toBe('bg-yellow-500')
    })

    it('should return red for high usage', () => {
      expect(getProgressColorClass(90)).toBe('bg-red-500')
      expect(getProgressColorClass(100)).toBe('bg-red-500')
      expect(getProgressColorClass(150)).toBe('bg-red-500')
    })
  })

  describe('getStatusColorClass', () => {
    it('should return green text for low usage', () => {
      expect(getStatusColorClass(0)).toBe('text-green-600')
      expect(getStatusColorClass(50)).toBe('text-green-600')
      expect(getStatusColorClass(69)).toBe('text-green-600')
    })

    it('should return yellow text for medium usage', () => {
      expect(getStatusColorClass(70)).toBe('text-yellow-600')
      expect(getStatusColorClass(80)).toBe('text-yellow-600')
      expect(getStatusColorClass(89)).toBe('text-yellow-600')
    })

    it('should return red text for high usage', () => {
      expect(getStatusColorClass(90)).toBe('text-red-600')
      expect(getStatusColorClass(100)).toBe('text-red-600')
      expect(getStatusColorClass(150)).toBe('text-red-600')
    })
  })
})
