# 自定义模型管理与快速切换 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持用户自定义添加 AI 模型、设置页管理模型列表、聊天面板快速切换模型、实时显示 token 消耗。

**Architecture:** 新建 `models` SQLite 表存储模型配置，通过 IPC 桥接暴露 CRUD 操作。AI 服务从 models 表读取配置，支持模型级 API Key 覆盖。流式响应解析 usage 字段实现 token 追踪。

**Tech Stack:** Electron + React + Ant Design + better-sqlite3 + Vitest

**设计文档:** `docs/superpowers/specs/2026-06-07-model-management-design.md`

---

## Task 1: 类型定义与常量

**Files:**
- Modify: `shared/types.ts`
- Modify: `shared/constants.ts`
- Modify: `shared/ipc-channels.ts`

- [ ] **Step 1: 在 `shared/types.ts` 添加 AIModel 接口**

```typescript
/** 用户自定义 AI 模型配置 */
export interface AIModel {
  id: string
  provider: AIProvider
  model_name: string
  api_base_url?: string
  api_key?: string
  is_default: boolean
  context_window: number
  created_at: string
}

/** 创建模型参数 */
export interface CreateModelParams {
  provider: AIProvider
  model_name: string
  api_base_url?: string
  api_key?: string
  context_window?: number
}
```

- [ ] **Step 2: 扩展 `AIStreamChunk` 类型**

在 `shared/types.ts` 中修改 `AIStreamChunk`：

```typescript
export interface AIStreamChunk {
  type: 'chunk' | 'done' | 'error' | 'usage'
  content?: string
  error?: string
  /** token 使用统计（仅 type='usage' 时存在） */
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}
```

- [ ] **Step 3: 在 `shared/constants.ts` 添加已知模型 context window 映射**

```typescript
/** 已知模型的 context window 默认值（tokens） */
export const KNOWN_CONTEXT_WINDOWS: Record<string, number> = {
  'deepseek-chat': 65536,
  'deepseek-reasoner': 65536,
  'deepseek-v4': 1048576,
  'deepseek-v4-flash': 1048576,
  'gpt-4o': 131072,
  'gpt-4o-mini': 131072,
}

/** 默认 context window（未知模型） */
export const DEFAULT_CONTEXT_WINDOW = 131072
```

- [ ] **Step 4: 在 `shared/ipc-channels.ts` 添加模型管理通道**

在 `IPC` 对象中添加：

```typescript
// 模型管理
MODEL_LIST: 'model:list',
MODEL_CREATE: 'model:create',
MODEL_UPDATE: 'model:update',
MODEL_DELETE: 'model:delete',
MODEL_SET_DEFAULT: 'model:set-default',
MODEL_TEST: 'model:test',
```

- [ ] **Step 5: 在 `Conversation` 接口添加 `total_tokens` 字段**

```typescript
export interface Conversation {
  id: string
  project_id: string
  document_id: string | null
  title: string
  total_tokens: number  // 新增
  created_at: string
}
```

- [ ] **Step 6: Commit**

```bash
git add shared/
git commit -m "feat(model): add AIModel type, IPC channels, and context window constants"
```

---

## Task 2: DB 服务层 — models 表与 CRUD

**Files:**
- Modify: `electron/services/db.service.ts`
- Test: `electron/__tests__/db.service.test.ts`

- [ ] **Step 1: 写失败的测试**

在 `electron/__tests__/db.service.test.ts` 添加：

```typescript
describe('模型管理', () => {
  test('listModels 初始返回预填的默认模型', () => {
    const models = dbService.listModels()
    expect(models.length).toBeGreaterThanOrEqual(2)
    expect(models.find(m => m.model_name === 'deepseek-chat')?.is_default).toBe(true)
    expect(models.find(m => m.model_name === 'deepseek-reasoner')).toBeTruthy()
  })

  test('createModel 创建新模型', () => {
    const model = dbService.createModel({
      provider: 'deepseek',
      model_name: 'deepseek-v4',
      context_window: 1048576,
    })
    expect(model.id).toBeTruthy()
    expect(model.model_name).toBe('deepseek-v4')
    expect(model.context_window).toBe(1048576)
  })

  test('setDefaultModel 切换默认模型', () => {
    const v4 = dbService.createModel({ provider: 'deepseek', model_name: 'deepseek-v4' })
    dbService.setDefaultModel(v4.id)
    const models = dbService.listModels()
    expect(models.find(m => m.id === v4.id)?.is_default).toBe(true)
    expect(models.find(m => m.model_name === 'deepseek-chat')?.is_default).toBe(false)
  })

  test('updateModel 更新模型属性', () => {
    const model = dbService.createModel({ provider: 'deepseek', model_name: 'test-model' })
    const updated = dbService.updateModel(model.id, { api_base_url: 'https://custom.api.com' })
    expect(updated.api_base_url).toBe('https://custom.api.com')
  })

  test('deleteModel 删除模型', () => {
    const model = dbService.createModel({ provider: 'deepseek', model_name: 'to-delete' })
    dbService.deleteModel(model.id)
    const models = dbService.listModels()
    expect(models.find(m => m.id === model.id)).toBeUndefined()
  })

  test('deleteModel 不允许删除默认模型', () => {
    const defaults = dbService.listModels().filter(m => m.is_default)
    expect(() => dbService.deleteModel(defaults[0].id)).toThrow()
  })

  test('getDefaultModel 返回 is_default=true 的模型', () => {
    const def = dbService.getDefaultModel()
    expect(def).toBeTruthy()
    expect(def?.is_default).toBe(true)
  })

  test('conversations 表包含 total_tokens 字段', () => {
    const conv = dbService.createConversation('proj-1', null, 'test')
    expect(conv.total_tokens).toBe(0)
  })

  test('addConversationTokens 累加 token 数', () => {
    const conv = dbService.createConversation('proj-1', null, 'test')
    dbService.addConversationTokens(conv.id, 1500)
    dbService.addConversationTokens(conv.id, 800)
    const updated = dbService.listConversations('proj-1').find(c => c.id === conv.id)
    expect(updated?.total_tokens).toBe(2300)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run electron/__tests__/db.service.test.ts
```

预期：FAIL（函数未定义）

- [ ] **Step 3: 在 `db.service.ts` 添加 models 表建表语句**

在 `initDatabase()` 的 `db.exec()` 中追加：

```sql
CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('deepseek', 'openai')),
  model_name TEXT NOT NULL UNIQUE,
  api_base_url TEXT,
  api_key TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  context_window INTEGER NOT NULL DEFAULT 131072,
  created_at TEXT NOT NULL
);
```

- [ ] **Step 4: 添加迁移：预填默认模型 + conversations.total_tokens**

在 `initDatabase()` 的迁移区块后添加：

```typescript
// 迁移: models 表预填默认记录
try {
  const modelCount = (db.prepare('SELECT COUNT(*) as cnt FROM models').get() as { cnt: number }).cnt
  if (modelCount === 0) {
    const now = new Date().toISOString()
    const { v4: uuidv4 } = await import('uuid')
    db.prepare('INSERT INTO models (id, provider, model_name, is_default, context_window, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), 'deepseek', 'deepseek-chat', 1, 65536, now)
    db.prepare('INSERT INTO models (id, provider, model_name, is_default, context_window, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), 'deepseek', 'deepseek-reasoner', 0, 65536, now)
    log.info('预填默认模型: deepseek-chat, deepseek-reasoner')
  }
} catch (err) {
  log.warn('models 表预填跳过:', err instanceof Error ? err.message : String(err))
}

// 迁移: conversations 表添加 total_tokens 列
try {
  const cols = db.pragma("table_info('conversations')", { simple: false }) as Array<{ name: string }>
  if (Array.isArray(cols) && !cols.some(c => c.name === 'total_tokens')) {
    db.exec("ALTER TABLE conversations ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0")
    log.info('迁移 conversations 表: 添加 total_tokens 列')
  }
} catch (err) {
  log.warn('conversations 迁移跳过:', err instanceof Error ? err.message : String(err))
}
```

- [ ] **Step 5: 添加模型 CRUD 函数**

```typescript
import { randomUUID } from 'crypto'
import { KNOWN_CONTEXT_WINDOWS, DEFAULT_CONTEXT_WINDOW } from '../../shared/constants'
import type { AIModel, CreateModelParams } from '../../shared/types'

function rowToModel(row: Record<string, unknown>): AIModel {
  return {
    id: row.id as string,
    provider: row.provider as AIProvider,
    model_name: row.model_name as string,
    api_base_url: (row.api_base_url as string) || undefined,
    api_key: (row.api_key as string) || undefined,
    is_default: !!(row.is_default as number),
    context_window: row.context_window as number,
    created_at: row.created_at as string,
  }
}

export function listModels(): AIModel[] {
  const rows = db.prepare('SELECT * FROM models ORDER BY is_default DESC, created_at ASC').all()
  return (rows as Record<string, unknown>[]).map(rowToModel)
}

export function createModel(params: CreateModelParams): AIModel {
  const id = randomUUID()
  const now = new Date().toISOString()
  const ctx = params.context_window ?? KNOWN_CONTEXT_WINDOWS[params.model_name] ?? DEFAULT_CONTEXT_WINDOW
  db.prepare(
    'INSERT INTO models (id, provider, model_name, api_base_url, api_key, is_default, context_window, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
  ).run(id, params.provider, params.model_name, params.api_base_url || null, params.api_key || null, ctx, now)
  return rowToModel(db.prepare('SELECT * FROM models WHERE id = ?').get(id) as Record<string, unknown>)
}

export function updateModel(id: string, params: Partial<CreateModelParams>): AIModel {
  const fields: string[] = []
  const values: unknown[] = []
  if (params.provider !== undefined) { fields.push('provider = ?'); values.push(params.provider) }
  if (params.model_name !== undefined) { fields.push('model_name = ?'); values.push(params.model_name) }
  if (params.api_base_url !== undefined) { fields.push('api_base_url = ?'); values.push(params.api_base_url || null) }
  if (params.api_key !== undefined) { fields.push('api_key = ?'); values.push(params.api_key || null) }
  if (params.context_window !== undefined) { fields.push('context_window = ?'); values.push(params.context_window) }
  if (fields.length === 0) throw new Error('无更新字段')
  values.push(id)
  db.prepare(`UPDATE models SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return rowToModel(db.prepare('SELECT * FROM models WHERE id = ?').get(id) as Record<string, unknown>)
}

export function deleteModel(id: string): void {
  const model = db.prepare('SELECT * FROM models WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!model) throw new Error('模型不存在')
  if (model.is_default) throw new Error('不能删除默认模型')
  db.prepare('DELETE FROM models WHERE id = ?').run(id)
}

export function setDefaultModel(id: string): void {
  const txn = db.transaction(() => {
    db.prepare('UPDATE models SET is_default = 0').run()
    db.prepare('UPDATE models SET is_default = 1 WHERE id = ?').run(id)
  })
  txn()
}

export function getDefaultModel(): AIModel | null {
  const row = db.prepare('SELECT * FROM models WHERE is_default = 1 LIMIT 1').get() as Record<string, unknown> | undefined
  return row ? rowToModel(row) : null
}

export function addConversationTokens(conversationId: string, tokens: number): void {
  db.prepare('UPDATE conversations SET total_tokens = total_tokens + ? WHERE id = ?').run(tokens, conversationId)
}
```

- [ ] **Step 6: 运行测试确认通过**

```bash
npx vitest run electron/__tests__/db.service.test.ts
```

预期：PASS

- [ ] **Step 7: Commit**

```bash
git add electron/services/db.service.ts electron/__tests__/db.service.test.ts
git commit -m "feat(model): add models table CRUD and conversation token tracking"
```

---

## Task 3: IPC Handlers

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Test: `electron/__tests__/ipc-handlers.test.ts`

- [ ] **Step 1: 写失败的测试**

```typescript
describe('模型管理 IPC', () => {
  test('model:list 返回模型数组', async () => {
    const models = await invoke(IPC.MODEL_LIST)
    expect(Array.isArray(models)).toBe(true)
    expect(models.length).toBeGreaterThanOrEqual(2)
  })

  test('model:create + model:delete 完整流程', async () => {
    const model = await invoke(IPC.MODEL_CREATE, { provider: 'deepseek', model_name: 'ipc-test-model' })
    expect(model.id).toBeTruthy()
    await invoke(IPC.MODEL_DELETE, model.id)
    const list = await invoke(IPC.MODEL_LIST)
    expect(list.find((m: AIModel) => m.id === model.id)).toBeUndefined()
  })

  test('model:set-default 切换默认', async () => {
    const model = await invoke(IPC.MODEL_CREATE, { provider: 'deepseek', model_name: 'new-default' })
    await invoke(IPC.MODEL_SET_DEFAULT, model.id)
    const list = await invoke(IPC.MODEL_LIST)
    expect(list.find((m: AIModel) => m.id === model.id)?.is_default).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 在 `handlers.ts` 注册模型 IPC handler**

```typescript
// 模型管理
ipcMain.handle(IPC.MODEL_LIST, () => dbService.listModels())
ipcMain.handle(IPC.MODEL_CREATE, (_, params) => dbService.createModel(params))
ipcMain.handle(IPC.MODEL_UPDATE, (_, id, params) => dbService.updateModel(id, params))
ipcMain.handle(IPC.MODEL_DELETE, (_, id) => dbService.deleteModel(id))
ipcMain.handle(IPC.MODEL_SET_DEFAULT, (_, id) => dbService.setDefaultModel(id))
ipcMain.handle(IPC.MODEL_TEST, async (_, modelId) => {
  const model = dbService.listModels().find(m => m.id === modelId)
  if (!model) throw new Error('模型不存在')
  // 发一个极简请求验证连通性
  const token = await aiService.getAIToken(model.provider, model.api_key)
  const url = model.api_base_url || aiService.API_URLS[model.provider]
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ model: model.model_name, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
  })
  if (!res.ok) throw new Error(`API 返回 ${res.status}`)
  return { success: true }
})
```

注意：需要把 `ai.service.ts` 中的 `API_URLS` 和 `getAIToken` 导出供 handler 使用。

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/handlers.ts electron/__tests__/ipc-handlers.test.ts
git commit -m "feat(model): add IPC handlers for model CRUD and connectivity test"
```

---

## Task 4: Preload 桥接 + electron.d.ts 类型声明

**Files:**
- Modify: `electron/preload/index.ts`
- Modify: `src/types/electron.d.ts`

- [ ] **Step 1: 在 preload 添加模型 API**

```typescript
// 模型管理
listModels: () => ipcRenderer.invoke(IPC.MODEL_LIST),
createModel: (params: { provider: string; model_name: string; api_base_url?: string; api_key?: string; context_window?: number }) => ipcRenderer.invoke(IPC.MODEL_CREATE, params),
updateModel: (id: string, params: { provider?: string; model_name?: string; api_base_url?: string; api_key?: string; context_window?: number }) => ipcRenderer.invoke(IPC.MODEL_UPDATE, id, params),
deleteModel: (id: string) => ipcRenderer.invoke(IPC.MODEL_DELETE, id),
setDefaultModel: (id: string) => ipcRenderer.invoke(IPC.MODEL_SET_DEFAULT, id),
testModel: (id: string) => ipcRenderer.invoke(IPC.MODEL_TEST, id),
```

- [ ] **Step 2: 更新 `src/types/electron.d.ts` 类型声明**

```typescript
listModels(): Promise<AIModel[]>
createModel(params: CreateModelParams): Promise<AIModel>
updateModel(id: string, params: Partial<CreateModelParams>): Promise<AIModel>
deleteModel(id: string): Promise<void>
setDefaultModel(id: string): Promise<void>
testModel(id: string): Promise<{ success: boolean }>
```

- [ ] **Step 3: Commit**

```bash
git add electron/preload/index.ts src/types/electron.d.ts
git commit -m "feat(model): add preload bridge and type declarations for model APIs"
```

---

## Task 5: AI 服务改造 — 从 models 表读取 + usage 追踪

**Files:**
- Modify: `electron/services/ai.service.ts`
- Test: `electron/__tests__/ai.service.test.ts`

- [ ] **Step 1: 写失败的测试**

```typescript
test('streamChat 发送 stream_options.include_usage=true', async () => {
  // mock fetch 验证请求体包含 stream_options
  const mockFetch = vi.fn().mockResolvedValue({ ok: true, body: mockStreamBody })
  vi.stubGlobal('fetch', mockFetch)
  const gen = aiService.streamChat([{ role: 'user', content: 'hi' }])
  await gen.next()
  const body = JSON.parse(mockFetch.mock.calls[0][1].body)
  expect(body.stream_options).toEqual({ include_usage: true })
})

test('streamChat 解析 usage chunk 并 yield usage 事件', async () => {
  const usageChunk = 'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":50,"total_tokens":150}}\n\ndata: [DONE]\n\n'
  // ... mock stream body with usage chunk
  const gen = aiService.streamChat([{ role: 'user', content: 'hi' }])
  const results = []
  for await (const chunk of gen) results.push(chunk)
  expect(results.find(r => r.type === 'usage')?.usage?.prompt_tokens).toBe(100)
})
```

- [ ] **Step 2: 运行测试确认失败**

- [ ] **Step 3: 改造 `getCurrentModel()` 从 models 表读取**

```typescript
export function getCurrentModel(): AIModel {
  const model = dbService.getDefaultModel()
  if (model) {
    log.debug('使用 models 表默认模型:', model.model_name)
    return { ...model, model: model.model_name }
  }
  log.debug('models 表为空，使用常量默认:', DEFAULT_MODEL.provider, DEFAULT_MODEL.model)
  return { ...DEFAULT_MODEL, id: '', is_default: true, context_window: DEFAULT_CONTEXT_WINDOW, created_at: '' }
}
```

- [ ] **Step 4: 改造 `getAIToken()` 支持模型级 api_key**

```typescript
export async function getAIToken(provider: AIProvider, modelApiKey?: string): Promise<string> {
  // 1. 模型级 API Key 优先
  if (modelApiKey) {
    log.info(`使用模型级 API Key`)
    return modelApiKey
  }
  // 2. 后续逻辑不变（manual → MKP → fallback）
  // ...
}
```

- [ ] **Step 5: 改造 `streamChat()` 支持 model_id + 解析 usage**

在请求体中添加 `stream_options: { include_usage: true }`。

在流式解析循环中，检测 `parsed.usage` 字段：

```typescript
// 检查是否有 usage 信息
if (parsed.usage) {
  yield {
    type: 'usage',
    usage: {
      prompt_tokens: parsed.usage.prompt_tokens,
      completion_tokens: parsed.usage.completion_tokens,
      total_tokens: parsed.usage.total_tokens,
    },
  }
}
```

- [ ] **Step 6: 导出 `API_URLS` 供 handler 使用**

```typescript
export const API_URLS: Record<AIProvider, string> = { ... }
```

- [ ] **Step 7: 运行测试确认通过**

- [ ] **Step 8: Commit**

```bash
git add electron/services/ai.service.ts electron/__tests__/ai.service.test.ts
git commit -m "feat(model): read model from DB, support model-level API key, track token usage"
```

---

## Task 6: settingsStore 改造

**Files:**
- Modify: `src/stores/settingsStore.ts`
- Test: `src/__tests__/stores.test.ts`

- [ ] **Step 1: 写失败的测试**

```typescript
test('loadModels 加载模型列表', async () => {
  const store = useSettingsStore.getState()
  await store.loadModels()
  expect(store.models.length).toBeGreaterThanOrEqual(2)
})

test('currentModel 返回默认模型', async () => {
  const store = useSettingsStore.getState()
  await store.loadModels()
  expect(store.currentModel?.is_default).toBe(true)
})
```

- [ ] **Step 2: 在 settingsStore 添加模型相关 state 和 action**

```typescript
import type { AIModel, CreateModelParams } from '../../shared/types'

interface SettingsState {
  // ... 现有字段
  models: AIModel[]
  currentModel: AIModel | null
  tokenUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null

  loadModels: () => Promise<void>
  createModel: (params: CreateModelParams) => Promise<AIModel>
  updateModel: (id: string, params: Partial<CreateModelParams>) => Promise<AIModel>
  deleteModel: (id: string) => Promise<void>
  setDefaultModel: (id: string) => Promise<void>
  testModel: (id: string) => Promise<boolean>
  setTokenUsage: (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null) => void
}
```

- [ ] **Step 3: 实现 action**

```typescript
loadModels: async () => {
  const models = await window.electronAPI.listModels()
  set({ models, currentModel: models.find(m => m.is_default) ?? null })
},
createModel: async (params) => {
  const model = await window.electronAPI.createModel(params)
  await get().loadModels()
  return model
},
updateModel: async (id, params) => {
  const model = await window.electronAPI.updateModel(id, params)
  await get().loadModels()
  return model
},
deleteModel: async (id) => {
  await window.electronAPI.deleteModel(id)
  await get().loadModels()
},
setDefaultModel: async (id) => {
  await window.electronAPI.setDefaultModel(id)
  await get().loadModels()
},
testModel: async (id) => {
  try {
    const res = await window.electronAPI.testModel(id)
    return res.success
  } catch {
    return false
  }
},
setTokenUsage: (usage) => set({ tokenUsage: usage }),
```

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: Commit**

```bash
git add src/stores/settingsStore.ts src/__tests__/stores.test.ts
git commit -m "feat(model): add model management state and actions to settingsStore"
```

---

## Task 7: 设置页 UI 改造 — 模型列表管理

**Files:**
- Modify: `src/pages/settings/SettingsPage.tsx`

- [ ] **Step 1: 替换硬编码的 Provider/Model Select**

将 AI 模型配置 Card 改为 Table + Modal 模式：

- Table 列：模型名称、提供商、API 地址（脱敏）、Context Window、是否默认、操作
- 操作按钮：设为默认（星标）、编辑（Modal）、测试连通性（验证按钮）、删除（确认弹窗）
- "添加模型" 按钮触发 Modal

- [ ] **Step 2: 实现添加/编辑模型 Modal**

Modal 表单字段：
- 提供商 Select（deepseek / openai）
- 模型名称 Input（输入时自动填充 context_window）
- API 地址 Input（可选，placeholder: `https://api.deepseek.com/v1/chat/completions`）
- API Key Input.Password（可选，placeholder: "留空使用全局 Key"）
- Context Window InputNumber（默认根据模型名自动填充）

- [ ] **Step 3: 挂载时调用 loadModels()**

```typescript
useEffect(() => {
  loadSettings()
  loadModels()  // 新增
}, [])
```

- [ ] **Step 4: 运行应用手动验证**

启动 `pnpm dev`，进入设置页：
1. 模型列表显示 2 条预填记录
2. 添加 deepseek-v4 模型
3. 设为默认
4. 测试连通性
5. 删除非默认模型

- [ ] **Step 5: Commit**

```bash
git add src/pages/settings/SettingsPage.tsx
git commit -m "feat(model): settings page model list CRUD UI with add/edit/test/delete"
```

---

## Task 8: 聊天面板 — 模型快速切换 + Token 消耗展示

**Files:**
- Modify: `src/components/ChatPanel.tsx`

- [ ] **Step 1: 在对话区域顶部添加模型选择器**

在对话标题旁边添加 Select 下拉框：

```tsx
<Select
  size="small"
  value={currentModel?.id}
  onChange={async (id) => {
    await setDefaultModel(id)
  }}
  options={models.map(m => ({ label: m.model_name, value: m.id }))}
  style={{ width: 180 }}
/>
```

- [ ] **Step 2: 添加 Token 消耗进度条**

在模型选择器旁边显示：

```tsx
{tokenUsage && currentModel && (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <Progress
      percent={Math.round((tokenUsage.prompt_tokens / currentModel.context_window) * 100)}
      size="small"
      strokeColor={getUsageColor(tokenUsage.prompt_tokens, currentModel.context_window)}
      format={() => `${formatTokens(tokenUsage.prompt_tokens)} / ${formatTokens(currentModel.context_window)}`}
    />
  </div>
)}
```

颜色逻辑：
- <80% → 绿色
- 80%~95% → 黄色
- >95% → 红色

- [ ] **Step 3: 监听 usage 事件更新 tokenUsage**

在 AI 流式响应处理中，监听 `usage` 类型 chunk：

```typescript
if (chunk.type === 'usage') {
  setTokenUsage(chunk.usage ?? null)
}
```

- [ ] **Step 4: 对话切换时重置 tokenUsage**

```typescript
// 切换对话时，从 conversation.total_tokens 恢复或重置
setTokenUsage(null)
```

- [ ] **Step 5: 运行应用手动验证**

1. 聊天面板顶部显示模型选择器
2. 切换模型后发消息，使用新模型
3. 显示 token 消耗进度条
4. 切换对话时进度条重置

- [ ] **Step 6: Commit**

```bash
git add src/components/ChatPanel.tsx
git commit -m "feat(model): chat panel model switcher and token usage progress bar"
```

---

## Task 9: 集成测试 + 全量回归

- [ ] **Step 1: 运行全量测试**

```bash
npx vitest run
```

预期：所有测试 PASS

- [ ] **Step 2: TypeScript 编译检查**

```bash
npx tsc --noEmit
```

预期：无错误

- [ ] **Step 3: 运行应用端到端验证**

启动 `pnpm dev`：
1. 进入设置页 → 模型列表有 2 条默认记录
2. 添加 deepseek-v4 模型 → 成功
3. 设为默认 → 星标切换
4. 测试连通性 → 成功/失败提示
5. 返回聊天页 → 顶部显示 deepseek-v4
6. 发送消息 → 收到回复 + token 进度条更新
7. 切换到 deepseek-v4-flash → 下拉框切换
8. 再发消息 → 使用 flash 模型 + 进度条更新

- [ ] **Step 4: Commit 全部**

```bash
git add -A
git commit -m "feat(model): complete model management, quick switch, and token tracking"
```
