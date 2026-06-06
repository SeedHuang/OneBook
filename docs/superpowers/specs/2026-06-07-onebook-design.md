# OneBook 需求文档分析系统 — 设计规格

> 基于 Electron 的 AI 驱动需求文档分析桌面应用

## 1. 项目概述

OneBook 是一个 Electron 桌面应用，通过 DeepSeek / OpenAI 大模型对需求文档进行智能分析。支持 Markdown 和 Excel 格式，提供需求审查、需求提取、需求生成三大核心能力，并以对话式交互呈现分析结果。

### 1.1 目标用户

- **产品经理 / 需求分析师** — 审查和提炼需求文档
- **开发团队** — 理解需求、生成开发任务
- **测试人员** — 生成测试用例和验收标准

### 1.2 使用模式

单机独立使用，数据存储在本地。

## 2. 技术架构

### 2.1 架构模式

模块化单体（Modular Monolith），主进程和渲染进程通过类型安全的 IPC 通道通信。

### 2.2 技术选型

| 层次 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Electron + electron-vite | 跨平台桌面应用 |
| 前端 | React + Vite + TypeScript | 渲染进程 |
| UI 组件库 | Ant Design | 成熟组件生态 |
| 状态管理 | Zustand | 轻量，无 boilerplate |
| 数据库 | better-sqlite3 | 同步操作，快速可靠 |
| 文档解析 | marked (MD) + xlsx (Excel) | 文档读取与预览 |
| AI 集成 | mkp-sdk (优先) + 手动 Key (兜底) | Token 获取 |
| AI 模型 | DeepSeek (deepseek-chat) / OpenAI (gpt-4o) | 大语言模型 |
| Git 集成 | simple-git | 仓库克隆与文件拉取 |
| PDF 导出 | html2canvas + jspdf | HTML 渲染转 PDF |
| Word 导出 | docx + file-saver | 程序化生成 Word 文档 |

### 2.3 进程架构

```
┌─── Electron Main Process ──────────────────────────┐
├─ WindowManager    — 窗口管理（创建/销毁/焦点）
├─ FileService      — 文件系统操作（读取 Markdown / Excel / Git）
├─ AIService        — DeepSeek / OpenAI API 调用（流式响应）
├─ Database         — SQLite（项目/文档/对话/分析记录）
└─ IPC Handlers     — 注册所有 IPC 通道
└────────────────────────────────────────────────────┘
                     ↕ IPC Bridge（类型安全通道）
┌─── Renderer Process (React + Ant Design) ──────────┐
├─ 项目管理页      — 项目列表 / 创建 / 设置
├─ 文档工作区      — 文档导入 / 预览 / 编辑
├─ AI 对话面板     — 多轮对话 / 快捷分析指令
├─ 报告中心        — 分析结果展示 / 导出 PDF/Word
└─ 设置页          — MKP 状态 / 手动 Key / 模型选择
└────────────────────────────────────────────────────┘
```

### 2.4 目录结构

```
onebook/
├── electron/                   — 主进程代码
│   ├── main.ts                 — 入口，创建窗口，绑定 MKP daemon 生命周期
│   ├── services/
│   │   ├── file.service.ts     — 文件读写（Markdown/Excel/Git）
│   │   ├── ai.service.ts       — AI API 调用（DeepSeek/OpenAI 流式）
│   │   └── db.service.ts       — SQLite 操作
│   └── ipc/
│       └── handlers.ts         — IPC 通道注册
├── src/                        — 渲染进程（React）
│   ├── pages/
│   │   ├── projects/           — 项目管理页
│   │   ├── workspace/          — 文档工作区
│   │   ├── chat/               — AI 对话页
│   │   └── settings/           — 设置页
│   ├── components/             — 通用组件
│   ├── hooks/                  — 自定义 Hooks
│   └── stores/                 — Zustand 状态管理
└── shared/                     — 主/渲染进程共享
    ├── types.ts                — TypeScript 类型定义
    ├── ipc-channels.ts         — IPC 通道常量
    └── constants.ts            — 全局常量
```

## 3. 核心功能

### 3.1 项目管理

项目制组织文档，工作流：创建项目 → 导入文档 → AI 分析 → 导出报告。

- 创建项目（名称 + 描述）
- 项目列表（按更新时间排序）
- 项目设置（名称、描述、删除）

### 3.2 文档导入

支持三种来源：

| 来源 | 方式 | 格式 |
|------|------|------|
| 本地文件 | 拖拽上传 / 文件选择器 | .md, .xlsx（支持批量） |
| Git 仓库 | 输入仓库 URL，选择分支/路径 | GitHub / GitLab |
| URL 导入 | 粘贴在线文档链接 | 抓取并转换为 Markdown |

### 3.3 AI 分析能力

#### 3.3.1 需求审查

AI 自动检查需求文档质量：

- **矛盾检测** — 不同章节间的逻辑冲突
- **歧义标注** — 表述不清或有多种理解的需求
- **完整性检查** — 遗漏的功能点或边界条件
- **改进建议** — 针对每个问题的具体改进方案
- **严重性分级** — 高 / 中 / 低，按优先级排列

#### 3.3.2 需求提取

从文档中提取结构化信息：

- 功能点列表
- 角色与权限识别
- 业务流程梳理
- 数据实体识别
- 结构化 JSON 输出

#### 3.3.3 需求生成

基于需求文档自动生成：

- 测试用例
- 用户故事（As a... I want... So that...）
- 开发任务拆分
- 接口设计建议
- 验收标准定义

### 3.4 AI 对话交互

- **流式输出** — 打字机效果，实时显示 AI 响应
- **快捷指令** — 预设按钮（深度审查、生成用例、导出报告）
- **原文定位** — 点击分析结果中的编号，跳转到文档对应位置
- **多轮追问** — 基于上下文继续深入分析
- **对话持久化** — 历史记录保存到本地，可回顾

#### 3.5 报告导出

| 格式 | 实现方式 | 用途 |
|------|----------|------|
| PDF | html2canvas + jspdf | 带格式排版，适合分享给团队 |
| Word | docx + file-saver | 可编辑，适合二次加工 |
| Markdown | 直接输出 | 轻量，适合版本管理 |

## 4. AI Token 获取

### 4.1 获取策略

**MKP 优先，手动录入兜底。**

```
1. 尝试 mkp-sdk.getToken('deepseek') 或 getToken('openai')
2. 若 MKP daemon 可用且已配置 → 自动获取 token
3. 若 MKP 不可用（未安装/未配置/连接失败）→ 回退到手动录入模式
4. 用户可在设置页手动切换模式
```

### 4.2 MKP 集成

```typescript
// electron/main.ts
import { bindDaemonLifecycle, createDefaultCallbacks } from 'mkp-sdk/electron';
import { app, dialog } from 'electron';

// 绑定 daemon 生命周期（随应用启停）
bindDaemonLifecycle(app);

// 创建 Electron 交互回调
const callbacks = createDefaultCallbacks(dialog);

// electron/services/ai.service.ts
import { getToken } from 'mkp-sdk';

async function getAIProviderToken(provider: 'deepseek' | 'openai') {
  // 优先尝试 MKP
  const result = await getToken(provider, {
    requester: 'onebook',
    ...callbacks,
  });
  if (result.success && result.token) {
    return result.token;
  }
  // 回退到手动录入的 Key
  return getManualKey(provider);
}
```

### 4.3 模型切换

- 支持 DeepSeek：`deepseek-chat`、`deepseek-reasoner`
- 支持 OpenAI：`gpt-4o`、`gpt-4o-mini`
- 用户在设置页选择提供商和具体模型
- 统一 AI Service 接口，屏蔽 API 差异

### 4.4 流式响应

使用 SSE（Server-Sent Events）逐字接收，通过 IPC 逐 chunk 传回渲染进程，实现打字机效果。

### 4.5 Prompt 工程

每种分析类型有预设的系统 Prompt：

- **需求审查** — 引导 AI 检查矛盾/歧义/完整性，按严重性分级输出
- **需求提取** — 引导 AI 提取功能点/角色/流程，输出结构化 JSON
- **需求生成** — 引导 AI 生成测试用例/用户故事/开发任务

## 5. 数据模型

### 5.1 SQLite 表结构

```sql
-- 项目
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 文档
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('md', 'xlsx')),
  content TEXT,
  source TEXT NOT NULL CHECK(source IN ('local', 'git', 'url')),
  file_path TEXT,
  created_at TEXT NOT NULL
);

-- 对话
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id TEXT REFERENCES documents(id),
  title TEXT,
  created_at TEXT NOT NULL
);

-- 消息
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 分析记录
CREATE TABLE analyses (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('review', 'extract', 'generate')),
  result TEXT NOT NULL,  -- JSON 格式
  created_at TEXT NOT NULL
);

-- 设置
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

### 5.2 数据关系

- 项目 1 → N 文档
- 项目 1 → N 对话
- 对话 1 → N 消息
- 文档 1 → N 分析记录

## 6. UI 界面布局

### 6.0 设计原则

**Ant Design 优先**：所有 UI 元素优先使用 Ant Design 已有组件，不重复造轮子。仅在 Ant Design 无法满足时才自定义组件。

### 6.1 三栏布局

使用 `App Layout` 组件（`Layout` + `Layout.Sider` + `Layout.Content`）实现三栏结构。

```
┌──────────┬──────────────────────┬──────────────┐
│  左栏    │       中栏            │    右栏      │
│  导航    │    文档工作区         │  AI 对话面板 │
│  +       │                      │              │
│  文件树  │  预览/编辑切换        │  流式输出    │
│          │  AI 标注行内高亮      │  快捷指令    │
│          │  多标签页             │  可收起      │
└──────────┴──────────────────────┴──────────────┘
```

- **左栏** — 全局导航（项目/文档/对话/报告/设置）+ 当前项目信息 + 文档文件树
- **中栏** — 文档预览/编辑，AI 分析结果行内高亮（红色=严重，黄色=警告，蓝色=建议）
- **右栏** — AI 对话面板，流式输出，快捷指令按钮

### 6.2 响应式

- 各栏宽度可拖拽调整（使用 `react-resizable-panels`）
- 左右栏可折叠隐藏（`Layout.Sider` 自带 collapsible）
- 对话面板可全屏展开（`Drawer` 或 `Modal`）

### 6.3 Ant Design 组件映射

| 功能场景 | Ant Design 组件 | 说明 |
|----------|-----------------|------|
| 整体布局 | `Layout` / `Layout.Sider` / `Layout.Content` | 三栏布局 |
| 全局导航 | `Menu` (mode="inline") | 左侧导航菜单 |
| 文件树 | `Tree` | 项目文档列表，支持展开/折叠 |
| 标签页 | `Tabs` | 多文档标签页 |
| 项目列表 | `List` / `Card` | 项目卡片网格 |
| 创建项目 | `Modal` + `Form` | 弹窗表单 |
| 文档导入 | `Upload.Dragger` | 拖拽上传本地文件 |
| Git/URL 导入 | `Modal` + `Form` + `Input` | 弹窗输入仓库地址/URL |
| 对话消息列表 | `List` | 对话历史记录 |
| 消息气泡 | `Bubble` (Ant Design X) | AI 对话气泡（流式） |
| 快捷指令 | `Tag` / `Space` | 指令按钮组 |
| 分析结果 | `Table` / `Descriptions` | 结构化展示提取结果 |
| 严重性标注 | `Badge` / `Tag` (color) | 高/中/低级别标识 |
| 设置页 | `Form` / `Select` / `Switch` | API 配置、模型选择 |
| MKP 状态 | `Badge` (status) + `Descriptions` | 连接状态展示 |
| 导出报告 | `Dropdown` + `Button` | 下拉选择导出格式 |
| 加载状态 | `Spin` / `Skeleton` | 文件加载、AI 响应中 |
| 错误提示 | `message` / `notification` | 全局错误提示 |
| 确认操作 | `Popconfirm` / `Modal.confirm` | 删除等危险操作确认 |
| 空状态 | `Empty` | 无项目/无文档/无对话时 |
| 全局配置 | `ConfigProvider` | 主题、语言等全局设置 |

## 7. 错误处理

| 场景 | 处理方式 |
|------|----------|
| API 调用失败 | 友好错误提示 + 自动重试（最多 3 次） |
| 文件读取失败 | 提示文件不存在或格式不支持 |
| 数据库异常 | 自动备份 + 错误日志 |
| 网络断开 | 离线状态提示，禁用 AI 功能 |
| MKP daemon 不可用 | 自动回退到手动 Key 模式 |
| Token 过期/无效 | 提示重新认证 |
