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
