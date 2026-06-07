/**
 * 数据库服务测试
 *
 * TDD: 测试所有 CRUD 操作的正确性
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  initDatabase,
  closeDatabase,
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  listDocuments,
  createDocument,
  getDocument,
  deleteDocument,
  listConversations,
  createConversation,
  deleteConversation,
  listMessages,
  createMessage,
  deleteMessagePair,
  listAnalyses,
  createAnalysis,
  getSetting,
  setSetting,
  getAllSettings,
  listModels,
  createModel,
  updateModel,
  deleteModel,
  setDefaultModel,
  getDefaultModel,
  addConversationTokens,
} from '../services/db.service'

describe('数据库服务', () => {
  beforeEach(() => {
    closeDatabase()
    initDatabase()
  })

  describe('项目管理', () => {
    it('创建项目后应能查询到', () => {
      const project = createProject('p1', '测试项目', '描述')
      expect(project.id).toBe('p1')
      expect(project.name).toBe('测试项目')
      expect(project.description).toBe('描述')
      expect(project.created_at).toBeTruthy()

      const list = listProjects()
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe('p1')
    })

    it('更新项目应修改名称和描述', () => {
      createProject('p1', '原名', '原描述')
      updateProject('p1', '新名', '新描述')

      const list = listProjects()
      expect(list[0].name).toBe('新名')
      expect(list[0].description).toBe('新描述')
    })

    it('删除项目后应查询不到', () => {
      createProject('p1', '测试', '')
      createProject('p2', '另一个', '')
      expect(listProjects()).toHaveLength(2)

      deleteProject('p1')
      const list = listProjects()
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe('p2')
    })

    it('项目列表应按 updated_at 倒序', () => {
      createProject('p1', '第一', '')
      createProject('p2', '第二', '')
      updateProject('p1', '第一更新', '') // 让 p1 的 updated_at 更新

      const list = listProjects()
      expect(list[0].id).toBe('p1')
    })
  })

  describe('文档管理', () => {
    beforeEach(() => {
      createProject('p1', '项目', '')
    })

    it('创建文档后应能查询到', () => {
      const doc = createDocument({
        id: 'd1',
        project_id: 'p1',
        name: '需求.md',
        type: 'md',
        content: '# 需求文档',
        source: 'local',
        file_path: '/tmp/需求.md',
      })

      expect(doc.id).toBe('d1')
      expect(doc.created_at).toBeTruthy()

      const list = listDocuments('p1')
      expect(list).toHaveLength(1)
      expect(list[0].name).toBe('需求.md')
    })

    it('按项目 ID 过滤文档', () => {
      createProject('p2', '另一个项目', '')
      createDocument({ id: 'd1', project_id: 'p1', name: 'a.md', type: 'md', content: '', source: 'local', file_path: null })
      createDocument({ id: 'd2', project_id: 'p2', name: 'b.md', type: 'md', content: '', source: 'local', file_path: null })

      expect(listDocuments('p1')).toHaveLength(1)
      expect(listDocuments('p2')).toHaveLength(1)
    })

    it('获取单个文档', () => {
      createDocument({ id: 'd1', project_id: 'p1', name: 'test.md', type: 'md', content: 'hello', source: 'local', file_path: null })

      const doc = getDocument('d1')
      expect(doc).toBeDefined()
      expect(doc!.content).toBe('hello')
    })

    it('获取不存在的文档返回 undefined', () => {
      expect(getDocument('nonexistent')).toBeUndefined()
    })

    it('删除文档', () => {
      createDocument({ id: 'd1', project_id: 'p1', name: 'a.md', type: 'md', content: '', source: 'local', file_path: null })
      createDocument({ id: 'd2', project_id: 'p1', name: 'b.md', type: 'md', content: '', source: 'local', file_path: null })

      deleteDocument('d1')
      expect(listDocuments('p1')).toHaveLength(1)
      expect(listDocuments('p1')[0].id).toBe('d2')
    })
  })

  describe('对话管理', () => {
    beforeEach(() => {
      createProject('p1', '项目', '')
    })

    it('创建对话后应能查询到', () => {
      const conv = createConversation('c1', 'p1', null, '需求审查')
      expect(conv.id).toBe('c1')
      expect(conv.title).toBe('需求审查')

      const list = listConversations('p1')
      expect(list).toHaveLength(1)
    })

    it('创建带文档关联的对话', () => {
      createDocument({ id: 'd1', project_id: 'p1', name: 'doc.md', type: 'md', content: '', source: 'local', file_path: null })
      const conv = createConversation('c1', 'p1', 'd1', '文档分析')
      expect(conv.document_id).toBe('d1')
    })

    it('删除对话', () => {
      createConversation('c1', 'p1', null, '对话1')
      createConversation('c2', 'p1', null, '对话2')

      deleteConversation('c1')
      expect(listConversations('p1')).toHaveLength(1)
    })
  })

  describe('消息管理', () => {
    beforeEach(() => {
      createProject('p1', '项目', '')
      createConversation('c1', 'p1', null, '对话')
    })

    it('创建消息后应能按对话查询', () => {
      createMessage('m1', 'c1', 'user', '请分析这个需求')
      createMessage('m2', 'c1', 'assistant', '好的，我来分析...')

      const msgs = listMessages('c1')
      expect(msgs).toHaveLength(2)
      expect(msgs[0].role).toBe('user')
      expect(msgs[1].role).toBe('assistant')
    })

    it('消息按 created_at 正序排列', () => {
      createMessage('m1', 'c1', 'user', '第一条')
      createMessage('m2', 'c1', 'assistant', '第二条')
      createMessage('m3', 'c1', 'user', '第三条')

      const msgs = listMessages('c1')
      expect(msgs[0].content).toBe('第一条')
      expect(msgs[2].content).toBe('第三条')
    })

    it('deleteMessagePair 应同时删除用户消息和紧随其后的 AI 回复', () => {
      createMessage('m1', 'c1', 'user', '请分析')
      createMessage('m2', 'c1', 'assistant', '分析结果...')
      createMessage('m3', 'c1', 'user', '再分析')
      createMessage('m4', 'c1', 'assistant', '好的...')

      deleteMessagePair('m1')

      const msgs = listMessages('c1')
      expect(msgs).toHaveLength(2)
      expect(msgs.map((m) => m.id)).toEqual(['m3', 'm4'])
    })

    it('deleteMessagePair 无配对回复时只删除用户消息', () => {
      createMessage('m1', 'c1', 'user', '单独的用户消息')
      createMessage('m2', 'c1', 'user', '另一条')

      deleteMessagePair('m1')

      const msgs = listMessages('c1')
      expect(msgs).toHaveLength(1)
      expect(msgs[0].id).toBe('m2')
    })

    it('deleteMessagePair 不影响其他对话的消息', () => {
      createConversation('c2', 'p1', null, '对话2')
      createMessage('m1', 'c1', 'user', '消息1')
      createMessage('m2', 'c1', 'assistant', '回复1')
      createMessage('m3', 'c2', 'user', '其他对话消息')

      deleteMessagePair('m1')

      expect(listMessages('c2')).toHaveLength(1)
      expect(listMessages('c2')[0].content).toBe('其他对话消息')
    })
  })

  describe('分析记录', () => {
    beforeEach(() => {
      createProject('p1', '项目', '')
      createDocument({ id: 'd1', project_id: 'p1', name: 'doc.md', type: 'md', content: '', source: 'local', file_path: null })
    })

    it('创建分析记录后应能查询', () => {
      const result = JSON.stringify({ issues: ['歧义需求', '遗漏边界'] })
      const analysis = createAnalysis('a1', 'd1', 'review', result)

      expect(analysis.id).toBe('a1')
      expect(analysis.type).toBe('review')

      const list = listAnalyses('d1')
      expect(list).toHaveLength(1)
      expect(JSON.parse(list[0].result)).toHaveProperty('issues')
    })
  })

  describe('设置管理', () => {
    it('设置键值对应', () => {
      setSetting('ai_provider', 'deepseek')
      expect(getSetting('ai_provider')).toBe('deepseek')
    })

    it('不存在的 key 返回 null', () => {
      expect(getSetting('nonexistent')).toBeNull()
    })

    it('重复设置同一 key 应覆盖', () => {
      setSetting('ai_model', 'deepseek-chat')
      setSetting('ai_model', 'gpt-4o')
      expect(getSetting('ai_model')).toBe('gpt-4o')
    })

    it('获取所有设置', () => {
      setSetting('k1', 'v1')
      setSetting('k2', 'v2')
      const all = getAllSettings()
      expect(all).toEqual({ k1: 'v1', k2: 'v2' })
    })
  })

  describe('模型管理', () => {
    it('初始化时应预填默认模型', () => {
      const models = listModels()
      expect(models.length).toBeGreaterThanOrEqual(2)
      const flashModel = models.find(m => m.model_name === 'deepseek-v4-flash')
      const proModel = models.find(m => m.model_name === 'deepseek-v4-pro')
      expect(flashModel).toBeTruthy()
      expect(flashModel?.is_default).toBe(true)
      expect(flashModel?.context_window).toBe(1048576)
      expect(proModel).toBeTruthy()
      expect(proModel?.is_default).toBe(false)
    })

    it('createModel 创建新模型', () => {
      const model = createModel({
        provider: 'deepseek',
        model_name: 'deepseek-v4-pro',
        context_window: 1048576,
      })
      expect(model.id).toBeTruthy()
      expect(model.model_name).toBe('deepseek-v4-pro')
      expect(model.context_window).toBe(1048576)
      expect(model.is_default).toBe(false)
    })

    it('createModel 未知模型名使用默认 context_window', () => {
      const model = createModel({
        provider: 'deepseek',
        model_name: 'custom-model',
      })
      expect(model.context_window).toBe(131072)
    })

    it('createModel 已知模型名自动填充 context_window', () => {
      const model = createModel({
        provider: 'deepseek',
        model_name: 'deepseek-chat',
      })
      expect(model.context_window).toBe(65536)
    })

    it('setDefaultModel 切换默认模型', () => {
      const flash = createModel({ provider: 'deepseek', model_name: 'my-flash' })
      setDefaultModel(flash.id)
      const models = listModels()
      expect(models.find(m => m.id === flash.id)?.is_default).toBe(true)
      expect(models.find(m => m.model_name === 'deepseek-v4-flash')?.is_default).toBe(false)
    })

    it('updateModel 更新模型属性', () => {
      const model = createModel({ provider: 'deepseek', model_name: 'test-update' })
      const updated = updateModel(model.id, { api_base_url: 'https://custom.api.com' })
      expect(updated.api_base_url).toBe('https://custom.api.com')
    })

    it('deleteModel 删除非默认模型', () => {
      const model = createModel({ provider: 'deepseek', model_name: 'to-delete' })
      deleteModel(model.id)
      const models = listModels()
      expect(models.find(m => m.id === model.id)).toBeUndefined()
    })

    it('deleteModel 不允许删除默认模型', () => {
      const defaults = listModels().filter(m => m.is_default)
      expect(() => deleteModel(defaults[0].id)).toThrow('不能删除默认模型')
    })

    it('getDefaultModel 返回 is_default=true 的模型', () => {
      const def = getDefaultModel()
      expect(def).toBeTruthy()
      expect(def?.is_default).toBe(true)
    })
  })

  describe('对话 Token 追踪', () => {
    it('创建对话时 total_tokens 默认为 0', () => {
      createProject('p1', '项目', '')
      const conv = createConversation('c1', 'p1', null, '测试对话')
      expect(conv.total_tokens).toBe(0)
    })

    it('addConversationTokens 累加 token 数', () => {
      createProject('p1', '项目', '')
      const conv = createConversation('c1', 'p1', null, '测试对话')
      addConversationTokens(conv.id, 1500)
      addConversationTokens(conv.id, 800)
      const updated = listConversations('p1').find(c => c.id === conv.id)
      expect(updated?.total_tokens).toBe(2300)
    })
  })
})
