/**
 * 导出服务测试
 *
 * TDD: 验证 Markdown / Word / PDF 三种导出格式的生成逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 提升 mock 函数引用，避免 hoist 问题
const { mockPackerToBuffer, mockPdfText, mockPdfAddPage, mockPdfSave } = vi.hoisted(() => ({
  mockPackerToBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-docx')),
  mockPdfText: vi.fn(),
  mockPdfAddPage: vi.fn(),
  mockPdfSave: vi.fn(),
}))

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}))

// Mock docx
vi.mock('docx', () => ({
  Document: vi.fn().mockImplementation(function () { return {} }),
  Packer: { toBuffer: mockPackerToBuffer },
  Paragraph: vi.fn().mockImplementation(function (this: any, opts: any) { Object.assign(this, opts) }),
  TextRun: vi.fn().mockImplementation(function (this: any, text: string) { this.text = text }),
  HeadingLevel: { HEADING_1: 1, HEADING_2: 2, HEADING_3: 3 },
}))

// Mock jspdf
vi.mock('jspdf', () => ({
  default: vi.fn().mockImplementation(function (this: any) {
    this.text = mockPdfText
    this.addPage = mockPdfAddPage
    this.save = mockPdfSave
  }),
}))

import { dialog } from 'electron'
import fs from 'fs/promises'
import { exportMarkdown, exportWord, exportPdf } from '../services/export.service'

describe('导出服务', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('exportMarkdown', () => {
    it('用户选择路径后写入 Markdown 文件', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: '/tmp/report.md',
        canceled: false,
      } as any)

      await exportMarkdown('# 报告\n\n内容', 'report')

      expect(dialog.showSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: 'report.md',
          filters: expect.arrayContaining([
            expect.objectContaining({ extensions: ['md'] }),
          ]),
        })
      )
      expect(fs.writeFile).toHaveBeenCalledWith('/tmp/report.md', '# 报告\n\n内容', 'utf-8')
    })

    it('用户取消保存时不写入文件', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: null,
        canceled: true,
      } as any)

      await exportMarkdown('# 报告', 'report')

      expect(fs.writeFile).not.toHaveBeenCalled()
    })
  })

  describe('exportWord', () => {
    it('用户选择路径后生成 Word 文件', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: '/tmp/report.docx',
        canceled: false,
      } as any)

      await exportWord('# 标题\n## 二级标题\n普通文本', 'report')

      expect(dialog.showSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: 'report.docx',
        })
      )
      // docx Document 应被创建
      const { Document } = await import('docx')
      expect(vi.mocked(Document)).toHaveBeenCalled()
      // Packer.toBuffer 应被调用
      expect(mockPackerToBuffer).toHaveBeenCalled()
      // 文件应被写入
      expect(fs.writeFile).toHaveBeenCalledWith('/tmp/report.docx', expect.any(Buffer))
    })

    it('Markdown 标题被正确转换为 Heading 层级', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: '/tmp/report.docx',
        canceled: false,
      } as any)

      const { Paragraph, HeadingLevel } = await import('docx')

      await exportWord('# H1\n## H2\n### H3\n普通行', 'report')

      const calls = vi.mocked(Paragraph).mock.calls
      // 第一行 # H1 → heading 1
      expect(calls[0][0]).toMatchObject({ heading: HeadingLevel.HEADING_1 })
      // 第二行 ## H2 → heading 2
      expect(calls[1][0]).toMatchObject({ heading: HeadingLevel.HEADING_2 })
      // 第三行 ### H3 → heading 3
      expect(calls[2][0]).toMatchObject({ heading: HeadingLevel.HEADING_3 })
      // 第四行 → 普通 TextRun（包含 children）
      expect(calls[3][0]).toHaveProperty('children')
    })

    it('用户取消保存时不写入文件', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: null,
        canceled: true,
      } as any)

      await exportWord('内容', 'report')

      expect(fs.writeFile).not.toHaveBeenCalled()
    })
  })

  describe('exportPdf', () => {
    it('用户选择路径后生成 PDF 文件', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: '/tmp/report.pdf',
        canceled: false,
      } as any)

      await exportPdf('<p>第一行</p>\n<p>第二行</p>', 'report')

      expect(dialog.showSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: 'report.pdf',
        })
      )
      // HTML 标签应被去除
      expect(mockPdfText).toHaveBeenCalledWith('第一行', 15, expect.any(Number))
      expect(mockPdfText).toHaveBeenCalledWith('第二行', 15, expect.any(Number))
      expect(mockPdfSave).toHaveBeenCalledWith('/tmp/report.pdf')
    })

    it('内容超过页面高度时自动分页', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: '/tmp/report.pdf',
        canceled: false,
      } as any)

      // 生成足够多行使 y > 280
      const manyLines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`).join('\n')
      await exportPdf(manyLines, 'report')

      expect(mockPdfAddPage).toHaveBeenCalled()
    })

    it('用户取消保存时不生成 PDF', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: null,
        canceled: true,
      } as any)

      await exportPdf('内容', 'report')

      expect(mockPdfSave).not.toHaveBeenCalled()
    })
  })
})
