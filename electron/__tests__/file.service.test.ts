/**
 * 文件服务测试
 *
 * TDD: 测试文档读取、Excel 解析、Git/URL 导入
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock 文件系统
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    rm: vi.fn(),
  },
}))

vi.mock('os', () => ({
  default: { tmpdir: () => '/tmp' },
}))

vi.mock('simple-git', () => ({
  default: () => ({
    clone: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('xlsx', () => ({
  read: vi.fn(),
  utils: {
    sheet_to_json: vi.fn(),
  },
}))

import fs from 'fs/promises'
import {
  readMarkdown,
  readExcel,
  readHtml,
  readFileContent,
  markdownToHtml,
  readFromGit,
  readFromUrl,
} from '../services/file.service'

describe('文件服务', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('readMarkdown', () => {
    it('读取 Markdown 文件内容', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('# 标题\n\n正文内容')
      const content = await readMarkdown('/path/to/doc.md')
      expect(content).toBe('# 标题\n\n正文内容')
      expect(fs.readFile).toHaveBeenCalledWith('/path/to/doc.md', 'utf-8')
    })
  })

  describe('readExcel', () => {
    it('读取 Excel 文件并转为 JSON', async () => {
      const xlsx = await import('xlsx')
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('fake') as any)
      vi.mocked(xlsx.read).mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      } as any)
      vi.mocked(xlsx.utils.sheet_to_json).mockReturnValue([
        ['姓名', '年龄'],
        ['张三', 25],
      ] as any)

      const result = await readExcel('/path/to/data.xlsx')
      const parsed = JSON.parse(result)
      expect(parsed).toHaveProperty('Sheet1')
      expect(parsed.Sheet1).toHaveLength(2)
    })
  })

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
      const result = await readHtml('/path/mockup.html')

      // 不应包含 script/style 内容
      expect(result).not.toContain('alert')
      expect(result).not.toContain('color: red')
      // 应包含正文
      expect(result).toContain('正文标题')
    })

    it('readFileContent 对 .html 文件返回结构化描述', async () => {
      const html = `<html><body><h1>Test</h1></body></html>`
      vi.mocked(fs.readFile).mockResolvedValue(html)
      const result = await readFileContent('/path/page.html')
      expect(result.type).toBe('html')
      // 内容应为结构化描述而非纯文本
      expect(result.content).toContain('页面结构')
    })
  })

  describe('readFileContent', () => {
    it('.md 文件返回 md 类型', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('# Hello')
      const result = await readFileContent('/path/doc.md')
      expect(result.type).toBe('md')
      expect(result.content).toBe('# Hello')
    })

    it('.xlsx 文件返回 xlsx 类型', async () => {
      const xlsx = await import('xlsx')
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('fake') as any)
      vi.mocked(xlsx.read).mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      } as any)
      vi.mocked(xlsx.utils.sheet_to_json).mockReturnValue([])

      const result = await readFileContent('/path/data.xlsx')
      expect(result.type).toBe('xlsx')
    })

    it('.xls 文件也返回 xlsx 类型', async () => {
      const xlsx = await import('xlsx')
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('fake') as any)
      vi.mocked(xlsx.read).mockReturnValue({
        SheetNames: [],
        Sheets: {},
      } as any)

      const result = await readFileContent('/path/data.xls')
      expect(result.type).toBe('xlsx')
    })

    it('不支持的文件类型抛出错误', async () => {
      await expect(readFileContent('/path/doc.txt')).rejects.toThrow('不支持的文件类型')
    })
  })

  describe('markdownToHtml', () => {
    it('将 Markdown 转为 HTML', () => {
      const html = markdownToHtml('# Hello\n\nWorld')
      expect(html).toContain('<h1')
      expect(html).toContain('Hello')
      expect(html).toContain('World')
    })
  })

  describe('readFromGit', () => {
    it('从 Git 仓库克隆并读取文件', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('# Git 文档')
      vi.mocked(fs.rm).mockResolvedValue(undefined)

      const result = await readFromGit('https://github.com/test/repo.git', 'main', 'docs/req.md')
      expect(result.content).toBe('# Git 文档')
      expect(result.type).toBe('md')
      expect(fs.rm).toHaveBeenCalled() // 临时目录被清理
    })
  })

  describe('readFromUrl', () => {
    it('从 URL 抓取内容并提取文本', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html><body><h1>Title</h1><p>Content</p></body></html>'),
      })

      const result = await readFromUrl('https://example.com/doc')
      expect(result.type).toBe('md')
      expect(result.content).toContain('Title')
      expect(result.content).toContain('Content')
    })

    it('URL 请求失败抛出错误', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })

      await expect(readFromUrl('https://example.com/missing')).rejects.toThrow('URL 请求失败')
    })
  })
})
