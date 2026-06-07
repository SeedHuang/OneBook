/**
 * 文件服务
 *
 * 读取 Markdown、Excel、Git 仓库和 URL 文档
 */
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { marked } from 'marked'
import * as XLSX from 'xlsx'
import simpleGit from 'simple-git'
import * as cheerio from 'cheerio'
import { createLogger } from '../utils/logger'

const log = createLogger('file')

/** 读取 Markdown 文件内容 */
export async function readMarkdown(filePath: string): Promise<string> {
  log.info('读取 Markdown:', filePath)
  return fs.readFile(filePath, 'utf-8')
}

/** 读取 Excel 文件并转为 JSON */
export async function readExcel(filePath: string): Promise<string> {
  log.info('读取 Excel:', filePath)
  const buffer = await fs.readFile(filePath)
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheets: Record<string, unknown[][]> = {}
  for (const name of workbook.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 })
  }
  log.info('Excel 解析完成, 工作表:', workbook.SheetNames.join(', '))
  return JSON.stringify(sheets, null, 2)
}

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
  sections.push(analyzeLayout($))

  // === UI 组件清单 ===
  sections.push('## UI 组件清单')
  sections.push(analyzeComponents($))

  // === 可见文本内容 ===
  sections.push('## 可见文本内容')
  sections.push(extractVisibleText($))

  // === 交互元素 ===
  sections.push('## 交互元素')
  sections.push(analyzeInteractions($))

  // === 设计复杂度评估 ===
  sections.push('## 设计复杂度评估')
  sections.push(assessComplexity($))

  const result = `# HTML 设计稿分析\n\n${sections.join('\n\n')}`
  log.info('HTML 解析完成, 描述长度:', result.length)
  return result
}

/** 分析页面布局 */
function analyzeLayout($: cheerio.CheerioAPI): string {
  const lines: string[] = []
  const flexContainers = $('[style*="display:flex"], [style*="display: flex"], .flex, [class*="layout"], [class*="container"]').length
  const gridContainers = $('[style*="display:grid"], [style*="display: grid"], .grid').length

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
    tables.each((_, el) => {
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

/** 根据文件类型读取内容 */
export async function readFileContent(filePath: string): Promise<{ content: string; type: 'md' | 'xlsx' | 'html' }> {
  const ext = path.extname(filePath).toLowerCase()
  log.info('读取文件:', filePath, '类型:', ext)
  if (ext === '.md') {
    return { content: await readMarkdown(filePath), type: 'md' }
  }
  if (ext === '.xlsx' || ext === '.xls') {
    return { content: await readExcel(filePath), type: 'xlsx' }
  }
  if (ext === '.html' || ext === '.htm') {
    return { content: await readHtml(filePath), type: 'html' }
  }
  log.error('不支持的文件类型:', ext)
  throw new Error(`不支持的文件类型: ${ext}`)
}

/** 将 Markdown 转为 HTML（用于预览） */
export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown) as string
}

/** 从 Git 仓库克隆并读取指定文件 */
export async function readFromGit(repoUrl: string, branch: string, filePath: string): Promise<{ content: string; type: 'md' | 'xlsx' | 'html' }> {
  const tmpDir = path.join(os.tmpdir(), `onebook-git-${Date.now()}`)
  log.info('Git 克隆:', repoUrl, '分支:', branch, '路径:', filePath)
  const git = simpleGit()
  await git.clone(repoUrl, tmpDir, ['--depth', '1', '--branch', branch])
  const fullPath = path.join(tmpDir, filePath)
  const result = await readFileContent(fullPath)
  await fs.rm(tmpDir, { recursive: true, force: true })
  log.info('Git 读取完成, 临时目录已清理')
  return result
}

/** 从 URL 抓取内容并转为 Markdown */
export async function readFromUrl(url: string): Promise<{ content: string; type: 'md' }> {
  log.info('URL 抓取:', url)
  const response = await fetch(url)
  if (!response.ok) {
    log.error('URL 请求失败:', response.status)
    throw new Error(`URL 请求失败: ${response.status}`)
  }
  const html = await response.text()
  const content = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  log.info('URL 抓取完成, 内容长度:', content.length)
  return { content, type: 'md' }
}
