/**
 * AI 服务测试
 *
 * TDD: 测试 Token 获取策略、流式对话、分析消息构建
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as dbService from '../services/db.service'

// Mock db.service 中的 getSetting
vi.spyOn(dbService, 'getSetting').mockImplementation((key: string) => {
  if (key === 'deepseek_api_key') return 'test-deepseek-key'
  if (key === 'openai_api_key') return 'test-openai-key'
  if (key === 'ai_provider') return 'deepseek'
  if (key === 'ai_model') return 'deepseek-chat'
  return null
})

import { getAIToken, getCurrentModel, buildAnalysisMessages, checkMkpStatus } from '../services/ai.service'

describe('AI 服务', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAIToken', () => {
    it('MKP 不可用时回退到手动 Key', async () => {
      // mkp-sdk 已在 setup 中 mock 为返回 success: false
      const token = await getAIToken('deepseek')
      expect(token).toBe('test-deepseek-key')
    })

    it('MKP 和手动 Key 都不可用时抛出错误', async () => {
      vi.mocked(dbService.getSetting).mockReturnValueOnce(null)
      await expect(getAIToken('openai')).rejects.toThrow('未配置')
    })
  })

  describe('getCurrentModel', () => {
    it('从设置中读取模型配置', () => {
      const model = getCurrentModel()
      expect(model.provider).toBe('deepseek')
      expect(model.model).toBe('deepseek-chat')
    })

    it('设置不存在时返回默认模型', () => {
      vi.mocked(dbService.getSetting).mockReturnValue(null)
      const model = getCurrentModel()
      expect(model.provider).toBe('deepseek') // DEFAULT_MODEL
    })
  })

  describe('buildAnalysisMessages', () => {
    it('review 类型包含审查系统 Prompt', () => {
      const msgs = buildAnalysisMessages('review', '# 需求文档')
      expect(msgs).toHaveLength(2)
      expect(msgs[0].role).toBe('system')
      expect(msgs[0].content).toContain('需求分析师')
      expect(msgs[0].content).toContain('矛盾')
      expect(msgs[1].role).toBe('user')
      expect(msgs[1].content).toContain('# 需求文档')
    })

    it('extract 类型包含提取系统 Prompt', () => {
      const msgs = buildAnalysisMessages('extract', '需求内容')
      expect(msgs[0].content).toContain('提取')
      expect(msgs[0].content).toContain('功能点')
    })

    it('generate 类型包含生成系统 Prompt', () => {
      const msgs = buildAnalysisMessages('generate', '需求内容')
      expect(msgs[0].content).toContain('测试用例')
      expect(msgs[0].content).toContain('用户故事')
    })

    it('自定义用户消息覆盖默认', () => {
      const msgs = buildAnalysisMessages('review', '文档内容', '请重点检查安全性')
      expect(msgs[1].content).toBe('请重点检查安全性')
    })
  })

  describe('checkMkpStatus', () => {
    it('MKP 不可用时返回 available: false', async () => {
      const status = await checkMkpStatus()
      expect(status.available).toBe(false)
      expect(status.services).toEqual([])
    })
  })
})
