# HTML 设计稿分析增强实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AI 需求分析能识别 HTML 设计稿的布局、组件和交互，并与 PRD 交叉验证、参照设计稿评估前端工时。

**Architecture:** 改造 `readHtml()` 使用 cheerio 解析 DOM 输出结构化 Markdown 描述；补充 3 个提示词 md 的设计稿分析维度；在 ChatPanel 文档上下文组装时添加类型标识前缀。

**Tech Stack:** cheerio (新增依赖)、现有 Vitest 测试框架

**设计文档:** `docs/superpowers/specs/2026-06-07-html-mockup-analysis-design.md`

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `electron/services/file.service.ts` | 修改 | 改造 readHtml() 输出结构化页面描述 |
| `electron/__tests__/file.service.test.ts` | 修改 | 新增 readHtml 结构化解析测试 |
| `src/prompts/system.md` | 修改 | 阶段二增加设计稿分析维度 |
| `src/prompts/extract.md` | 修改 | 功能点表格增加设计稿参照列 |
| `src/prompts/generate.md` | 修改 | 增加设计稿参照分析和工时表格字段 |
| `src/components/ChatPanel.tsx` | 修改 | 文档上下文添加类型标识前缀 |
| `package.json` | 修改 | 新增 cheerio 依赖 |

**不需要改动的文件:**
- `shared/types.ts` — Document 接口已有 `type` 字段
- `electron/services/db.service.ts` — documents 表已存储 `type` 列
- `src/stores/documentStore.ts` — 无需修改

---

### Task 1: 安装 cheerio 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 cheerio**

```bash
cd d:/Seed/OneBook && pnpm add cheerio
```

- [ ] **Step 2: 确认安装成功**

```bash
cd d:/Seed/OneBook && node -e "const c = require('cheerio'); console.log('cheerio loaded:', typeof c.load)"
```

Expected: `cheerio loaded: function`

- [ ] **Step 3: 提交**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add cheerio dependency for HTML DOM parsing"
```

---

### Task 2: readHtml 改造——TDD 测试先行

**Files:**
- Modify: `electron/__tests__/file.service.test.ts`

- [ ] **Step 1: 在测试文件中新增 readHtml 结构化解析测试**

在 `file.service.test.ts` 的 `describe('文件服务')` 内，`describe('readFileContent')` 之前，添加以下测试块：

```typescript
  describe('readHtml', () => {
    it('解析 HTML 设计稿输出结构化描述——包含页面结构', async () => {
      const html = `
        <html><body>
          <div style="display:flex">
            <nav class="sidebar">
              <a href="/home">首页</a>
              <a href="/projects">项目</a>
            </nav>
            <main class="content">
              <h1>项目管理</h1>
              <table class="ant-table">
                <thead><tr><th>名称</th><th>状态</th><th>操作</th></tr></thead>
                <tbody><tr><td>项目A</td><td>进行中</td><td><button>编辑</button><button>删除</button></td></tr></tbody>
              </table>
            </main>
          </div>
        </body></html>
      `
      vi.mocked(fs.readFile).mockResolvedValue(html)
      const { readHtml } = await import('../services/file.service')
      const result = await readHtml('/path/mockup.html')

      // 应包含页面结构描述
      expect(result).toContain('页面结构')
      // 应识别 flex 布局
      expect(result).toMatch(/flex|多栏/)
      // 应识别导航区域
      expect(result).toMatch(/导航|nav/)
    })

    it('解析 HTML 设计稿——识别 UI 组件', async () => {
      const html = `
        <html><body>
          <table class="ant-table">
            <thead><tr><th>名称</th><th>状态</th></tr></thead>
            <tbody><tr><td>A</td><td>完成</td></tr></tbody>
          </table>
          <form class="ant-form">
            <input type="text" placeholder="搜索" />
            <select><option>全部</option><option>进行中</option></select>
            <button type="submit">查询</button>
          </form>
        </body></html>
      `
      vi.mocked(fs.readFile).mockResolvedValue(html)
      const { readHtml } = await import('../services/file.service')
      const result = await readHtml('/path/mockup.html')

      // 应包含 UI 组件清单
      expect(result).toContain('UI 组件')
      // 应识别表格
      expect(result).toMatch(/表格|table/i)
      // 应识别表单
      expect(result).toMatch(/表单|form/i)
      // 应识别按钮
      expect(result).toMatch(/按钮|button/i)
    })

    it('解析 HTML 设计稿——提取可见文本', async () => {
      const html = `
        <html><body>
          <h1>项目列表</h1>
          <button>新建项目</button>
          <span class="ant-tag">进行中</span>
          <span class="ant-tag">已完成</span>
        </body></html>
      `
      vi.mocked(fs.readFile).mockResolvedValue(html)
      const { readHtml } = await import('../services/file.service')
      const result = await readHtml('/path/mockup.html')

      // 应包含可见文本
      expect(result).toContain('项目列表')
      expect(result).toContain('新建项目')
      expect(result).toContain('进行中')
    })

    it('解析 HTML 设计稿——识别交互元素', async () => {
      const html = `
        <html><body>
          <button onclick="openModal()">新建</button>
          <a href="/detail">查看详情</a>
          <button type="submit">提交</button>
        </body></html>
      `
      vi.mocked(fs.readFile).mockResolvedValue(html)
      const { readHtml } = await import('../services/file.service')
      const result = await readHtml('/path/mockup.html')

      // 应包含交互元素部分
      expect(result).toContain('交互')
      // 应识别可点击元素
      expect(result).toMatch(/新建|提交|查看/)
    })

    it('过滤 script 和 style 内容', async () => {
      const html = `
        <html><head>
          <style>.red { color: red; }</style>
          <script>alert('hi')</script>
        </head><body>
          <h1>正文标题</h1>
        </body></html>
      `
      vi.mocked(fs.readFile).mockResolvedValue(html)
      const { readHtml } = await import('../services/file.service')
      const result = await readHtml('/path/mockup.html')

      // 不应包含 script/style 内容
      expect(result).not.toContain('alert')
      expect(result).not.toContain('color: red')
      // 应包含正文
      expect(result).toContain('正文标题')
    })

    it('readFileContent 对 .html 文件调用 readHtml 并返回 html 类型', async () => {
      const html = `<html><body><h1>Test</h1></body></html>`
      vi.mocked(fs.readFile).mockResolvedValue(html)
      const result = await readFileContent('/path/page.html')
      expect(result.type).toBe('html')
      // 内容应为结构化描述而非纯文本
      expect(result.content).toContain('页面结构')
    })
  })
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd d:/Seed/OneBook && npx vitest run electron/__tests__/file.service.test.ts --reporter=verbose
```

Expected: readHtml 相关测试 FAIL（因为当前 readHtml 输出纯文本，不包含"页面结构"等关键词）

- [ ] **Step 3: 提交**

```bash
git add electron/__tests__/file.service.test.ts
git commit -m "test: add readHtml structured parsing tests (TDD red)"
```

---

### Task 3: readHtml 实现——cheerio 结构化解析

**Files:**
- Modify: `electron/services/file.service.ts`

- [ ] **Step 1: 实现新的 readHtml 函数**

将 `file.service.ts` 中的 `readHtml` 函数替换为以下实现：

```typescript
import * as cheerio from 'cheerio'

/** 读取 HTML 文件并生成结构化页面描述 */
export async function readHtml(filePath: string): Promise<string> {
  log.info('读取 HTML:', filePath)
  const html = await fs.readFile(filePath, 'utf-8')
  const $ = cheerio.load(html)

  // 移除 script 和 style
  $('script').remove()
  $('style').remove()

  const sections: string[] = []

  // === 页面结构 ===
  sections.push('## 页面结构')
  const layoutInfo = analyzeLayout($)
  sections.push(layoutInfo)

  // === UI 组件清单 ===
  sections.push('## UI 组件清单')
  const componentInfo = analyzeComponents($)
  sections.push(componentInfo)

  // === 可见文本内容 ===
  sections.push('## 可见文本内容')
  const textInfo = extractVisibleText($)
  sections.push(textInfo)

  // === 交互元素 ===
  sections.push('## 交互元素')
  const interactionInfo = analyzeInteractions($)
  sections.push(interactionInfo)

  // === 设计复杂度评估 ===
  sections.push('## 设计复杂度评估')
  const complexityInfo = assessComplexity($)
  sections.push(complexityInfo)

  const result = `# HTML 设计稿分析\n\n${sections.join('\n\n')}`
  log.info('HTML 解析完成, 描述长度:', result.length)
  return result
}

/** 分析页面布局 */
function analyzeLayout($: cheerio.CheerioAPI): string {
  const lines: string[] = []
  const flexContainers = $('[style*="display:flex"], [style*="display: flex"], .flex, [class*="layout"], [class*="container"]').length
  const gridContainers = $('[style*="display:grid"], [style*="display: grid"], .grid').length

  // 识别语义化布局标签
  const hasNav = $('nav, [role="navigation"], .sidebar, .menu, [class*="nav"]').length > 0
  const hasHeader = $('header, [role="banner"], [class*="header"]').length > 0
  const hasAside = $('aside, [class*="aside"], [class*="sidebar"]').length > 0
  const hasMain = $('main, [role="main"], [class*="content"], [class*="main"]').length > 0
  const hasFooter = $('footer, [role="contentinfo"], [class*="footer"]').length > 0

  let layoutType = '单栏布局'
  if (flexContainers > 0 || gridContainers > 0) {
    const regions = [hasNav, hasHeader, hasAside, hasMain, hasFooter].filter(Boolean).length
    if (regions >= 3 || flexContainers >= 2 || gridContainers >= 1) {
      layoutType = '多栏布局'
    } else if (regions >= 2 || flexContainers >= 1) {
      layoutType = '双栏布局'
    } else {
      layoutType = 'Flex/Grid 弹性布局'
    }
  }

  lines.push(`- 整体布局：${layoutType}`)

  const regions: string[] = []
  if (hasNav) regions.push('导航区')
  if (hasHeader) regions.push('头部')
  if (hasAside) regions.push('侧边栏')
  if (hasMain) regions.push('主内容区')
  if (hasFooter) regions.push('底部')
  if (regions.length > 0) {
    lines.push(`- 功能区域：${regions.join('、')}`)
  }

  return lines.join('\n')
}

/** 分析 UI 组件 */
function analyzeComponents($: cheerio.CheerioAPI): string {
  const lines: string[] = []
  let idx = 1

  // 表格
  const tables = $('table')
  if (tables.length > 0) {
    tables.each((i, el) => {
      const ths = $(el).find('th')
      const colCount = ths.length
      const headers = ths.map((_, th) => $(th).text().trim()).get().filter(Boolean)
      const rowCount = $(el).find('tbody tr').length
      const isAntTable = $(el).hasClass('ant-table') || $(el).closest('.ant-table-wrapper').length > 0
      let desc = `${idx}. **数据表格**`
      if (colCount > 0) desc += ` — ${colCount} 列`
      if (headers.length > 0 && headers.length <= 10) desc += `（${headers.join('、')}）`
      if (rowCount > 0) desc += `，${rowCount} 行数据`
      if (isAntTable) desc += ' [Ant Design Table]'
      lines.push(desc)
      idx++
    })
  }

  // 表单
  const forms = $('form, .ant-form')
  if (forms.length > 0) {
    forms.each((_, el) => {
      const inputs = $(el).find('input, textarea, select').length
      const buttons = $(el).find('button, [type="submit"]').length
      lines.push(`${idx}. **表单** — ${inputs} 个输入字段，${buttons} 个按钮`)
      idx++
    })
  }

  // 独立按钮（不在表单内的）
  const standaloneButtons = $('button, .ant-btn, a.ant-btn').filter((_, el) => $(el).closest('form').length === 0)
  if (standaloneButtons.length > 0) {
    const btnTexts = standaloneButtons.map((_, el) => $(el).text().trim()).get().filter(Boolean).slice(0, 10)
    lines.push(`${idx}. **操作按钮** — ${btnTexts.join('、')}`)
    idx++
  }

  // 菜单
  const menus = $('nav, .ant-menu, [class*="menu"], [class*="sidebar"] ul')
  if (menus.length > 0) {
    const menuItems = menus.find('a, li, .ant-menu-item').length
    lines.push(`${idx}. **导航菜单** — 约 ${menuItems} 个菜单项`)
    idx++
  }

  // 标签页
  const tabs = $('.ant-tabs, [class*="tabs"], [role="tablist"]')
  if (tabs.length > 0) {
    const tabCount = tabs.find('.ant-tabs-tab, [role="tab"]').length
    lines.push(`${idx}. **标签页** — ${tabCount} 个标签`)
    idx++
  }

  // 弹窗
  const modals = $('.ant-modal, [class*="modal"], [role="dialog"]')
  if (modals.length > 0) {
    lines.push(`${idx}. **弹窗(Modal)** — ${modals.length} 个`)
    idx++
  }

  // 卡片
  const cards = $('.ant-card, [class*="card"]')
  if (cards.length > 0) {
    lines.push(`${idx}. **卡片** — ${cards.length} 个`)
    idx++
  }

  // Select / 下拉
  const selects = $('select, .ant-select')
  if (selects.length > 0) {
    lines.push(`${idx}. **下拉选择器** — ${selects.length} 个`)
    idx++
  }

  if (lines.length === 0) {
    lines.push('（未检测到常见 UI 组件）')
  }

  return lines.join('\n')
}

/** 提取可见文本 */
function extractVisibleText($: cheerio.CheerioAPI): string {
  const texts: string[] = []
  const seen = new Set<string>()

  // 按语义优先级提取
  const selectors = ['h1', 'h2', 'h3', 'h4', 'th', 'button, .ant-btn', '.ant-tag', 'label', 'p', 'span', 'a', 'li']
  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const text = $(el).text().trim()
      if (text && text.length < 100 && !seen.has(text)) {
        seen.add(text)
        texts.push(`- ${text}`)
      }
    })
  }

  if (texts.length === 0) {
    return '（未提取到可见文本）'
  }
  // 限制输出量，避免 token 过多
  return texts.slice(0, 50).join('\n')
}

/** 分析交互元素 */
function analyzeInteractions($: cheerio.CheerioAPI): string {
  const lines: string[] = []

  // onclick 元素
  $('[onclick]').each((_, el) => {
    const tag = el.tagName
    const text = $(el).text().trim() || tag
    const action = $(el).attr('onclick') || ''
    lines.push(`- 点击"${text}"(${tag}) → ${action.slice(0, 60)}`)
  })

  // 链接
  $('a[href]').each((_, el) => {
    const text = $(el).text().trim() || '链接'
    const href = $(el).attr('href') || ''
    if (href && href !== '#') {
      lines.push(`- 链接"${text}" → ${href}`)
    }
  })

  // 表单提交
  $('[type="submit"], button[type="submit"]').each((_, el) => {
    const text = $(el).text().trim() || '提交'
    lines.push(`- 表单提交"${text}"`)
  })

  // data-action 属性
  $('[data-action]').each((_, el) => {
    const text = $(el).text().trim() || el.tagName
    const action = $(el).attr('data-action') || ''
    lines.push(`- 交互"${text}" → ${action}`)
  })

  if (lines.length === 0) {
    lines.push('（未检测到明确的交互元素）')
  }

  // 限制输出量
  return lines.slice(0, 30).join('\n')
}

/** 评估设计复杂度 */
function assessComplexity($: cheerio.CheerioAPI): string {
  const lines: string[] = []

  // 自定义样式检测
  const inlineStyles = $('[style]').length
  const customClasses = new Set<string>()
  $('[class]').each((_, el) => {
    const classes = ($(el).attr('class') || '').split(/\s+/)
    classes.forEach(cls => {
      if (cls && !cls.startsWith('ant-') && !cls.startsWith('el-')) {
        customClasses.add(cls)
      }
    })
  })

  let styleLevel = '轻量'
  if (inlineStyles > 20 || customClasses.size > 30) {
    styleLevel = '重度'
  } else if (inlineStyles > 5 || customClasses.size > 10) {
    styleLevel = '中等'
  }
  lines.push(`- 自定义样式程度：${styleLevel}（内联样式 ${inlineStyles} 处，自定义类名 ${customClasses.size} 个）`)

  // 动效检测
  const animations = $('[style*="animation"], [style*="transition"], [class*="anim"], [class*="transition"]').length
  lines.push(`- 动效/动画：${animations > 0 ? `${animations} 处` : '无'}`)

  // 组件数量汇总
  const componentCount = $('table, form, .ant-form, .ant-table, .ant-modal, .ant-tabs, .ant-menu, .ant-card').length
  let complexity = '轻量'
  if (componentCount > 10 || (styleLevel === '重度' && animations > 3)) {
    complexity = '重度'
  } else if (componentCount > 4 || styleLevel !== '轻量') {
    complexity = '中等'
  }
  lines.push(`- 预估还原难度：${complexity}（共 ${componentCount} 个主要组件）`)

  return lines.join('\n')
}
```

**注意**: `import * as cheerio from 'cheerio'` 添加到文件顶部 import 区域。

- [ ] **Step 2: 运行测试验证通过**

```bash
cd d:/Seed/OneBook && npx vitest run electron/__tests__/file.service.test.ts --reporter=verbose
```

Expected: 所有 readHtml 测试 PASS

- [ ] **Step 3: 运行全量测试确认无回归**

```bash
cd d:/Seed/OneBook && npx vitest run --reporter=verbose
```

Expected: 全部 PASS，无回归

- [ ] **Step 4: 提交**

```bash
git add electron/services/file.service.ts electron/__tests__/file.service.test.ts
git commit -m "feat: readHtml outputs structured page description using cheerio"
```

---

### Task 4: 提示词补充——设计稿分析维度

**Files:**
- Modify: `src/prompts/system.md`
- Modify: `src/prompts/extract.md`
- Modify: `src/prompts/generate.md`

- [ ] **Step 1: system.md 增加设计稿分析子节**

在 `src/prompts/system.md` 的 `## 阶段二：逐文档深度分析` 部分的最后一条（`- **边界条件**...`）之后，追加：

```markdown

### 设计稿分析（当文档类型为 HTML 设计稿时）
- **页面布局识别**：整体布局方式（单栏/双栏/三栏/栅格）、各区域功能和尺寸关系
- **UI 组件清点**：逐个列出页面中的 UI 组件（表格、表单、按钮、弹窗、菜单、标签页等），标注组件类型和数量
- **交互元素提取**：识别所有可交互元素（点击、悬停、展开、切换），梳理交互流程
- **与 PRD 交叉验证**：将设计稿中的功能模块与 PRD 文档的功能点逐一对应，标注设计稿中有但 PRD 未提及的功能，以及 PRD 中提到但设计稿未体现的功能
- **前端还原复杂度预判**：基于组件数量、自定义样式程度、动效需求，给出初步还原难度评级（轻量/中等/重度）
```

- [ ] **Step 2: extract.md 功能点表格增加设计稿列**

在 `src/prompts/extract.md` 的 `## 一、功能点列表` 中，将表格模板替换为：

```markdown
| 功能点ID | 所属模块 | 功能名称 | 实现端 | 关联角色 | 核心业务规则 | 数据来源 | 交互说明 | 设计稿参照 | 设计稿还原难度 |
|---------|---------|---------|--------|---------|------------|---------|---------|----------|-------------|
```

在表格说明后追加：

```markdown
- 设计稿参照：`✅ 设计稿有对应UI` / `❌ 设计稿未覆盖`（无设计稿时填 `-`）
- 设计稿还原难度：轻量 / 中等 / 重度（无设计稿时填 `-`）
```

- [ ] **Step 3: generate.md 增加设计稿参照分析**

在 `src/prompts/generate.md` 的 `#### D. 前端专家视角——拆分前置检查` 的第 5 点之后追加：

```markdown
6. **设计稿参照分析**：如果提供了 HTML 设计稿，必须参照设计稿中的实际布局和组件来评估工时，而非仅根据 PRD 文字描述。设计稿中的组件数量、自定义样式、布局复杂度是工时的核心依据。
```

在 `### 拆分规则` 下方的工时表格模板中，在 `估算依据` 列前插入 `设计稿参照` 列：

```markdown
| 任务ID | 所属组件/页面 | 任务名称 | 实现端(🟢/🔵/🟣) | 关联功能点 | 复杂度(S/M/L/XL) | 预估工时(小时) | 预估工时(人天) | 设计稿参照 | 估算依据 | 前置依赖 | 工作内容描述 | 验收标准 |
|--------|-------------|---------|-----------------|-----------|-----------------|--------------|--------------|----------|---------|---------|------------|--------|
```

在字段说明区域追加：

```markdown
- **设计稿参照**：设计稿中该页面/组件的实际情况（如"8列表格+2筛选+弹窗表单"），无设计稿时填"无设计稿"
```

- [ ] **Step 4: 运行全量测试确认无回归**

```bash
cd d:/Seed/OneBook && npx vitest run --reporter=verbose
```

Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/prompts/system.md src/prompts/extract.md src/prompts/generate.md
git commit -m "feat: add design mockup analysis dimensions to prompts"
```

---

### Task 5: ChatPanel 文档类型标识前缀

**Files:**
- Modify: `src/components/ChatPanel.tsx:263-264`

- [ ] **Step 1: 添加文档类型前缀映射**

在 `ChatPanel.tsx` 的 `executeSend` 函数中，将文档上下文组装代码（约第 263-264 行）：

```typescript
    const docContext = documents.length > 0
      ? documents.map((d) => `### ${d.name}\n${d.content || '(内容为空)'}`).join('\n\n---\n\n')
      : '(未导入任何文档)'
```

替换为：

```typescript
    const DOC_TYPE_LABEL: Record<string, string> = {
      md: '📄 需求文档',
      html: '🎨 设计稿',
      xlsx: '📊 数据文档',
    }
    const docContext = documents.length > 0
      ? documents.map((d) => {
          const label = DOC_TYPE_LABEL[d.type] || '📄 文档'
          return `### ${label}：${d.name}\n${d.content || '(内容为空)'}`
        }).join('\n\n---\n\n')
      : '(未导入任何文档)'
```

- [ ] **Step 2: 运行全量测试确认无回归**

```bash
cd d:/Seed/OneBook && npx vitest run --reporter=verbose
```

Expected: 全部 PASS

- [ ] **Step 3: 提交**

```bash
git add src/components/ChatPanel.tsx
git commit -m "feat: add document type label prefix in chat context"
```

---

### Task 6: 全量验证

- [ ] **Step 1: TypeScript 类型检查**

```bash
cd d:/Seed/OneBook && npm run typecheck
```

Expected: 无错误

- [ ] **Step 2: 运行全量测试**

```bash
cd d:/Seed/OneBook && npx vitest run --reporter=verbose
```

Expected: 全部 PASS

- [ ] **Step 3: 构建验证**

```bash
cd d:/Seed/OneBook && npm run build
```

Expected: 构建成功，无错误

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "chore: final verification for HTML mockup analysis feature"
```
