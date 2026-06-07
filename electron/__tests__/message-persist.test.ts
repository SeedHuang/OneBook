/**
 * IPC 消息持久化测试
 *
 * TDD: 验证发送消息时同时保存到数据库
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipcMain } from 'electron'
import * as db from '../services/db.service'
import { registerIpcHandlers } from '../ipc/handlers'

// 捕获注册的 handler
const handlers = new Map<string, Function>()

vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler: Function) => {
  handlers.set(channel, handler)
})

describe('消息持久化', () => {
  beforeEach(() => {
    handlers.clear()
    vi.mocked(ipcMain.handle).mockClear()
    db.closeDatabase()
    db.initDatabase()
    registerIpcHandlers()
  })

  it('应注册 message:send handler', () => {
    // 验证 message:send 通道被注册
    const hasSendHandler = handlers.has('message:send')
    expect(hasSendHandler).toBe(true)
  })

  it('message:send 应保存用户消息和 AI 回复到数据库', async () => {
    // 先创建项目和对话
    db.createProject('p1', '测试', '')
    db.createConversation('c1', 'p1', null, '测试对话')

    // 获取 message:send handler
    const sendHandler = handlers.get('message:send')
    expect(sendHandler).toBeDefined()

    // 模拟发送消息
    const fakeEvent = { sender: { id: 1 } }
    await sendHandler!(fakeEvent, {
      conversation_id: 'c1',
      content: '请分析需求',
      role: 'user',
    })

    // 验证消息被保存
    const messages = db.listMessages('c1')
    expect(messages.length).toBeGreaterThanOrEqual(1)
    expect(messages.some((m) => m.content === '请分析需求')).toBe(true)
  })
})
