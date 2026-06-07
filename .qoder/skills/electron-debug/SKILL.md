---
name: electron-debug
description: Unified Electron debugging methodology - log infrastructure, log-driven diagnosis, common issues, and verification protocol. Every bug fix MUST be proven through before/after log comparison. Use for any Electron runtime issue.
---

# Electron 日志驱动调试

**铁律：没有日志对比证据的修复不算修复。**

## 核心理念

```
1. 复现问题 → 记录错误日志（修复前）
2. 分析日志 → 定位根因
3. 修复代码
4. 重新运行 → 记录正常日志（修复后）
5. 对比两份日志 → 证明 bug 已消除
```

**禁止**："看起来好了"、"我试了一下没报错" → 必须有日志证据。

---

## 第一部分：日志基础设施

### 日志工具（electron/utils/logger.ts）

```typescript
createLogger(module) → { info, warn, error, debug }
listLogFiles()       → 日志文件名列表
clearAllLogs()       → 删除所有日志
readLogFile(filename) → 读取日志内容
```

**日志格式**: `ISO时间 [级别] [模块] 消息`
```
2025-06-07T09:30:15.123Z [INFO] [main] 应用就绪，开始初始化...
2025-06-07T09:30:15.200Z [ERROR] [db] 数据库初始化失败: Error: ...
```

**设计要点**:
- 日志目录: `app.getPath('userData')/logs/onebook-YYYY-MM-DD.log`
- Console: 仅 `!app.isPackaged` 时输出（生产环境静默）
- Debug 级别: 写入文件 + `ONEBOOK_DEBUG=1` 时才输出 Console
- 文件写入: 始终追加，失败静默
- 超 1MB 只读尾部

### IPC 日志管理通道

```typescript
// shared/ipc-channels.ts
LOG_LIST: 'log:list',    // 列出日志文件
LOG_READ: 'log:read',    // 读取日志内容
LOG_CLEAR: 'log:clear',  // 清除所有日志
```

### 前端日志管理 UI

设置页底部「日志管理」卡片：刷新 → 文件列表 → 查看弹窗（`<pre>` 等宽字体）→ 清除全部

### 测试 Mock

```typescript
const noopLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
vi.mock('./electron/utils/logger', () => ({
  createLogger: () => noopLogger,
  listLogFiles: vi.fn().mockReturnValue([]),
  readLogFile: vi.fn().mockReturnValue(''),
  clearAllLogs: vi.fn().mockReturnValue({ deleted: 0, errors: [] }),
}))
```

---

## 第二部分：埋点规范

### 必须埋点的 6 类位置

| 位置 | 日志内容 | 级别 |
|------|---------|------|
| **入口** | 函数调用 + 关键参数 | debug |
| **分支** | 走了哪个 if/else | info |
| **外部调用** | 调用前后状态 | info |
| **错误捕获** | 错误对象 + 上下文 | error |
| **状态变更** | 变更前后的值 | info |
| **完成/退出** | 操作结果摘要 | info |

### 各模块埋点清单

| 模块 | 关键节点 |
|------|---------|
| main | 启动/退出、窗口创建/显示、初始化成功/失败 |
| db | 初始化、CRUD 操作、连接关闭 |
| ipc | handler 调用入口、AI 流式进度 |
| ai | Token 获取路径、流式开始/结束/异常 |
| file | 文件读取、Git 克隆、URL 抓取 |
| export | 导出开始/成功/取消 |

---

## 第三部分：调试协议

### 标准调试流程（5 步）

**收到 bug 报告时，严格按此执行：**

#### Step 1: 复现 → 捕获修复前日志

```bash
# 启动应用，复现问题
pnpm run dev

# 查看今天的错误日志
grep "ERROR" "$APPDATA/onebook/logs/onebook-$(date +%Y-%m-%d).log"
```

记录完整的错误日志链：
```
[修复前日志]
10:08:33.732 [ipc]  IPC: project:list
10:08:33.733 [ipc]  ERROR 加载项目失败: Cannot read properties of undefined
```

#### Step 2: 通过日志还原调用链

```
1. 找到 ERROR 时间点
2. 向上回溯同一秒内日志 → 找到触发的 IPC 调用
3. 确认是前端问题还是主进程问题
4. 如需详细信息 → ONEBOOK_DEBUG=1 重启
```

#### Step 3: 定位根因并修复

根据日志线索定位代码位置，进行修复。

#### Step 4: 重新运行 → 捕获修复后日志

```bash
# 重启应用
pnpm run dev

# 查看新日志
grep "project:list" "$APPDATA/onebook/logs/onebook-$(date +%Y-%m-%d).log"
```

记录修复后的日志：
```
[修复后日志]
10:09:15.100 [ipc]  IPC: project:list
10:09:15.101 [db]  listProjects 返回 0 条
10:09:15.101 [ipc]  查询成功
```

#### Step 5: 日志对比 → 证明修复

**必须输出修复前后对比：**

```
┌─ 修复前 ─────────────────────────────────┐
│ 10:08:33 ERROR Cannot read properties    │
│ of undefined (reading 'listProjects')    │
└──────────────────────────────────────────┘
                    ↓
┌─ 修复后 ─────────────────────────────────┐
│ 10:09:15 [ipc]  IPC: project:list        │
│ 10:09:15 [db]   listProjects 返回 0 条   │
│ （无 ERROR，正常完成）                      │
└──────────────────────────────────────────┘
结论: preload 路径从 .js 改为 .mjs 后，
      IPC 通道恢复正常，错误日志消失。
```

### 自动化测试中的日志验证

```typescript
it('导入文档完整流程', async () => {
  const handler = handlers.get('document:import')!
  const doc = await handler({ sender: {} }, {
    source: 'local',
    project_id: 'p1',
    file_path: '/test/doc.md',
  })

  // 验证日志输出（不仅是返回值）
  expect(mockLog.info).toHaveBeenCalledWith(
    expect.stringContaining('文档导入成功')
  )
  // 验证无 error 日志
  expect(mockLog.error).not.toHaveBeenCalled()
})
```

---

## 第四部分：常见问题速查

### 问题 1: 加载项目失败（electronAPI undefined）

```
修复前日志: [renderer] TypeError: Cannot read properties of undefined (reading 'listProjects')
根因: preload 脚本路径不匹配，contextBridge 未执行
排查: ls out/preload/ → 产物为 index.mjs，但 main.ts 引用 .js
修复: preload: join(__dirname, '../preload/index.mjs')
修复后日志: [ipc] IPC: project:list → [db] listProjects 返回 0 条
```

### 问题 2: 数据库锁定（database is locked）

```
修复前日志: [db] ERROR 初始化失败: Error: database is locked
根因: 旧 Electron 进程占用 SQLite WAL 文件
排查: tasklist | grep electron → 发现残留进程
修复: node scripts/kill-electron.mjs（或 predev 自动清理）
修复后日志: [db] 数据库表结构已就绪
```

### 问题 3: 启动白屏

```
修复前日志: [main] ERROR 初始化失败: Cannot find native module better-sqlite3
根因: native 模块与 Electron 版本不匹配
修复: npx electron-rebuild -f -w better-sqlite3
修复后日志: [main] 数据库初始化成功 → IPC 处理器注册成功
```

### 问题 4: AI 对话无响应

```
修复前日志: [ai] ERROR API 请求失败: 401 {"error":"invalid_api_key"}
根因: API Key 无效或 MKP Token 过期
排查: [ai] 流式对话开始: provider=deepseek → 确认走了哪个 Token 路径
修复: 设置页重新配置 Token
修复后日志: [ai] 流式对话完成, 共 N 个 chunk
```

### 问题 5: 双弹窗（同一错误弹两次）

```
修复前日志: [ipc] IPC: project:list (出现两次)
根因: React.StrictMode 双重调用 useEffect
修复: 移除 <React.StrictMode> 包裹
修复后日志: [ipc] IPC: project:list (仅一次)
```

### 问题 6: No handler registered

```
修复前日志: [ipc] ERROR No handler registered for 'project:list'
根因: initDatabase 抛错导致 registerIpcHandlers 未执行
排查: 检查初始化日志 → 找到 initDatabase 的错误
修复: 修复 initDatabase 的错误（通常是 rebuild 或杀进程）
修复后日志: [main] 数据库初始化成功 → IPC 处理器注册成功
```

---

## 预防措施清单

| 措施 | 说明 |
|------|------|
| dev 前自动杀进程 | `predev: node scripts/kill-electron.mjs` |
| 进程退出关闭 DB | `app.on('window-all-closed')` → `closeDatabase()` |
| WAL 模式 | `db.pragma('journal_mode = WAL')` 减少锁冲突 |
| 外键保护 | `db.pragma('foreign_keys = ON')` |
| preload 路径验证 | 构建后检查 `out/preload/` 实际文件名 |
| 初始化 try-catch | `app.whenReady()` 中包裹初始化逻辑 |
| 日志 Mock | 测试中 mock logger 避免文件写入 |
