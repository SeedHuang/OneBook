---
name: tdd-enforcement
description: Enforce Test-Driven Development for all feature work, bug fixes, and refactoring. Always apply before writing implementation code. Requires tests at DB Service, IPC Handler, Store, and Component layers.
alwaysApply: true
---

# TDD 强制开发规范

所有功能开发、Bug 修复、重构都必须先写测试再写实现代码。**没有测试的代码不允许提交。**

## 核心流程

### 新增功能：Red → Green → Refactor

```
1. 写一个失败的测试（描述期望行为）
2. 写最少量的代码让测试通过
3. 重构（保持测试通过）
```

**禁止**：先写实现、后补测试。

### 修复 Bug：复现 → 修复 → 验证

```
1. 写一个能复现 Bug 的失败测试
2. 修复代码，让测试通过
3. 确认没有引入回归（全部测试通过）
```

**禁止**：直接改代码不写复现测试。

### 重构：安全网 → 重构 → 无回归

```
1. 确认目标代码有充分测试覆盖，不足则先补测试
2. 重构代码
3. 全部测试必须通过，不允许"调整测试来适配新代码"
```

## 四层测试要求

每个功能变更必须评估以下四层的测试覆盖：

| 层级 | 测试文件位置 | 测试什么 |
|------|-------------|---------|
| **DB Service** | `electron/__tests__/*.test.ts` | 数据库 CRUD、约束、迁移 |
| **IPC Handler** | `electron/__tests__/*.test.ts` | 通道注册、参数验证、错误处理 |
| **Store** | `src/__tests__/stores.test.ts` | Zustand 状态变更、边界条件 |
| **组件** | `src/__tests__/*.test.tsx` | UI 交互、渲染输出 |

不需要每层都写——只测涉及变更的层。但必须主动评估，不能跳过。

## 执行检查

开始任何实现前，自检：

- [ ] 是否已写了失败测试？
- [ ] 测试是否覆盖了正常路径和异常路径？
- [ ] 涉及哪些层？（DB/IPC/Store/组件）

完成后，自检：

- [ ] 所有测试是否通过？（`pnpm test`）
- [ ] 类型检查是否通过？（`npx tsc --noEmit`）
- [ ] 是否有未测试的新逻辑？

## 反模式（禁止）

- **先实现后补测试** — 本末倒置，测试变成了形式主义
- **只测 happy path** — 边界条件和错误场景同样重要
- **测试依赖实现细节** — 测试行为而非内部状态
- **删测试让代码通过** — 重构时测试是安全网，不能拆
