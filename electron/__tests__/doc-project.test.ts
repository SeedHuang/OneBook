/**
 * 文档删除 + 项目编辑 IPC 测试
 *
 * TDD: 验证 IPC handler 存在且功能正确
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipcMain } from 'electron'
import * as db from '../services/db.service'
import { registerIpcHandlers } from '../ipc/handlers'

const handlers = new Map<string, Function>()

vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler: Function) => {
  handlers.set(channel, handler)
})

describe('文档删除与项目编辑', () => {
  beforeEach(() => {
    handlers.clear()
    vi.mocked(ipcMain.handle).mockClear()
    db.closeDatabase()
    db.initDatabase()
    registerIpcHandlers()
  })

  describe('文档删除', () => {
    it('document:delete 应删除指定文档', () => {
      db.createProject('p1', '项目', '')
      db.createDocument({ id: 'd1', project_id: 'p1', name: 'a.md', type: 'md', content: '', source: 'local', file_path: null })
      db.createDocument({ id: 'd2', project_id: 'p1', name: 'b.md', type: 'md', content: '', source: 'local', file_path: null })

      const handler = handlers.get('document:delete')!
      handler({} as any, 'd1')

      expect(db.listDocuments('p1')).toHaveLength(1)
      expect(db.listDocuments('p1')[0].id).toBe('d2')
    })
  })

  describe('项目编辑', () => {
    it('project:update 应修改项目名称和描述', () => {
      db.createProject('p1', '原名', '原描述')

      const handler = handlers.get('project:update')!
      handler({} as any, 'p1', '新名', '新描述')

      const projects = db.listProjects()
      expect(projects[0].name).toBe('新名')
      expect(projects[0].description).toBe('新描述')
    })
  })
})
