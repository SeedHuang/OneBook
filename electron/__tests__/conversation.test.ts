/**
 * 对话历史加载 + 标题更新测试
 *
 * TDD: 验证切换对话时加载历史消息，首条消息更新对话标题
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipcMain } from 'electron'
import * as db from '../services/db.service'
import { registerIpcHandlers } from '../ipc/handlers'

const handlers = new Map<string, Function>()

vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler: Function) => {
  handlers.set(channel, handler)
})

describe('对话历史与标题', () => {
  beforeEach(() => {
    handlers.clear()
    vi.mocked(ipcMain.handle).mockClear()
    db.closeDatabase()
    db.initDatabase()
    registerIpcHandlers()
  })

  describe('加载对话历史', () => {
    it('message:list 返回指定对话的所有消息', () => {
      db.createProject('p1', '项目', '')
      db.createConversation('c1', 'p1', null, '对话1')
      db.createMessage('m1', 'c1', 'user', '你好')
      db.createMessage('m2', 'c1', 'assistant', '你好！')

      const handler = handlers.get('message:list')!
      const msgs = handler({} as any, 'c1')
      expect(msgs).toHaveLength(2)
      expect(msgs[0].content).toBe('你好')
      expect(msgs[1].content).toBe('你好！')
    })

    it('空对话返回空数组', () => {
      db.createProject('p1', '项目', '')
      db.createConversation('c1', 'p1', null, '对话1')

      const handler = handlers.get('message:list')!
      const msgs = handler({} as any, 'c1')
      expect(msgs).toHaveLength(0)
    })
  })

  describe('对话标题更新', () => {
    it('conversation:create 标题使用首条消息内容', () => {
      db.createProject('p1', '项目', '')

      const handler = handlers.get('conversation:create')!
      const conv = handler({} as any, 'p1', null, '请分析这段需求文档')
      expect(conv.title).toBe('请分析这段需求文档')
    })

    it('应注册 conversation:update handler 用于更新标题', () => {
      const hasHandler = handlers.has('conversation:update')
      expect(hasHandler).toBe(true)
    })

    it('conversation:update 应修改对话标题', () => {
      db.createProject('p1', '项目', '')
      db.createConversation('c1', 'p1', null, '原标题')

      const handler = handlers.get('conversation:update')!
      handler({} as any, 'c1', '新标题')

      const convs = db.listConversations('p1')
      expect(convs[0].title).toBe('新标题')
    })
  })
})
