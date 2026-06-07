/**
 * AI 服务测试
 *
 * TDD: 测试 Token 获取策略、流式对话、分析消息构建
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as dbService from '../services/db.service'

// Mock db.service 中的 getSetting
vi.spyOn(dbService, 'getSetting').mockImplementation((key: string) => {
  if (key === 'token.mode') return 'mkp'
  if (key === 'ai.manualKey') return 'test-deepseek-key'
  if (key === 'ai.provider') return 'deepseek'
  if (key === 'ai.model') return 'deepseek-chat'
  return null
})

import { getAIToken, getCurrentModel, buildAnalysisMessages, checkMkpStatus, streamChat } from '../services/ai.service'

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
      vi.mocked(dbService.getSetting).mockImplementation((key: string) => {
        if (key === 'token.mode') return 'mkp'
        return null
      })
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

  describe('streamChat', () => {
    beforeEach(() => {
      // 重新设置 getSetting mock（被 clearAllMocks 重置了）
      vi.mocked(dbService.getSetting).mockImplementation((key: string) => {
        if (key === 'token.mode') return 'mkp'
        if (key === 'ai.manualKey') return 'test-deepseek-key'
        if (key === 'ai.provider') return 'deepseek'
        if (key === 'ai.model') return 'deepseek-chat'
        return null
      })
    })

    /**
     * 模拟 SSE 流式响应
     */
    function createMockSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder()
      let index = 0
      return new ReadableStream({
        pull(controller) {
          if (index < chunks.length) {
            controller.enqueue(encoder.encode(chunks[index]))
            index++
          } else {
            controller.close()
          }
        },
      })
    }

    it('正常流式输出多个 chunk 后收到 done', async () => {
      const stream = createMockSSEStream([
        'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"世界"}}]}\n\n',
        'data: [DONE]\n\n',
      ])

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: stream,
      })

      const results: any[] = []
      for await (const chunk of streamChat([{ role: 'user', content: '你好' }])) {
        results.push(chunk)
      }

      expect(results).toHaveLength(3)
      expect(results[0]).toEqual({ type: 'chunk', content: '你好' })
      expect(results[1]).toEqual({ type: 'chunk', content: '世界' })
      expect(results[2]).toEqual({ type: 'done' })
    })

    it('API 返回非 200 状态码时产出 error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      })

      const results: any[] = []
      for await (const chunk of streamChat([{ role: 'user', content: 'hi' }])) {
        results.push(chunk)
      }

      expect(results).toHaveLength(1)
      expect(results[0].type).toBe('error')
      expect(results[0].error).toContain('401')
    })

    it('响应流为空时产出 error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: null,
      })

      const results: any[] = []
      for await (const chunk of streamChat([{ role: 'user', content: 'hi' }])) {
        results.push(chunk)
      }

      expect(results).toHaveLength(1)
      expect(results[0].type).toBe('error')
      expect(results[0].error).toContain('无法读取响应流')
    })

    it('流中途断开时产出 done', async () => {
      const stream = createMockSSEStream([
        'data: {"choices":[{"delta":{"content":"部分内容"}}]}\n\n',
      ])

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: stream,
      })

      const results: any[] = []
      for await (const chunk of streamChat([{ role: 'user', content: 'hi' }])) {
        results.push(chunk)
      }

      // 流结束后应产出 done
      expect(results.some((r) => r.type === 'done')).toBe(true)
    })

    it('JSON 解析错误被忽略不中断流', async () => {
      const stream = createMockSSEStream([
        'data: {invalid json}\n\n',
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: [DONE]\n\n',
      ])

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: stream,
      })

      const results: any[] = []
      for await (const chunk of streamChat([{ role: 'user', content: 'hi' }])) {
        results.push(chunk)
      }

      // 无效 JSON 被忽略，只应产出有效 chunk 和 done
      expect(results).toHaveLength(2)
      expect(results[0]).toEqual({ type: 'chunk', content: 'ok' })
      expect(results[1]).toEqual({ type: 'done' })
    })

    it('使用自定义模型配置覆盖默认值', async () => {
      const stream = createMockSSEStream(['data: [DONE]\n\n'])
      global.fetch = vi.fn().mockResolvedValue({ ok: true, body: stream })

      const results: any[] = []
      for await (const chunk of streamChat(
        [{ role: 'user', content: 'hi' }],
        { provider: 'openai', model: 'gpt-4o' }
      )) {
        results.push(chunk)
      }

      // 验证 fetch 使用了 openai URL
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          body: expect.stringContaining('gpt-4o'),
        })
      )
    })

    it('多行数据在同一 buffer 中正确解析', async () => {
      // 所有 SSE 数据在一个 chunk 中
      const stream = createMockSSEStream([
        'data: {"choices":[{"delta":{"content":"A"}}]}\n\ndata: {"choices":[{"delta":{"content":"B"}}]}\n\ndata: [DONE]\n\n',
      ])

      global.fetch = vi.fn().mockResolvedValue({ ok: true, body: stream })

      const results: any[] = []
      for await (const chunk of streamChat([{ role: 'user', content: 'hi' }])) {
        results.push(chunk)
      }

      expect(results).toHaveLength(3)
      expect(results[0]).toEqual({ type: 'chunk', content: 'A' })
      expect(results[1]).toEqual({ type: 'chunk', content: 'B' })
      expect(results[2]).toEqual({ type: 'done' })
    })
  })
})
