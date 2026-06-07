---
name: typescript-error-prevention
description: Prevent recurring TypeScript errors by documenting known patterns, correct fixes, and anti-patterns. Use when encountering TS compilation errors, type mismatches, mock issues, or when writing new TypeScript code to avoid known pitfalls.
---

# TypeScript 错误预防手册

收集项目中反复出现的 TS 错误，给出**正确写法**和**禁止写法**，防止同类错误再次出现。

## 规则

遇到 TS 错误时：
1. 先在本 Skill 中查找是否已有记录
2. 如果是新错误，修复后**追加到本 Skill**
3. 写代码时主动避开禁止写法

---

## 错误 #1: vi.mock 工厂函数变量提升

**错误信息**: `Cannot access 'xxx' before initialization`

**原因**: `vi.mock()` 的工厂函数会被提升到文件顶部执行，此时 `const`/`let` 变量还未初始化。

**禁止** ✗:
```typescript
const mockFn = vi.fn()
vi.mock('./module', () => ({
  something: mockFn  // ❌ 此时 mockFn 还未初始化
}))
```

**正确** ✓:
```typescript
const { mockFn } = vi.hoisted(() => ({
  mockFn: vi.fn()
}))
vi.mock('./module', () => ({
  something: mockFn  // ✅ vi.hoisted 与 vi.mock 同步提升
}))
```

---

## 错误 #2: 箭头函数不可作为构造函数

**错误信息**: `xxx is not a constructor`

**原因**: 箭头函数没有 `[[Construct]]` 内部方法，不能被 `new` 调用。

**禁止** ✗:
```typescript
vi.mock('docx', () => ({
  Paragraph: vi.fn().mockImplementation(() => ({})),  // ❌ 箭头函数
}))
// 使用时: new Paragraph({...})  → 报错
```

**正确** ✓:
```typescript
vi.mock('docx', () => ({
  Paragraph: vi.fn().mockImplementation(function(this: any, opts: any) {
    Object.assign(this, opts)  // ✅ function 可以被 new
  }),
}))
```

---

## 错误 #3: 未使用的导入

**错误信息**: `'xxx' is declared but its value is never read.` (TS6133)

**原因**: 导入了模块但未在代码中使用。

**常见场景**:
- 移除 `<React.StrictMode>` 后忘记删 `import React`
- 重构后遗留的旧导入

**正确** ✓:
```typescript
// React 17+ 不需要显式导入 React
// 如果不用 JSX 中的 React.xxx，就不需要 import React

// 修改前
import React from 'react'
import ReactDOM from 'react-dom/client'

// 修改后（无 JSX 转换需要时）
import ReactDOM from 'react-dom/client'
```

> **规则**: 删除功能代码后，立即检查并清理相关 import。

---

## 错误 #4: 动态 import 模块解析失败

**错误信息**: `找不到模块 "xxx" 或其相应的类型声明`

**原因**: TypeScript 对动态 `import()` 的模块解析比静态 import 更严格。

**场景**: handler 中按需加载 export.service

```typescript
// 这种写法在某些 tsconfig 下可能报类型错误（不影响运行）
const { exportMarkdown } = await import('../services/export.service')
```

**处理**: 如果确认文件存在且路径正确，可以：
1. 确保 `tsconfig.json` 中 `moduleResolution` 设置为 `"bundler"` 或 `"node16"`
2. 或在动态 import 处加 `// @ts-expect-error` 注释
3. 或改为静态 import（推荐，除非需要懒加载）

---

## 错误 #5: 对象属性名不匹配

**错误信息**: 运行时 undefined，无 TS 编译错误

**原因**: Mock 返回值的属性名与实际代码使用的属性名不一致。

**禁止** ✗:
```typescript
// 实际代码: status.available
// Mock 返回: { connected: true }  // ❌ 属性名不对
mockGetMkpStatus.mockResolvedValue({ connected: true })
```

**正确** ✓:
```typescript
// 始终对照实际类型定义写 Mock
mockGetMkpStatus.mockResolvedValue({ available: true, services: [] })
```

> **规则**: 写 Mock 返回值时，必须对照实际返回类型，不能凭记忆写。

---

## 错误 #6: clearAllMocks 重置 Mock 实现

**错误信息**: Mock 函数行为异常（返回 undefined 而非预期值）

**原因**: `vi.clearAllMocks()` 会清除所有 mock 的调用记录**和实现**（包括 `mockImplementation` 和 `mockReturnValue`）。

**禁止** ✗:
```typescript
beforeEach(() => {
  vi.clearAllMocks()  // ❌ 清除了 getSetting 的 mockImplementation
  // 后续 getSetting('ai_provider') 返回 undefined
})
```

**正确** ✓:
```typescript
beforeEach(() => {
  vi.clearAllMocks()
  // ✅ 重新设置需要保留的 mock 实现
  mockGetSetting.mockImplementation((key: string) => {
    const map: Record<string, string> = {
      ai_provider: 'deepseek',
      ai_model: 'deepseek-chat',
    }
    return map[key] ?? null
  })
})
```

> 或者使用 `vi.clearAllMocks()` 只清调用记录，不清实现 → 改用 `vi.resetAllMocks()` 要更谨慎。

---

## 错误 #7: 字符串 startsWith 与正则混淆

**错误信息**: 逻辑错误，条件永远不满足

**原因**: `''.startsWith('\w')` 匹配的是字面字符串 `\w`，不是正则的 `\w`（单词字符）。

**禁止** ✗:
```typescript
if (part.startsWith('\w')) { ... }  // ❌ 匹配字面 "\w"
```

**正确** ✓:
```typescript
if (/^\w/.test(part)) { ... }  // ✅ 正则匹配单词字符
```

---

## 错误 #8: 测试文件相对路径错误

**错误信息**: `找不到模块 "../../xxx" 或其相应的类型声明`

**原因**: 测试文件的 import 路径与实际目录层级不匹配。

**正确做法**: 根据测试文件位置计算正确的相对路径：

```
src/__tests__/ProjectsPage.test.tsx
  → import from '../stores/projectStore'      (src/stores/)
  → import from '../pages/projects/xxx'       (src/pages/projects/)
  → import from '../../shared/types'          (shared/)

electron/__tests__/db.service.test.ts
  → import from '../services/db.service'      (electron/services/)
  → import from '../../shared/types'          (shared/)
```

> **规则**: 新建测试文件时，先确认目录层级，再写 import 路径。

---

## 错误 #9: ReadableStream 语法 - 尾部逗号

**错误信息**: `Unexpected ","` 语法错误

**原因**: `ReadableStream` 的 `pull` 方法 if-else 闭合后多了一个逗号。

**禁止** ✗:
```typescript
return new ReadableStream({
  pull(controller) {
    if (index < chunks.length) {
      controller.enqueue(encoder.encode(chunks[index++]))
    } else {
      controller.close()
    },  // ❌ 多余的逗号
  },
})
```

**正确** ✓:
```typescript
return new ReadableStream({
  pull(controller) {
    if (index < chunks.length) {
      controller.enqueue(encoder.encode(chunks[index++]))
    } else {
      controller.close()
    }   // ✅ 无逗号
  },
})
```

---

## 错误 #10: Mock 对象字面量被解析为函数调用

**错误信息**: `xxx is not a function`

**原因**: JavaScript ASI（自动分号插入）问题，对象字面量 `{}` 后紧跟 `()` 被解析为函数调用。

**禁止** ✗:
```typescript
const mockAPI = {
  listProjects: vi.fn()
}  // ❌ 如果没有分号，下一行的 (globalThis...) 会被当成函数调用
(globalThis as any).window.electronAPI = mockAPI
```

**正确** ✓:
```typescript
const mockAPI = {
  listProjects: vi.fn()
};  // ✅ 显式分号
(globalThis as any).window.electronAPI = mockAPI
```

> **规则**: 以 `(` 或 `[` 开头的语句前一行，必须加显式分号。

---

## 新增错误模板

遇到新的 TS 错误时，按此格式追加：

```markdown
## 错误 #N: [简短描述]

**错误信息**: `[完整错误消息]`

**原因**: [一句话解释]

**禁止** ✗:
\```typescript
// 错误写法
\```

**正确** ✓:
\```typescript
// 正确写法
\```

> **规则**: [一句话总结防御规则]
```
