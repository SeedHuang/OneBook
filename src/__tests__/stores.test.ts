/**
 * Zustand Store 测试
 *
 * TDD: 测试 4 个前端 Store 的状态管理逻辑
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Project, Document, Conversation, Message, AIModel } from '../../shared/types'
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
  listModels: vi.fn().mockResolvedValue([]),
  createModel: vi.fn(),
  updateModel: vi.fn(),
  deleteModel: vi.fn(),
  setDefaultModel: vi.fn().mockResolvedValue(undefined),
  testModel: vi.fn().mockResolvedValue({ success: true }),
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
    title: '对话1', total_tokens: 0, created_at: '2026-01-01',
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

  it('removeMessages 移除指定消息', () => {
    useChatStore.setState({
      messages: [
        makeMsg({ id: 'm1', role: 'user', content: '提问' }),
        makeMsg({ id: 'm2', role: 'assistant', content: '回复' }),
        makeMsg({ id: 'm3', role: 'user', content: '第二个问题' }),
        makeMsg({ id: 'm4', role: 'assistant', content: '第二个回复' }),
      ],
    })
    useChatStore.getState().removeMessages(['m1', 'm2'])
    expect(useChatStore.getState().messages).toHaveLength(2)
    expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['m3', 'm4'])
  })

  it('removeMessages 不影响其他消息', () => {
    useChatStore.setState({
      messages: [
        makeMsg({ id: 'm1', role: 'user' }),
        makeMsg({ id: 'm2', role: 'assistant' }),
        makeMsg({ id: 'm3', role: 'user' }),
      ],
    })
    useChatStore.getState().removeMessages(['m2'])
    expect(useChatStore.getState().messages).toHaveLength(2)
    expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['m1', 'm3'])
  })

  it('removeMessages 空数组不影响消息列表', () => {
    useChatStore.setState({
      messages: [makeMsg({ id: 'm1' }), makeMsg({ id: 'm2' })],
    })
    useChatStore.getState().removeMessages([])
    expect(useChatStore.getState().messages).toHaveLength(2)
  })

  it('updateConversationTokens 更新指定对话的 total_tokens', () => {
    const conv = makeConv({ id: 'c1', total_tokens: 0 })
    useChatStore.setState({ conversations: [conv] })
    useChatStore.getState().updateConversationTokens('c1', 1500)
    expect(useChatStore.getState().conversations[0].total_tokens).toBe(1500)
  })

  it('updateConversationTokens 不影响其他对话', () => {
    useChatStore.setState({
      conversations: [makeConv({ id: 'c1', total_tokens: 100 }), makeConv({ id: 'c2', total_tokens: 200 })],
    })
    useChatStore.getState().updateConversationTokens('c1', 500)
    const convs = useChatStore.getState().conversations
    expect(convs.find(c => c.id === 'c1')?.total_tokens).toBe(500)
    expect(convs.find(c => c.id === 'c2')?.total_tokens).toBe(200)
  })

  it('updateConversationTokens 同步更新 currentConversation', () => {
    const conv = makeConv({ id: 'c1', total_tokens: 0 })
    useChatStore.setState({ conversations: [conv], currentConversation: conv })
    useChatStore.getState().updateConversationTokens('c1', 3000)
    expect(useChatStore.getState().currentConversation?.total_tokens).toBe(3000)
  })
})

describe('SettingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      provider: 'deepseek', model: 'deepseek-v4',
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
    expect(useSettingsStore.getState().model).toBe('deepseek-v4')
  })

  it('loadSettings 空设置时使用默认值', async () => {
    mockElectronAPI.getAllSettings.mockResolvedValue({})
    mockElectronAPI.getMkpStatus.mockResolvedValue(null)

    await useSettingsStore.getState().loadSettings()

    expect(useSettingsStore.getState().provider).toBe('deepseek')
    expect(useSettingsStore.getState().model).toBe('deepseek-v4')
    expect(useSettingsStore.getState().mkpConnected).toBe(false)
  })

  it('loadModels 加载模型列表并设置 currentModel', async () => {
    const models: AIModel[] = [
      { id: 'm1', provider: 'deepseek', model_name: 'deepseek-v4', is_default: true, context_window: 1048576, created_at: '2026-01-01' },
      { id: 'm2', provider: 'deepseek', model_name: 'deepseek-v4-flash', is_default: false, context_window: 1048576, created_at: '2026-01-02' },
    ]
    mockElectronAPI.listModels.mockResolvedValue(models)

    await useSettingsStore.getState().loadModels()

    expect(useSettingsStore.getState().models).toHaveLength(2)
    expect(useSettingsStore.getState().currentModel?.id).toBe('m1')
  })

  it('setDefaultModel 切换默认模型并重新加载列表', async () => {
    const models: AIModel[] = [
      { id: 'm1', provider: 'deepseek', model_name: 'deepseek-v4', is_default: false, context_window: 1048576, created_at: '2026-01-01' },
      { id: 'm2', provider: 'deepseek', model_name: 'deepseek-v4-flash', is_default: true, context_window: 1048576, created_at: '2026-01-02' },
    ]
    mockElectronAPI.listModels.mockResolvedValue(models)

    await useSettingsStore.getState().setDefaultModel('m2')

    expect(mockElectronAPI.setDefaultModel).toHaveBeenCalledWith('m2')
    expect(useSettingsStore.getState().currentModel?.id).toBe('m2')
  })

  it('createModel 创建模型后重新加载列表', async () => {
    const newModel: AIModel = { id: 'm3', provider: 'deepseek', model_name: 'deepseek-v4-flash', is_default: false, context_window: 1048576, created_at: '2026-01-03' }
    mockElectronAPI.createModel.mockResolvedValue(newModel)
    mockElectronAPI.listModels.mockResolvedValue([newModel])

    const result = await useSettingsStore.getState().createModel({ provider: 'deepseek', model_name: 'deepseek-v4-flash' })

    expect(result.model_name).toBe('deepseek-v4-flash')
    expect(mockElectronAPI.createModel).toHaveBeenCalled()
  })

  it('deleteModel 删除模型后重新加载列表', async () => {
    mockElectronAPI.listModels.mockResolvedValue([])

    await useSettingsStore.getState().deleteModel('m1')

    expect(mockElectronAPI.deleteModel).toHaveBeenCalledWith('m1')
    expect(useSettingsStore.getState().models).toHaveLength(0)
  })

  it('testModel 返回连通性结果', async () => {
    mockElectronAPI.testModel.mockResolvedValue({ success: true })
    const result = await useSettingsStore.getState().testModel('m1')
    expect(result).toBe(true)
  })

  it('testModel 失败时返回 false', async () => {
    mockElectronAPI.testModel.mockRejectedValue(new Error('连接失败'))
    const result = await useSettingsStore.getState().testModel('m1')
    expect(result).toBe(false)
  })

  it('setTokenUsage 设置 token 使用统计', () => {
    useSettingsStore.getState().setTokenUsage({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 })
    expect(useSettingsStore.getState().tokenUsage?.total_tokens).toBe(150)
  })
})
