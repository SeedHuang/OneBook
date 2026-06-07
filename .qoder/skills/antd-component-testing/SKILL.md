---
name: antd-component-testing
description: Test React + Ant Design components in Electron apps using Vitest and happy-dom. Use when writing frontend component tests, setting up test environments for Antd UI, or debugging test failures with Modal/Portal rendering.
---

# Ant Design 组件测试模式

在 Electron + React + Ant Design 项目中编写组件测试的标准化模式。

## 环境选择

**使用 `happy-dom`，不用 `jsdom`。** jsdom v29 有 ESM 兼容问题（`html-encoding-sniffer` 依赖的 `@exodus/bytes` 是 ESM-only）。

```bash
pnpm add -D happy-dom @testing-library/react @testing-library/jest-dom
```

## 测试文件模板

```typescript
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ConfigProvider, App as AntdApp } from 'antd'

// Mock window.electronAPI（必须在模块顶层）
const mockElectronAPI = {
  listProjects: vi.fn(),
  createProject: vi.fn(),
  // ...
}
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis
}
(globalThis as any).window.electronAPI = mockElectronAPI

// Mock react-router-dom（保留 MemoryRouter 等真实导出）
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// 测试包装器（必须包含 AntdApp）
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <ConfigProvider>
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </MemoryRouter>
  )
}
```

## Ant Design 特有坑点

### 1. Modal 按钮文本查询

Ant Design Modal 的 OK 按钮文字中间有空格（如 "创 建" 而非 "创建"）：

```typescript
// 错误 ✗
screen.getByText('创建')

// 正确 ✓
screen.getByRole('button', { name: '创 建' })
```

### 2. Modal 异步渲染

Modal 通过 Portal 渲染，需要等待动画完成：

```typescript
await act(async () => {
  fireEvent.click(openButton)
})

// 等待 Modal 内容出现
await waitFor(() => {
  expect(screen.getByPlaceholderText('输入内容')).toBeDefined()
}, { timeout: 3000 })
```

### 3. Zustand Store 重置

每个测试前重置 store 状态：

```typescript
beforeEach(() => {
  vi.clearAllMocks()
  useProjectStore.setState({ projects: [], loading: false })
})
```

### 4. 组件渲染必须用 act 包裹

React 19 + Testing Library 要求异步渲染在 `act` 内：

```typescript
await act(async () => {
  render(<MyComponent />, { wrapper: Wrapper })
})
```

## 常见测试场景

| 场景 | 方法 |
|------|------|
| 加载成功 | `mockApi.mockResolvedValue(data)` → 验证渲染结果 |
| 加载失败 | `mockApi.mockRejectedValue(new Error(...))` → 验证错误提示 |
| 空状态 | `mockApi.mockResolvedValue([])` → 验证 Empty 组件 |
| 表单提交 | `fireEvent.change(input)` → `fireEvent.click(submit)` → 验证 API 调用 |
| 表单校验 | 不填必填项 → `fireEvent.click(submit)` → 验证 API 未被调用 |
| 导航 | `fireEvent.click(navBtn)` → `expect(mockNavigate).toHaveBeenCalledWith('/path')` |
| 搜索过滤 | `fireEvent.change(searchInput)` → 验证列表项显示/隐藏 |

## vitest 配置注意

全局 setup 文件的 electron mock 不影响前端测试（前端组件不直接 import electron）。但需要在 setup 中 mock logger 等主进程工具：

```typescript
// vitest.setup.ts
vi.mock('./electron/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
```
