# 自定义模型管理与快速切换

## 背景

当前 OneBook 的 AI 模型列表硬编码在 `shared/constants.ts` 中（deepseek-chat、deepseek-reasoner），用户无法添加新模型（如 deepseek-v4、deepseek-v4-flash），也无法在聊天中快速切换模型。

## 目标

- 用户可自定义添加/编辑/删除模型
- 设置页管理模型列表（增删改查、设默认）
- 聊天面板顶部快速切换当前使用的模型
- 切换模型不影响对话历史（共享上下文）
- 同一提供商的多个模型可复用同一个 API Key

## 数据层

### 新建 `models` 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PRIMARY KEY | UUID |
| provider | TEXT | 'deepseek' / 'openai' |
| model_name | TEXT | 模型标识，如 'deepseek-v4' |
| api_base_url | TEXT | 自定义 API 地址，为空用官方默认 |
| api_key | TEXT | 模型级 API Key，为空走全局 Key/MKP |
| is_default | INTEGER | 0/1，全局只有一个默认 |
| context_window | INTEGER | 上下文窗口大小（token 数），默认 131072，已知模型用内置值 |
| created_at | TEXT | ISO 时间戳 |

### 迁移逻辑

- 首次启动时自动建表
- 从 `AI_MODELS` 常量预填默认记录：deepseek-chat（is_default=1）、deepseek-reasoner
- 已有 `settings` 表中的 `ai.provider`、`ai.model` 保留兼容，优先读 `models` 表

### 类型定义（shared/types.ts）

```typescript
interface AIModel {
  id: string
  provider: AIProvider
  model_name: string
  api_base_url?: string
  api_key?: string
  is_default: boolean
  context_window: number
  created_at: string
}
```

## DB 服务层（db.service.ts）

新增函数：
- `listModels(): AIModel[]`
- `createModel(params): AIModel`
- `updateModel(id, params): AIModel`
- `deleteModel(id): void`
- `setDefaultModel(id): void` — 先把所有 is_default 置 0，再置目标为 1
- `getDefaultModel(): AIModel | null`

## IPC 通道（shared/ipc-channels.ts + handlers.ts）

| 通道 | 方向 | 说明 |
|------|------|------|
| model:list | renderer → main | 获取模型列表 |
| model:create | renderer → main | 创建模型 |
| model:update | renderer → main | 更新模型 |
| model:delete | renderer → main | 删除模型 |
| model:set-default | renderer → main | 设为默认 |
| model:test | renderer → main | 测试连通性（发简短请求） |

## AI 服务改造（ai.service.ts）

- `getCurrentModel()` → 从 `models` 表读 `is_default=1` 的记录
- `streamChat()` 支持 `model_id` 参数，按 id 查表获取完整配置
- Token 获取优先级：模型记录的 api_key → 全局 manualKey → MKP
- API URL：模型记录的 api_base_url（非空时）→ 官方默认 URL

## 设置页改造（SettingsPage.tsx）

替换当前硬编码的 Provider/Model Select，改为：

1. **模型列表**：Table 展示所有模型，列：模型名称、提供商、API 地址、是否默认、操作
2. **添加模型**：按钮弹出 Modal 表单
   - 提供商（Select）
   - 模型名称（Input）
   - API 地址（Input，可选，placeholder 显示默认地址）
   - API Key（Input.Password，可选，placeholder 提示"留空使用全局 Key"）
3. **操作列**：设为默认、编辑、删除、测试连通性
4. **Token 获取方式**：保留现有的 MKP/手动 Key 区域作为全局兜底配置

## 聊天面板改造（ChatPanel.tsx）

- 在对话标题旁添加 Select 下拉框，显示当前模型名称
- 切换后更新 settingsStore 的当前模型
- 后续消息自动使用新模型
- 切换不影响对话历史和消息列表

## 预填默认模型

迁移时自动插入（如表为空）：

| provider | model_name | is_default |
|----------|-----------|------------|
| deepseek | deepseek-chat | 1 |
| deepseek | deepseek-reasoner | 0 |

## Token 消耗追踪

### 数据来源

DeepSeek/OpenAI 流式响应的最后一个 chunk 包含 `usage` 字段：
```json
{
  "prompt_tokens": 1500,
  "completion_tokens": 800,
  "total_tokens": 2300
}
```

### 数据层

`conversations` 表新增字段：
- `total_tokens` INTEGER DEFAULT 0 — 累计 token 消耗

每次 AI 回复完成后，累加本轮 `total_tokens` 到对话记录。

### AI 服务改造

- `AIStreamChunk` 增加 `usage` 类型：`{ type: 'usage', prompt_tokens, completion_tokens, total_tokens }`
- `streamChat()` 解析最后一个 chunk 的 usage 字段，yield 一个 usage 事件
- `stream: true` 时需要在请求体加 `stream_options: { include_usage: true }`（DeepSeek 要求）

### 聊天面板展示

在对话标题或模型选择器旁边显示：
- `本轮上下文: 12.5K / 128K tokens (9.8%)`
  - 数据来源：最后一次 API 响应的 `usage.prompt_tokens`
- 进度条可视化
- 当消耗超过 80% 时黄色警告，超过 95% 时红色警告
- 每个模型的 context window 大小在模型配置中可设

### 已知模型 context window 默认值

| 模型 | context_window (tokens) |
|------|------------------------|
| deepseek-chat (V3) | 65536 (64K) |
| deepseek-reasoner (R1) | 65536 (64K) |
| deepseek-v4 | 1048576 (1M) |
| deepseek-v4-flash | 1048576 (1M) |
| gpt-4o | 131072 (128K) |
| gpt-4o-mini | 131072 (128K) |

用户自定义模型时若未填 context_window，默认 131072 (128K)。已知模型名称（如 deepseek-v4）自动填充对应默认值。

## 不在范围内

- 不支持非 OpenAI 兼容格式的 API
- 不做模型的云端同步
- 不做模型用量的计费统计（只展示实时消耗）
