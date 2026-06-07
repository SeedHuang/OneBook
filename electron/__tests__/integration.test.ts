/**
 * 集成测试 — 完整业务流程验证
 *
 * 模拟用户从头到尾的操作流程，验证各模块协同工作
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipcMain } from 'electron'
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

const fakeEvent = {} as any

describe('集成测试：完整业务流程', () => {
  beforeEach(() => {
    handlers.clear()
    vi.mocked(ipcMain.handle).mockClear()
    db.closeDatabase()
    db.initDatabase()
    // 重新注册 mock implementation
    vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler: Function) => {
      handlers.set(channel, handler)
    })
    registerIpcHandlers()
  })

  it('完整流程：创建项目 → 导入文档 → 创建对话 → 发送消息 → 导出', async () => {
    // 1. 创建项目
    const project = handlers.get('project:create')!(fakeEvent, {
      name: '客服工作台一期',
      description: 'AI驱动的需求文档分析',
    })
    expect(project.id).toBeTruthy()
    expect(project.name).toBe('客服工作台一期')

    // 验证项目列表
    const projects = handlers.get('project:list')!(fakeEvent)
    expect(projects).toHaveLength(1)

    // 2. 导入文档
    vi.mocked(fileService.readFileContent).mockResolvedValue({
      content: '# 客服工作台 PRD\n\n## 1. 项目背景\n客服工作台用于支撑客服角色的日常工作...\n## 2. 建设目标\n### 2.1 业务目标\n1. 统一工作入口\n2. 聚合关键数据',
      type: 'md',
    })

    const doc = await handlers.get('document:import')!(fakeEvent, {
      project_id: project.id,
      source: 'local',
      file_path: '/docs/客服工作台PRD.md',
    })
    expect(doc.id).toBeTruthy()
    expect(doc.name).toBe('客服工作台PRD.md')

    // 验证文档列表
    const docs = handlers.get('document:list')!(fakeEvent, project.id)
    expect(docs).toHaveLength(1)

    // 3. 获取文档详情
    const docDetail = handlers.get('document:get')!(fakeEvent, doc.id)
    expect(docDetail.content).toContain('客服工作台')

    // 4. 创建对话
    const conv = handlers.get('conversation:create')!(
      fakeEvent, project.id, doc.id, '需求审查分析'
    )
    expect(conv.id).toBeTruthy()
    expect(conv.document_id).toBe(doc.id)

    // 5. 发送用户消息
    await handlers.get('message:send')!(fakeEvent, {
      conversation_id: conv.id,
      content: '请审查这份需求文档，检查是否有遗漏和矛盾',
      role: 'user',
    })

    // 6. 模拟 AI 回复
    await handlers.get('message:send')!(fakeEvent, {
      conversation_id: conv.id,
      content: '## 需求审查报告\n\n### 1. 矛盾检测\n- 未发现明显矛盾\n\n### 2. 歧义标注\n- "统一工作入口"需要明确定义\n\n### 3. 完整性检查\n- 缺少非功能性需求（性能、安全）',
      role: 'assistant',
    })

    // 验证消息历史
    const messages = handlers.get('message:list')!(fakeEvent, conv.id)
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('user')
    expect(messages[1].role).toBe('assistant')
    expect(messages[1].content).toContain('需求审查报告')

    // 7. 更新对话标题（基于首条消息）
    handlers.get('conversation:update')!(fakeEvent, conv.id, '请审查这份需求文档')

    // 验证标题更新
    const convs = handlers.get('conversation:list')!(fakeEvent, project.id)
    expect(convs).toHaveLength(1)
    expect(convs[0].title).toBe('请审查这份需求文档')

    // 8. 创建分析记录
    db.createAnalysis(
      'a1', doc.id, 'review',
      JSON.stringify({ issues: ['缺少非功能性需求'], suggestions: ['补充性能指标'] })
    )
    const analyses = db.listAnalyses(doc.id)
    expect(analyses).toHaveLength(1)
  })

  it('多文档多对话工作流', async () => {
    // 1. 创建项目
    const project = handlers.get('project:create')!(fakeEvent, {
      name: '多文档分析',
    })

    // 2. 导入多个文档
    vi.mocked(fileService.readFileContent)
      .mockResolvedValueOnce({ content: '# PRD文档', type: 'md' })
      .mockResolvedValueOnce({ content: JSON.stringify({ Sheet1: [['功能', '描述']] }), type: 'xlsx' })

    const doc1 = await handlers.get('document:import')!(fakeEvent, {
      project_id: project.id, source: 'local', file_path: '/docs/PRD.md',
    })
    const doc2 = await handlers.get('document:import')!(fakeEvent, {
      project_id: project.id, source: 'local', file_path: '/docs/功能清单.xlsx',
    })

    expect(db.listDocuments(project.id)).toHaveLength(2)
    expect(doc1.type).toBe('md')
    expect(doc2.type).toBe('xlsx')

    // 3. 为不同文档创建独立对话
    const conv1 = handlers.get('conversation:create')!(fakeEvent, project.id, doc1.id, 'PRD审查')
    const conv2 = handlers.get('conversation:create')!(fakeEvent, project.id, doc2.id, '功能提取')

    expect(db.listConversations(project.id)).toHaveLength(2)
    expect(conv1.document_id).toBe(doc1.id)
    expect(conv2.document_id).toBe(doc2.id)

    // 4. 各自发消息
    await handlers.get('message:send')!(fakeEvent, {
      conversation_id: conv1.id, content: '审查PRD', role: 'user',
    })
    await handlers.get('message:send')!(fakeEvent, {
      conversation_id: conv2.id, content: '提取功能', role: 'user',
    })

    // 验证消息隔离
    expect(db.listMessages(conv1.id)).toHaveLength(1)
    expect(db.listMessages(conv2.id)).toHaveLength(1)
    expect(db.listMessages(conv1.id)[0].content).toBe('审查PRD')
    expect(db.listMessages(conv2.id)[0].content).toBe('提取功能')

    // 5. 删除一个文档及其对话
    handlers.get('document:delete')!(fakeEvent, doc1.id)
    expect(db.listDocuments(project.id)).toHaveLength(1)
  })

  it('设置管理与 AI 配置流程', async () => {
    // 1. 初始无设置
    const all = handlers.get('settings:get-all')!(fakeEvent)
    expect(all).toEqual({})

    // 2. 配置 AI 提供商
    handlers.get('settings:set')!(fakeEvent, 'ai_provider', 'deepseek')
    handlers.get('settings:set')!(fakeEvent, 'ai_model', 'deepseek-chat')
    handlers.get('settings:set')!(fakeEvent, 'deepseek_api_key', 'sk-test-key')

    // 3. 验证设置持久化
    expect(handlers.get('settings:get')!(fakeEvent, 'ai_provider')).toBe('deepseek')
    expect(handlers.get('settings:get')!(fakeEvent, 'ai_model')).toBe('deepseek-chat')

    // 4. 切换提供商
    handlers.get('settings:set')!(fakeEvent, 'ai_provider', 'openai')
    expect(handlers.get('settings:get')!(fakeEvent, 'ai_provider')).toBe('openai')

    // 5. 验证所有设置
    const updated = handlers.get('settings:get-all')!(fakeEvent)
    expect(Object.keys(updated)).toHaveLength(3)

    // 6. 检查 MKP 状态
    const mkpStatus = await handlers.get('mkp:status')!(fakeEvent)
    expect(mkpStatus).toHaveProperty('available')
  })

  it('完整删除流程：项目级联清理所有关联数据', async () => {
    // 构建完整数据链
    const project = handlers.get('project:create')!(fakeEvent, { name: '待删除项目' })

    vi.mocked(fileService.readFileContent).mockResolvedValue({
      content: '# 文档内容', type: 'md',
    })
    const doc = await handlers.get('document:import')!(fakeEvent, {
      project_id: project.id, source: 'local', file_path: '/test.md',
    })

    const conv = handlers.get('conversation:create')!(fakeEvent, project.id, doc.id, '对话')

    await handlers.get('message:send')!(fakeEvent, {
      conversation_id: conv.id, content: '消息1', role: 'user',
    })
    await handlers.get('message:send')!(fakeEvent, {
      conversation_id: conv.id, content: '消息2', role: 'assistant',
    })

    db.createAnalysis('a1', doc.id, 'review', '{}')

    // 验证数据存在
    expect(db.listProjects()).toHaveLength(1)
    expect(db.listDocuments(project.id)).toHaveLength(1)
    expect(db.listConversations(project.id)).toHaveLength(1)
    expect(db.listMessages(conv.id)).toHaveLength(2)
    expect(db.listAnalyses(doc.id)).toHaveLength(1)

    // 删除项目 → 级联清理所有数据
    handlers.get('project:delete')!(fakeEvent, project.id)

    // 验证全部清理
    expect(db.listProjects()).toHaveLength(0)
    expect(db.listDocuments(project.id)).toHaveLength(0)
    expect(db.listConversations(project.id)).toHaveLength(0)
    expect(db.listMessages(conv.id)).toHaveLength(0)
    expect(db.listAnalyses(doc.id)).toHaveLength(0)
  })

  it('多源文档导入：local + git + url 混合', async () => {
    const project = handlers.get('project:create')!(fakeEvent, { name: '多源导入' })

    // 本地文件
    vi.mocked(fileService.readFileContent).mockResolvedValue({
      content: '# 本地文档', type: 'md',
    })
    const localDoc = await handlers.get('document:import')!(fakeEvent, {
      project_id: project.id, source: 'local', file_path: '/local/doc.md',
    })

    // Git 仓库
    vi.mocked(fileService.readFromGit).mockResolvedValue({
      content: '# Git文档', type: 'md',
    })
    const gitDoc = await handlers.get('document:import')!(fakeEvent, {
      project_id: project.id, source: 'git',
      git_repo: 'https://github.com/test/repo.git',
      git_branch: 'develop', git_path: 'docs/req.md',
    })

    // URL
    vi.mocked(fileService.readFromUrl).mockResolvedValue({
      content: 'URL内容', type: 'md',
    })
    const urlDoc = await handlers.get('document:import')!(fakeEvent, {
      project_id: project.id, source: 'url',
      url: 'https://wiki.example.com/requirements',
    })

    // 验证三个文档都已创建
    const docs = db.listDocuments(project.id)
    expect(docs).toHaveLength(3)
    expect(localDoc.source).toBe('local')
    expect(gitDoc.source).toBe('git')
    expect(urlDoc.source).toBe('url')

    // 验证各自的调用参数
    expect(fileService.readFileContent).toHaveBeenCalledWith('/local/doc.md')
    expect(fileService.readFromGit).toHaveBeenCalledWith(
      'https://github.com/test/repo.git', 'develop', 'docs/req.md'
    )
    expect(fileService.readFromUrl).toHaveBeenCalledWith('https://wiki.example.com/requirements')
  })
})
