import { describe, it, expect } from 'vitest'
import { getContextRingColor, formatContextTokens, getContextPercent } from '../components/contextRing'

describe('contextRing 工具函数', () => {
  describe('getContextRingColor', () => {
    it('百分比 ≤80% 返回绿色', () => {
      expect(getContextRingColor(0)).toBe('#52c41a')
      expect(getContextRingColor(50)).toBe('#52c41a')
      expect(getContextRingColor(80)).toBe('#52c41a')
    })

    it('百分比 81-95% 返回黄色', () => {
      expect(getContextRingColor(81)).toBe('#faad14')
      expect(getContextRingColor(95)).toBe('#faad14')
    })

    it('百分比 >95% 返回红色', () => {
      expect(getContextRingColor(96)).toBe('#f5222d')
      expect(getContextRingColor(100)).toBe('#f5222d')
    })
  })

  describe('formatContextTokens', () => {
    it('小于 1024 显示原始数字', () => {
      expect(formatContextTokens(0)).toBe('0')
      expect(formatContextTokens(500)).toBe('500')
      expect(formatContextTokens(1023)).toBe('1023')
    })

    it('大于等于 1024 显示 K', () => {
      expect(formatContextTokens(1024)).toBe('1K')
      expect(formatContextTokens(50000)).toBe('49K')
      expect(formatContextTokens(1048575)).toBe('1024K')
    })

    it('大于等于 1M 显示 M', () => {
      expect(formatContextTokens(1048576)).toBe('1.0M')
      expect(formatContextTokens(2097152)).toBe('2.0M')
    })
  })

  describe('getContextPercent', () => {
    it('计算正确百分比', () => {
      expect(getContextPercent(0, 1048576)).toBe(0)
      expect(getContextPercent(524288, 1048576)).toBe(50)
      expect(getContextPercent(1048576, 1048576)).toBe(100)
    })

    it('超出 context window 则钳制到 100', () => {
      expect(getContextPercent(2000000, 1048576)).toBe(100)
    })

    it('context window 为 0 时返回 0', () => {
      expect(getContextPercent(100, 0)).toBe(0)
    })
  })
})
