/**
 * Zustand Store 测试
 *
 * TDD: 测试 4 个前端 Store 的状态管理逻辑
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Project, Document, Conversation, Message } from '../../shared/types'
import { useProjectStore } from '../../src/stores/projectStore'
import { useDocumentStore } from '../../src/stores/documentStore'
import { useChatStore } from '../../src/stores/chatStore'
import { useSettingsStore } from '../../src/stores/settingsStore'

// Mock window.electronAPI
const mockElectronAPI = {
  getAllSettings: vi.fn().mockResolvedValue({}),
  getMkpStatus: vi.fn().mockResolvedValue({ available: false, services: [] }),
  listProjects: vi.fn().mockResolvedValue([]),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  listDocuments: vi.fn().mockResolvedValue([]),
  deleteDocument: vi.fn(),
  listConversations: vi.fn().mockResolvedValue([]),
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
  listMessages: vi.fn().mockResolvedValue([]),
  sendMessage: vi.fn(),
}

// 设置 window.electronAPI
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis
}
(globalThis as any).window.electronAPI = mockElectronAPI

/** 创建测试用项目 */
function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1', name: '项目1', description: '描述',
    created_at: '2026-01-01', updated_at: '2026-01-01',
    ...overrides,
  }
}

/** 创建测试用文档 */
function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: 'd1', project_id: 'p1', name: 'doc.md', type: 'md',
    content: '', source: 'local', file_path: null,
    created_at: '2026-01-01',
    ...overrides,
  }
}

/** 创建测试用对话 */
function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1', project_id: 'p1', document_id: null,
    title: '对话1', created_at: '2026-01-01',
    ...overrides,
  }
}

/** 创建测试用消息 */
function makeMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1', conversation_id: 'c1', role: 'user',
    content: '你好', created_at: '2026-01-01',
    ...overrides,
  }
}

describe('ProjectStore', () => {
  beforeEach(() => {
    useProjectStore.setState({
      projects: [], currentProject: null, loading: false,
    })
  })

  it('setProjects 设置项目列表', () => {
    const projects = [makeProject(), makeProject({ id: 'p2', name: '项目2' })]
    useProjectStore.getState().setProjects(projects)
    expect(useProjectStore.getState().projects).toHaveLength(2)
  })

  it('addProject 追加项目', () => {
    useProjectStore.getState().addProject(makeProject())
    expect(useProjectStore.getState().projects).toHaveLength(1)
    expect(useProjectStore.getState().projects[0].id).toBe('p1')
  })

  it('removeProject 移除项目', () => {
    useProjectStore.setState({ projects: [makeProject(), makeProject({ id: 'p2' })] })
    useProjectStore.getState().removeProject('p1')
    expect(useProjectStore.getState().projects).toHaveLength(1)
    expect(useProjectStore.getState().projects[0].id).toBe('p2')
  })

  it('removeProject 同时清除 currentProject', () => {
    const p = makeProject()
    useProjectStore.setState({ projects: [p], currentProject: p })
    useProjectStore.getState().removeProject('p1')
    expect(useProjectStore.getState().currentProject).toBeNull()
  })

  it('removeProject 不影响其他项目的 currentProject', () => {
    const p2 = makeProject({ id: 'p2', name: '项目2' })
    useProjectStore.setState({ projects: [makeProject(), p2], currentProject: p2 })
    useProjectStore.getState().removeProject('p1')
    expect(useProjectStore.getState().currentProject?.id).toBe('p2')
  })

  it('updateProject 修改项目信息', () => {
    useProjectStore.setState({ projects: [makeProject()] })
    useProjectStore.getState().updateProject('p1', { name: '新名称' })
    expect(useProjectStore.getState().projects[0].name).toBe('新名称')
  })

  it('updateProject 同步更新 currentProject', () => {
    useProjectStore.setState({
      projects: [makeProject()],
      currentProject: makeProject(),
    })
    useProjectStore.getState().updateProject('p1', { name: '更新' })
    expect(useProjectStore.getState().currentProject?.name).toBe('更新')
  })

  it('setLoading 切换加载状态', () => {
    useProjectStore.getState().setLoading(true)
    expect(useProjectStore.getState().loading).toBe(true)
  })
})

describe('DocumentStore', () => {
  beforeEach(() => {
    useDocumentStore.setState({
      documents: [], currentDocument: null, openDocuments: [], loading: false,
    })
  })

  it('setDocuments 设置文档列表', () => {
    useDocumentStore.getState().setDocuments([makeDoc(), makeDoc({ id: 'd2' })])
    expect(useDocumentStore.getState().documents).toHaveLength(2)
  })

  it('addDocument 追加文档', () => {
    useDocumentStore.getState().addDocument(makeDoc())
    expect(useDocumentStore.getState().documents).toHaveLength(1)
  })

  it('removeDocument 移除文档并关闭标签页', () => {
    const doc = makeDoc()
    useDocumentStore.setState({
      documents: [doc],
      openDocuments: [doc],
      currentDocument: doc,
    })
    useDocumentStore.getState().removeDocument('d1')
    expect(useDocumentStore.getState().documents).toHaveLength(0)
    expect(useDocumentStore.getState().openDocuments).toHaveLength(0)
    expect(useDocumentStore.getState().currentDocument).toBeNull()
  })

  it('openDocument 打开文档标签页', () => {
    const doc = makeDoc()
    useDocumentStore.getState().openDocument(doc)
    expect(useDocumentStore.getState().openDocuments).toHaveLength(1)
    expect(useDocumentStore.getState().currentDocument?.id).toBe('d1')
  })

  it('openDocument 不重复打开已有标签页', () => {
    const doc = makeDoc()
    useDocumentStore.getState().openDocument(doc)
    useDocumentStore.getState().openDocument(doc) // 重复打开
    expect(useDocumentStore.getState().openDocuments).toHaveLength(1)
  })

  it('closeDocument 关闭标签页后切换到第一个', () => {
    const d1 = makeDoc({ id: 'd1' })
    const d2 = makeDoc({ id: 'd2' })
    useDocumentStore.setState({
      openDocuments: [d1, d2],
      currentDocument: d2,
    })
    useDocumentStore.getState().closeDocument('d2')
    expect(useDocumentStore.getState().openDocuments).toHaveLength(1)
    expect(useDocumentStore.getState().currentDocument?.id).toBe('d1')
  })

  it('closeDocument 关闭最后一个标签页时 currentDocument 为 null', () => {
    const doc = makeDoc()
    useDocumentStore.setState({
      openDocuments: [doc],
      currentDocument: doc,
    })
    useDocumentStore.getState().closeDocument('d1')
    expect(useDocumentStore.getState().currentDocument).toBeNull()
  })
})

describe('ChatStore', () => {
  beforeEach(() => {
    useChatStore.setState({
      conversations: [], currentConversation: null,
      messages: [], streaming: false, streamContent: '',
    })
  })

  it('setConversations 设置对话列表', () => {
    useChatStore.getState().setConversations([makeConv(), makeConv({ id: 'c2' })])
    expect(useChatStore.getState().conversations).toHaveLength(2)
  })

  it('addConversation 追加对话', () => {
    useChatStore.getState().addConversation(makeConv())
    expect(useChatStore.getState().conversations).toHaveLength(1)
  })

  it('addMessage 追加消息', () => {
    useChatStore.getState().addMessage(makeMsg())
    useChatStore.getState().addMessage(makeMsg({ id: 'm2', role: 'assistant', content: '回复' }))
    expect(useChatStore.getState().messages).toHaveLength(2)
  })

  it('removeConversation 移除对话并清空消息', () => {
    const conv = makeConv()
    useChatStore.setState({
      conversations: [conv],
      currentConversation: conv,
      messages: [makeMsg()],
    })
    useChatStore.getState().removeConversation('c1')
    expect(useChatStore.getState().conversations).toHaveLength(0)
    expect(useChatStore.getState().currentConversation).toBeNull()
    expect(useChatStore.getState().messages).toHaveLength(0)
  })

  it('removeConversation 不影响其他对话的消息', () => {
    const c2 = makeConv({ id: 'c2' })
    useChatStore.setState({
      conversations: [makeConv(), c2],
      currentConversation: c2,
      messages: [makeMsg({ conversation_id: 'c2' })],
    })
    useChatStore.getState().removeConversation('c1')
    expect(useChatStore.getState().messages).toHaveLength(1)
  })

  it('setStreaming 切换流式状态', () => {
    useChatStore.getState().setStreaming(true)
    expect(useChatStore.getState().streaming).toBe(true)
  })

  it('appendStreamContent 累加流式内容', () => {
    useChatStore.getState().setStreamContent('你好')
    useChatStore.getState().appendStreamContent('世界')
    expect(useChatStore.getState().streamContent).toBe('你好世界')
  })

  it('setStreamContent 重置流式内容', () => {
    useChatStore.getState().setStreamContent('旧内容')
    useChatStore.getState().setStreamContent('')
    expect(useChatStore.getState().streamContent).toBe('')
  })
})

describe('SettingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      provider: 'deepseek', model: 'deepseek-chat',
      tokenMode: 'mkp', manualKey: '',
      mkpConnected: false, siderCollapsed: false, chatCollapsed: false,
    })
    vi.clearAllMocks()
  })

  it('setProvider 切换 AI 提供商', () => {
    useSettingsStore.getState().setProvider('openai')
    expect(useSettingsStore.getState().provider).toBe('openai')
  })

  it('setModel 切换模型', () => {
    useSettingsStore.getState().setModel('gpt-4o')
    expect(useSettingsStore.getState().model).toBe('gpt-4o')
  })

  it('setTokenMode 切换 Token 获取方式', () => {
    useSettingsStore.getState().setTokenMode('manual')
    expect(useSettingsStore.getState().tokenMode).toBe('manual')
  })

  it('setManualKey 设置手动 Key', () => {
    useSettingsStore.getState().setManualKey('sk-xxx')
    expect(useSettingsStore.getState().manualKey).toBe('sk-xxx')
  })

  it('setSiderCollapsed 切换侧边栏折叠', () => {
    useSettingsStore.getState().setSiderCollapsed(true)
    expect(useSettingsStore.getState().siderCollapsed).toBe(true)
  })

  it('setChatCollapsed 切换聊天面板折叠', () => {
    useSettingsStore.getState().setChatCollapsed(true)
    expect(useSettingsStore.getState().chatCollapsed).toBe(true)
  })

  it('loadSettings 从 electronAPI 加载设置', async () => {
    mockElectronAPI.getAllSettings.mockResolvedValue({
      'ai.provider': 'openai',
      'ai.model': 'gpt-4o-mini',
      'token.mode': 'manual',
      'ai.manualKey': 'sk-test',
    })
    mockElectronAPI.getMkpStatus.mockResolvedValue({ available: true, services: ['deepseek'] })

    await useSettingsStore.getState().loadSettings()

    expect(useSettingsStore.getState().provider).toBe('openai')
    expect(useSettingsStore.getState().model).toBe('gpt-4o-mini')
    expect(useSettingsStore.getState().tokenMode).toBe('manual')
    expect(useSettingsStore.getState().manualKey).toBe('sk-test')
    expect(useSettingsStore.getState().mkpConnected).toBe(true)
  })

  it('loadSettings API 失败时使用默认值', async () => {
    mockElectronAPI.getAllSettings.mockRejectedValue(new Error('IPC 失败'))

    await useSettingsStore.getState().loadSettings()

    expect(useSettingsStore.getState().provider).toBe('deepseek')
    expect(useSettingsStore.getState().model).toBe('deepseek-chat')
  })

  it('loadSettings 空设置时使用默认值', async () => {
    mockElectronAPI.getAllSettings.mockResolvedValue({})
    mockElectronAPI.getMkpStatus.mockResolvedValue(null)

    await useSettingsStore.getState().loadSettings()

    expect(useSettingsStore.getState().provider).toBe('deepseek')
    expect(useSettingsStore.getState().model).toBe('deepseek-chat')
    expect(useSettingsStore.getState().mkpConnected).toBe(false)
  })
})
