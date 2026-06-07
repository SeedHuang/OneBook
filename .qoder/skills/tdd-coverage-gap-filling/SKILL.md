---
name: tdd-coverage-gap-filling
description: Systematic approach to filling test coverage gaps using TDD. Use when analyzing test coverage, identifying blind spots, writing missing tests, or improving coverage metrics. Covers backend services, IPC handlers, Zustand stores, and frontend components.
---

# TDD 测试覆盖补全流程

系统性地识别和填补测试盲点，从低覆盖率提升到高覆盖率。

## 流程

```
1. 分析当前覆盖率 → 识别未覆盖模块
2. 按优先级排序   → 错误路径 > 核心逻辑 > 边界条件
3. 按模块分组     → 每个模块一批测试
4. 逐个实现       → Red → Green → Refactor
5. 验证覆盖率     → 运行 coverage 报告确认提升
```

## 覆盖率工具

```bash
pnpm add -D @vitest/coverage-v8
# vitest.config.ts 无需额外配置，运行时加 --coverage
npx vitest run --coverage
```

## 模块测试模式

### MockSQLite（内存数据库 Mock）

替代真实 better-sqlite3，支持：
- 基础 CRUD（INSERT/SELECT/UPDATE/DELETE）
- 外键解析（`FOREIGN KEY ... REFERENCES`）
- 递归级联删除（`ON DELETE CASCADE`）
- CHECK 约束解析（用 `split` + `lastIndexOf` 避免括号嵌套问题）

```typescript
// electron/__tests__/mock-sqlite.ts
export class MockDatabase {
  tables = new Map<string, { columns: string[]; rows: Row[] }>()
  foreignKeys = new Map<string, ForeignKey[]>()
  // exec() 解析 CREATE TABLE 语句建立表结构
  // prepare().run/all/get 执行 CRUD
  // cascadeDelete() 递归删除子表关联数据
}
```

### IPC Handler 测试

通过捕获 `ipcMain.handle` 注册的 handler Map 进行测试：

```typescript
const handlers = new Map<string, Function>()
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers.set(channel, handler)
    }),
  },
}))

// 调用 handler
const result = await handlers.get('project:list')!({ sender: {} })
```

### Zustand Store 测试

通过 `getState()` / `setState()` 直接操作：

```typescript
beforeEach(() => {
  useProjectStore.setState({ projects: [], loading: false })
})

it('添加项目', () => {
  const { addProject } = useProjectStore.getState()
  addProject(mockProject)
  expect(useProjectStore.getState().projects).toHaveLength(1)
})
```

### AI 流式对话 SSE Mock

用 `ReadableStream` 模拟 SSE 流：

```typescript
function createMockSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index++]))
      } else {
        controller.close()
      }
    },
  })
}

// 在 fetch mock 中返回
globalThis.fetch = vi.fn().mockResolvedValue({
  ok: true,
  body: createMockSSEStream([
    'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
    'data: [DONE]\n\n',
  ]),
})
```

### 前端组件测试

详见 `antd-component-testing` skill。核心要点：
- `// @vitest-environment happy-dom`
- `window.electronAPI` mock 放在模块顶层
- 组件包装在 `MemoryRouter` + `ConfigProvider` + `AntdApp` 中

## 常见陷阱

| 问题 | 原因 | 解决 |
|------|------|------|
| `Cannot access before initialization` | `vi.mock` 工厂提升 | 用 `vi.hoisted()` |
| `is not a constructor` | 箭头函数不可 `new` | 改用 `function() {}` |
| `clearAllMocks` 重置实现 | mock 被清空 | 在 `beforeEach` 中重新设置 |
| CHECK 约束截断 CREATE TABLE | 正则 `*?` 非贪婪 | 改用 `split` + `lastIndexOf` |
| `vi.clearAllMocks` 影响后续 | 全局 mock 被清 | 只在特定 describe 的 beforeEach 重置 |

## 验证清单

- [ ] 所有测试通过（`vitest run`）
- [ ] 覆盖率达标（行覆盖 > 85%）
- [ ] 类型检查通过（`tsc --noEmit`）
- [ ] 生产构建成功（`pnpm run build`）
