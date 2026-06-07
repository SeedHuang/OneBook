/**
 * IPC Handler 综合测试
 *
 * TDD: 覆盖文档导入、设置管理、MKP状态、文件对话框、级联删除、错误路径
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipcMain, dialog } from 'electron'
import * as db from '../services/db.service'
import * as fileService from '../services/file.service'
import { registerIpcHandlers } from '../ipc/handlers'

// Mock fileService
vi.mock('../services/file.service', () => ({
  readFileContent: vi.fn(),
  readFromGit: vi.fn(),
  readFromUrl: vi.fn(),
  readMarkdown: vi.fn(),
  readExcel: vi.fn(),
  markdownToHtml: vi.fn(),
}))

const handlers = new Map<string, Function>()

vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler: Function) => {
  handlers.set(channel, handler)
})

describe('IPC Handler 综合测试', () => {
  beforeEach(() => {
    handlers.clear()
    vi.mocked(ipcMain.handle).mockClear()
    db.closeDatabase()
    db.initDatabase()
    registerIpcHandlers()
    vi.clearAllMocks()
    // 重新注册 handlers（clearAllMocks 会清除 mockImplementation）
    vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler: Function) => {
      handlers.set(channel, handler)
    })
    handlers.clear()
    registerIpcHandlers()
  })

  describe('文档导入 DOCUMENT_IMPORT', () => {
    beforeEach(() => {
      db.createProject('p1', '测试项目', '')
    })

    it('local 导入：读取本地文件并创建文档记录', async () => {
      vi.mocked(fileService.readFileContent).mockResolvedValue({
        content: '# 需求文档',
        type: 'md',
      })

      const handler = handlers.get('document:import')!
      const doc = await handler({} as any, {
        project_id: 'p1',
        source: 'local',
        file_path: '/path/to/doc.md',
      })

      expect(fileService.readFileContent).toHaveBeenCalledWith('/path/to/doc.md')
      expect(doc).toMatchObject({
        project_id: 'p1',
        name: 'doc.md',
        type: 'md',
        content: '# 需求文档',
        source: 'local',
        file_path: '/path/to/doc.md',
      })
      expect(doc.id).toBeTruthy()

      // 验证文档已入库
      const docs = db.listDocuments('p1')
      expect(docs).toHaveLength(1)
      expect(docs[0].name).toBe('doc.md')
    })

    it('git 导入：从 Git 仓库克隆并读取', async () => {
      vi.mocked(fileService.readFromGit).mockResolvedValue({
        content: '# Git 文档',
        type: 'md',
      })

      const handler = handlers.get('document:import')!
      const doc = await handler({} as any, {
        project_id: 'p1',
        source: 'git',
        git_repo: 'https://github.com/test/repo.git',
        git_branch: 'main',
        git_path: 'docs/req.md',
      })

      expect(fileService.readFromGit).toHaveBeenCalledWith(
        'https://github.com/test/repo.git', 'main', 'docs/req.md'
      )
      expect(doc.source).toBe('git')
      expect(doc.content).toBe('# Git 文档')
    })

    it('git 导入：默认分支为 main', async () => {
      vi.mocked(fileService.readFromGit).mockResolvedValue({
        content: '内容',
        type: 'md',
      })

      const handler = handlers.get('document:import')!
      await handler({} as any, {
        project_id: 'p1',
        source: 'git',
        git_repo: 'https://github.com/test/repo.git',
        // 不传 git_branch，应默认 main
      })

      expect(fileService.readFromGit).toHaveBeenCalledWith(
        'https://github.com/test/repo.git', 'main', ''
      )
    })

    it('url 导入：从 URL 抓取内容', async () => {
      vi.mocked(fileService.readFromUrl).mockResolvedValue({
        content: 'URL 内容',
        type: 'md',
      })

      const handler = handlers.get('document:import')!
      const doc = await handler({} as any, {
        project_id: 'p1',
        source: 'url',
        url: 'https://example.com/doc.md',
      })

      expect(fileService.readFromUrl).toHaveBeenCalledWith('https://example.com/doc.md')
      expect(doc.source).toBe('url')
      expect(doc.content).toBe('URL 内容')
    })

    it('无效参数抛出错误', async () => {
      const handler = handlers.get('document:import')!

      await expect(
        handler({} as any, {
          project_id: 'p1',
          source: 'local',
          // 缺少 file_path
        })
      ).rejects.toThrow('无效的导入参数')
    })

    it('source=local 但缺少 file_path 时抛出错误', async () => {
      const handler = handlers.get('document:import')!

      await expect(
        handler({} as any, { project_id: 'p1', source: 'local', file_path: '' })
      ).rejects.toThrow('无效的导入参数')
    })

    it('source=git 但缺少 git_repo 时抛出错误', async () => {
      const handler = handlers.get('document:import')!

      await expect(
        handler({} as any, { project_id: 'p1', source: 'git' })
      ).rejects.toThrow('无效的导入参数')
    })

    it('source=url 但缺少 url 时抛出错误', async () => {
      const handler = handlers.get('document:import')!

      await expect(
        handler({} as any, { project_id: 'p1', source: 'url' })
      ).rejects.toThrow('无效的导入参数')
    })
  })

  describe('设置管理', () => {
    it('settings:get 读取单个设置', () => {
      db.setSetting('ai_provider', 'deepseek')
      const handler = handlers.get('settings:get')!
      const value = handler({} as any, 'ai_provider')
      expect(value).toBe('deepseek')
    })

    it('settings:get 不存在的 key 返回 null', () => {
      const handler = handlers.get('settings:get')!
      const value = handler({} as any, 'nonexistent')
      expect(value).toBeNull()
    })

    it('settings:set 写入设置', () => {
      const handler = handlers.get('settings:set')!
      handler({} as any, 'ai_model', 'gpt-4o')
      expect(db.getSetting('ai_model')).toBe('gpt-4o')
    })

    it('settings:get-all 获取所有设置', () => {
      db.setSetting('k1', 'v1')
      db.setSetting('k2', 'v2')

      const handler = handlers.get('settings:get-all')!
      const all = handler({} as any)
      expect(all).toEqual({ k1: 'v1', k2: 'v2' })
    })
  })

  describe('MKP 状态', () => {
    it('mkp:status 返回 MKP 不可用状态', async () => {
      const handler = handlers.get('mkp:status')!
      const status = await handler({} as any)
      // mkp-sdk 在 setup 中 mock 为返回 success: false
      expect(status.available).toBe(false)
      expect(status.services).toEqual([])
    })

    it('mkp:list-services 返回空服务列表', async () => {
      const handler = handlers.get('mkp:list-services')!
      const services = await handler({} as any)
      expect(services).toEqual([])
    })
  })

  describe('文件对话框', () => {
    it('file:open-dialog 调用 showOpenDialog 并返回路径', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        filePaths: ['/path/to/doc.md'],
        canceled: false,
      } as any)

      const handler = handlers.get('file:open-dialog')!
      const paths = await handler({} as any)

      expect(dialog.showOpenDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: ['openFile', 'multiSelections'],
        })
      )
      expect(paths).toEqual(['/path/to/doc.md'])
    })

    it('file:open-dialog 用户取消时返回空数组', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        filePaths: [],
        canceled: true,
      } as any)

      const handler = handlers.get('file:open-dialog')!
      const paths = await handler({} as any)
      expect(paths).toEqual([])
    })

    it('file:read 读取文件内容', async () => {
      vi.mocked(fileService.readFileContent).mockResolvedValue({
        content: '# 文件内容',
        type: 'md',
      })

      const handler = handlers.get('file:read')!
      const result = await handler({} as any, '/path/doc.md')

      expect(fileService.readFileContent).toHaveBeenCalledWith('/path/doc.md')
      expect(result.content).toBe('# 文件内容')
      expect(result.type).toBe('md')
    })
  })

  describe('级联删除', () => {
    it('删除项目时级联删除关联的文档', () => {
      db.createProject('p1', '项目', '')
      db.createDocument({
        id: 'd1', project_id: 'p1', name: 'a.md', type: 'md',
        content: '', source: 'local', file_path: null,
      })
      db.createDocument({
        id: 'd2', project_id: 'p1', name: 'b.md', type: 'md',
        content: '', source: 'local', file_path: null,
      })

      expect(db.listDocuments('p1')).toHaveLength(2)

      // 通过 IPC handler 删除项目
      const handler = handlers.get('project:delete')!
      handler({} as any, 'p1')

      expect(db.listDocuments('p1')).toHaveLength(0)
    })

    it('删除项目时级联删除关联的对话和消息', () => {
      db.createProject('p1', '项目', '')
      db.createConversation('c1', 'p1', null, '对话1')
      db.createMessage('m1', 'c1', 'user', '你好')
      db.createMessage('m2', 'c1', 'assistant', '你好！')

      expect(db.listConversations('p1')).toHaveLength(1)
      expect(db.listMessages('c1')).toHaveLength(2)

      // 通过 IPC handler 删除项目
      const handler = handlers.get('project:delete')!
      handler({} as any, 'p1')

      expect(db.listConversations('p1')).toHaveLength(0)
    })

    it('删除对话时级联删除关联的消息', () => {
      db.createProject('p1', '项目', '')
      db.createConversation('c1', 'p1', null, '对话1')
      db.createMessage('m1', 'c1', 'user', '消息1')
      db.createMessage('m2', 'c1', 'assistant', '消息2')

      expect(db.listMessages('c1')).toHaveLength(2)

      // 通过 IPC handler 删除对话
      const handler = handlers.get('conversation:delete')!
      handler({} as any, 'c1')

      expect(db.listMessages('c1')).toHaveLength(0)
    })

    it('删除文档时级联删除关联的分析记录', () => {
      db.createProject('p1', '项目', '')
      db.createDocument({
        id: 'd1', project_id: 'p1', name: 'a.md', type: 'md',
        content: '', source: 'local', file_path: null,
      })
      db.createAnalysis('a1', 'd1', 'review', '{"issues": []}')

      expect(db.listAnalyses('d1')).toHaveLength(1)

      // 通过 IPC handler 删除文档
      const handler = handlers.get('document:delete')!
      handler({} as any, 'd1')

      expect(db.listAnalyses('d1')).toHaveLength(0)
    })
  })

  describe('错误路径', () => {
    it('所有必要的 IPC 通道均被注册', () => {
      const requiredChannels = [
        'project:list', 'project:create', 'project:update', 'project:delete',
        'document:list', 'document:import', 'document:delete', 'document:get',
        'conversation:list', 'conversation:create', 'conversation:update', 'conversation:delete',
        'message:list', 'message:send',
        'settings:get', 'settings:set', 'settings:get-all',
        'mkp:status', 'mkp:list-services',
        'file:open-dialog', 'file:read',
        'export:pdf', 'export:word', 'export:markdown',
      ]
      for (const ch of requiredChannels) {
        expect(handlers.has(ch), `缺少 IPC 通道: ${ch}`).toBe(true)
      }
    })

    it('创建项目后能通过 IPC 查询到', () => {
      const createHandler = handlers.get('project:create')!
      const project = createHandler({} as any, { name: '新项目', description: '测试' })

      expect(project.name).toBe('新项目')
      expect(project.id).toBeTruthy()

      const listHandler = handlers.get('project:list')!
      const list = listHandler({} as any)
      expect(list).toHaveLength(1)
      expect(list[0].name).toBe('新项目')
    })

    it('对话创建带 document_id 关联', () => {
      db.createProject('p1', '项目', '')
      db.createDocument({
        id: 'd1', project_id: 'p1', name: 'a.md', type: 'md',
        content: '', source: 'local', file_path: null,
      })

      const handler = handlers.get('conversation:create')!
      const conv = handler({} as any, 'p1', 'd1', '文档分析')

      expect(conv.document_id).toBe('d1')
      expect(conv.project_id).toBe('p1')
    })

    it('message:send 保存不同角色的消息', async () => {
      db.createProject('p1', '项目', '')
      db.createConversation('c1', 'p1', null, '对话')

      const handler = handlers.get('message:send')!

      await handler({} as any, { conversation_id: 'c1', content: '用户消息', role: 'user' })
      await handler({} as any, { conversation_id: 'c1', content: 'AI回复', role: 'assistant' })

      const msgs = db.listMessages('c1')
      expect(msgs).toHaveLength(2)
      expect(msgs[0].role).toBe('user')
      expect(msgs[1].role).toBe('assistant')
    })
  })
})
