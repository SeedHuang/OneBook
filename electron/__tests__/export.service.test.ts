/**
 * 导出服务测试
 *
 * TDD: 验证 Markdown / Word / PDF / Excel 四种导出格式的生成逻辑
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

// Mock xlsx
vi.mock('xlsx', () => ({
  writeFile: vi.fn(),
  utils: {
    aoa_to_sheet: vi.fn().mockReturnValue({ '!ref': 'A1' }),
    book_new: vi.fn().mockReturnValue({}),
    book_append_sheet: vi.fn(),
    decode_range: vi.fn().mockReturnValue({ s: { r: 0, c: 0 }, e: { r: 0, c: 0 } }),
    encode_cell: vi.fn(({ r, c }: { r: number; c: number }) => `${String.fromCharCode(65 + c)}${r + 1}`),
  },
}))

import { dialog } from 'electron'
import fs from 'fs/promises'
import { exportMarkdown, exportWord, exportPdf, exportExcel } from '../services/export.service'

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

  describe('exportExcel', () => {
    it('用户选择路径后生成 Excel 文件', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: '/tmp/report.xlsx',
        canceled: false,
      } as any)

      const content = `| 任务ID | 任务名称 | 实现端 | 工时(小时) |\n| --- | --- | --- | --- |\n| FE-01 | 布局 | 🟢[前端] | 8 |\n| BE-01 | 接口 | 🔵[后端] | 12 |`

      await exportExcel(content, 'report')

      expect(dialog.showSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: 'report.xlsx',
          filters: expect.arrayContaining([
            expect.objectContaining({ extensions: ['xlsx'] }),
          ]),
        })
      )
      const XLSX = await import('xlsx')
      expect(XLSX.writeFile).toHaveBeenCalled()
    })

    it('按实现端分组为3个固定Sheet（前端/后端/联调）', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: '/tmp/report.xlsx',
        canceled: false,
      } as any)

      const content = `| 任务ID | 任务名称 | 实现端 | 工时 |\n| --- | --- | --- | --- |\n| FE-01 | 布局 | 🟢[前端] | 8 |\n| FE-02 | 样式 | 🟢[前端] | 4 |\n| BE-01 | 接口 | 🔵[后端] | 12 |\n| INT-01 | 联调 | 🟣[前后端] | 6 |`

      await exportExcel(content, 'report')

      const XLSX = await import('xlsx')
      const appendCalls = vi.mocked(XLSX.utils.book_append_sheet).mock.calls
      const sheetNames = appendCalls.map((c: any) => c[2])
      // 固定 3 个 sheet
      expect(sheetNames).toContain('前端任务')
      expect(sheetNames).toContain('后端任务')
      expect(sheetNames).toContain('联调任务')
    })

    it('前端Sheet只包含🟢前端任务', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: '/tmp/report.xlsx',
        canceled: false,
      } as any)

      const content = `| 任务ID | 实现端 |\n| --- | --- |\n| FE-01 | 🟢[前端] |\n| BE-01 | 🔵[后端] |\n| FE-02 | 🟢[前端] |`

      await exportExcel(content, 'report')

      const XLSX = await import('xlsx')
      const appendCalls = vi.mocked(XLSX.utils.book_append_sheet).mock.calls
      // 找到前端任务 sheet
      const feSheetCall = appendCalls.find((c: any) => c[2] === '前端任务')
      expect(feSheetCall).toBeDefined()
      // aoa_to_sheet 被调用时，前端 sheet 的数据应只包含 FE-01 和 FE-02
      const aoaCalls = vi.mocked(XLSX.utils.aoa_to_sheet).mock.calls
      // 找到对应前端 sheet 的 aoa 调用（表头+2行前端数据）
      const feAoa = aoaCalls.find((c: any) => {
        const rows = c[0] as string[][]
        return rows.length === 3 && rows[1][0] === 'FE-01' && rows[2][0] === 'FE-02'
      })
      expect(feAoa).toBeDefined()
    })

    it('没有实现端列且标题无法推断归属的表格被跳过', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: '/tmp/report.xlsx',
        canceled: false,
      } as any)

      const content = `## 工时汇总\n\n| 指标 | 值 |\n| --- | --- |\n| 总计 | 100 |`

      await exportExcel(content, 'report')

      const XLSX = await import('xlsx')
      const appendCalls = vi.mocked(XLSX.utils.book_append_sheet).mock.calls
      const sheetNames = appendCalls.map((c: any) => c[2])
      // 没有实现端列且标题无法推断归属的表格应被跳过，只输出提示 sheet
      expect(sheetNames).not.toContain('工时汇总')
      expect(sheetNames).toContain('提示')
    })

    it('无实现端列时通过标题 emoji/关键词推断归属（generate.md 格式）', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: '/tmp/report.xlsx',
        canceled: false,
      } as any)

      // 模拟 generate.md 实际输出格式：按分组标题分表格，表格内无“实现端”列
      const content = [
        '## 一、功能点级任务明细',
        '',
        '**🟢 前端任务：**',
        '',
        '| 任务ID | 所属组件/页面 | 任务名称 | 复杂度 | 预估工时(小时) |',
        '| --- | --- | --- | --- | --- |',
        '| FE-001 | 首页 | 布局开发 | M | 8 |',
        '| FE-002 | 列表页 | CRUD开发 | L | 16 |',
        '',
        '**🔵 后端任务：**',
        '',
        '| 任务ID | 所属组件/页面 | 任务名称 | 复杂度 | 预估工时(小时) |',
        '| --- | --- | --- | --- | --- |',
        '| BE-001 | 用户接口 | CRUD接口 | M | 8 |',
        '',
        '**🟣 联调任务：**',
        '',
        '| 任务ID | 所属组件/页面 | 任务名称 | 复杂度 | 预估工时(小时) |',
        '| --- | --- | --- | --- | --- |',
        '| INT-001 | 首页 | 接口联调 | S | 4 |',
      ].join('\n')

      await exportExcel(content, 'report')

      const XLSX = await import('xlsx')
      const appendCalls = vi.mocked(XLSX.utils.book_append_sheet).mock.calls
      const sheetNames = appendCalls.map((c: any) => c[2])
      // 应正确识别三个分组
      expect(sheetNames).toContain('前端任务')
      expect(sheetNames).toContain('后端任务')
      expect(sheetNames).toContain('联调任务')
      // 不应输出提示 sheet
      expect(sheetNames).not.toContain('提示')

      // 前端 Sheet 应包含 2 行数据（表头 + 2行 = 3行）
      const aoaCalls = vi.mocked(XLSX.utils.aoa_to_sheet).mock.calls
      const feAoa = aoaCalls.find((c: any) => {
        const rows = c[0] as string[][]
        return rows.length === 3 && rows[1][0] === 'FE-001' && rows[2][0] === 'FE-002'
      })
      expect(feAoa).toBeDefined()
    })

    it('无实现端列时通过 ### 标题推断归属', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: '/tmp/report.xlsx',
        canceled: false,
      } as any)

      const content = [
        '### 🟢 前端任务',
        '',
        '| 任务ID | 任务名称 | 工时 |',
        '| --- | --- | --- |',
        '| FE-001 | 页面开发 | 8 |',
        '',
        '### 🔵 后端任务',
        '',
        '| 任务ID | 任务名称 | 工时 |',
        '| --- | --- | --- |',
        '| BE-001 | 接口开发 | 12 |',
      ].join('\n')

      await exportExcel(content, 'report')

      const XLSX = await import('xlsx')
      const appendCalls = vi.mocked(XLSX.utils.book_append_sheet).mock.calls
      const sheetNames = appendCalls.map((c: any) => c[2])
      expect(sheetNames).toContain('前端任务')
      expect(sheetNames).toContain('后端任务')
    })

    it('通过任务ID前缀辅助分类（FE-/BE-/INT-）', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: '/tmp/report.xlsx',
        canceled: false,
      } as any)

      // 实现端列为空但任务ID有前缀
      const content = `| 任务ID | 任务名称 | 实现端 | 工时 |\n| --- | --- | --- | --- |\n| FE-01 | 布局 | | 8 |\n| BE-01 | 接口 | | 12 |\n| INT-01 | 联调 | | 6 |`

      await exportExcel(content, 'report')

      const XLSX = await import('xlsx')
      const appendCalls = vi.mocked(XLSX.utils.book_append_sheet).mock.calls
      const sheetNames = appendCalls.map((c: any) => c[2])
      expect(sheetNames).toContain('前端任务')
      expect(sheetNames).toContain('后端任务')
      expect(sheetNames).toContain('联调任务')
    })

    it('多个表格被标题分隔时仍能正确分组所有任务', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: '/tmp/report.xlsx',
        canceled: false,
      } as any)

      // 模拟真实 AI 输出：一个大表格被标题文本分隔成多个表格
      const content = [
        '## 一、开发任务列表',
        '',
        '| 任务ID | 任务名称 | 实现端 | 工时 |',
        '| --- | --- | --- | --- |',
        '| FE-001 | 布局 | 🟢 前端 | 8 |',
        '| FE-002 | 组件 | 🟢 前端 | 4 |',
        '| BE-001 | 接口 | 🔵 后端 | 12 |',
        '',
        '继续输出前端任务：',
        '',
        '| FE-003 | 页面A | 🟢 前端 | 16 |',
        '| FE-004 | 页面B | 🟢 前端 | 20 |',
        '| FE-005 | 页面C | 🟢 前端 | 10 |',
        '| BE-002 | 数据层 | 🔵 后端 | 8 |',
        '',
        '## 二、工时汇总表',
        '',
        '| 分组 | 任务数 | 工时 |',
        '| --- | --- | --- |',
        '| 前端 | 5 | 58 |',
      ].join('\n')

      await exportExcel(content, 'report')

      const XLSX = await import('xlsx')
      const aoaCalls = vi.mocked(XLSX.utils.aoa_to_sheet).mock.calls
      // 找到前端任务 sheet 的 aoa 调用
      const feAoa = aoaCalls.find((c: any) => {
        const rows = c[0] as string[][]
        return rows.length > 1 && rows[1][0] === 'FE-001'
      })
      expect(feAoa).toBeDefined()
      // 前端 sheet 应包含所有 5 个 FE 任务（表头 + 5行数据 = 6行）
      const feRows = (feAoa as any)[0] as string[][]
      expect(feRows.length).toBe(6) // 1 header + 5 FE tasks
    })

    it('用户取消保存时不写入文件', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: null,
        canceled: true,
      } as any)

      await exportExcel('| A | B |\n| --- | --- |\n| 1 | 2 |', 'report')

      const XLSX = await import('xlsx')
      expect(XLSX.writeFile).not.toHaveBeenCalled()
    })

    it('内容中没有表格时将原始文本作为单sheet', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: '/tmp/report.xlsx',
        canceled: false,
      } as any)

      await exportExcel('这是一段没有表格的纯文本内容', 'report')

      const XLSX = await import('xlsx')
      expect(XLSX.utils.book_new).toHaveBeenCalled()
      expect(XLSX.writeFile).toHaveBeenCalled()
    })

    it('测试用例表格不会作为额外 Sheet 导出', async () => {
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        filePath: '/tmp/report.xlsx',
        canceled: false,
      } as any)

      const content = [
        '## 前端任务',
        '| 任务ID | 实现端 | 任务描述 |',
        '| --- | --- | --- |',
        '| FE-001 | 🟢[前端] | 页面开发 |',
        '',
        '## 测试用例',
        '| 用例编号 | 输入 | 预期结果 |',
        '| --- | --- | --- |',
        '| TC-001 | 100 | 200 |',
      ].join('\n')

      await exportExcel(content, 'report')

      const XLSX = await import('xlsx')
      const appendCalls = vi.mocked(XLSX.utils.book_append_sheet).mock.calls
      const sheetNames = appendCalls.map((call) => call[2])
      // 前端任务 Sheet 应该存在
      expect(sheetNames).toContain('前端任务')
      // 测试用例 Sheet 不应该存在
      expect(sheetNames.some((n) => n?.includes('测试用例'))).toBe(false)
    })
  })
})
