/**
 * 导出服务
 *
 * 导出报告为 PDF、Word、Markdown、Excel 格式
 */
import { dialog } from 'electron'
import fs from 'fs/promises'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import jsPDF from 'jspdf'
import * as XLSX from 'xlsx'
import { createLogger } from '../utils/logger'

const log = createLogger('export')

/**
 * 清理文件名：去除 Windows 非法字符，截断长度
 */
function sanitizeFilename(name: string): string {
  // 去除 Windows 文件名非法字符及 Markdown 标题符: \ / : * ? " < > | #
  const cleaned = name.replace(/[\\/:*?"<>|#]/g, '').trim()
  // 去除换行符
  const noNewlines = cleaned.replace(/[\n\r]/g, ' ')
  // 截断到 50 字符，并去除末尾中英文标点
  const truncated = noNewlines.slice(0, 50).replace(/[,，。、；：！？\.!?;:\s]+$/, '')
  // 如果清理后为空，返回默认名称
  return truncated || 'AI分析报告'
}

/** 导出为 Markdown */
export async function exportMarkdown(content: string, title: string): Promise<void> {
  log.info('导出 Markdown:', title)
  const { filePath } = await dialog.showSaveDialog({
    title: '导出 Markdown',
    defaultPath: `${sanitizeFilename(title)}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (filePath) {
    await fs.writeFile(filePath, content, 'utf-8')
    log.info('Markdown 导出成功:', filePath)
  } else {
    log.info('Markdown 导出取消')
  }
}

/** 导出为 Word */
export async function exportWord(content: string, title: string): Promise<void> {
  log.info('导出 Word:', title)
  const { filePath } = await dialog.showSaveDialog({
    title: '导出 Word',
    defaultPath: `${sanitizeFilename(title)}.docx`,
    filters: [{ name: 'Word 文档', extensions: ['docx'] }],
  })
  if (!filePath) {
    log.info('Word 导出取消')
    return
  }

  const paragraphs = content.split('\n').map((line) => {
    if (line.startsWith('# ')) {
      return new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 })
    }
    if (line.startsWith('## ')) {
      return new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 })
    }
    if (line.startsWith('### ')) {
      return new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 })
    }
    return new Paragraph({ children: [new TextRun(line)] })
  })

  const doc = new Document({ sections: [{ children: paragraphs }] })
  const buffer = await Packer.toBuffer(doc)
  await fs.writeFile(filePath, buffer)
  log.info('Word 导出成功:', filePath)
}

/** 导出为 PDF */
export async function exportPdf(htmlContent: string, title: string): Promise<void> {
  log.info('导出 PDF:', title)
  const { filePath } = await dialog.showSaveDialog({
    title: '导出 PDF',
    defaultPath: `${sanitizeFilename(title)}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (!filePath) {
    log.info('PDF 导出取消')
    return
  }

  const pdf = new jsPDF()
  const lines = htmlContent.replace(/<[^>]+>/g, '').split('\n')
  let y = 20
  for (const line of lines) {
    if (y > 280) { pdf.addPage(); y = 20 }
    pdf.text(line, 15, y)
    y += 7
  }
  pdf.save(filePath)
  log.info('PDF 导出成功:', filePath)
}

/**
 * Sheet 名称去重：同名 Sheet 自动加后缀 (2), (3)...
 * Excel Sheet 名称最多 31 字符
 */
function dedupeName(name: string, counter: Record<string, number>): string {
  const base = name.slice(0, 28)
  if (!counter[base]) {
    counter[base] = 1
    return base
  }
  counter[base]++
  return `${base}(${counter[base]})`
}

/**
 * 从 Markdown 内容中提取所有表格
 *
 * 返回每个表格的标题（前一个 ## 标题）和二维数组数据
 * 支持跨段落的连续表格（复用上一个有效表头）
 */
function parseMarkdownTables(content: string): { title: string; rows: string[][] }[] {
  const lines = content.split('\n')
  const tables: { title: string; rows: string[][] }[] = []
  let currentTitle = 'Sheet'
  let tableRows: string[][] = []
  let inTable = false
  let lastHeader: string[] | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    // 记录最近的 ## 标题
    if (trimmed.startsWith('## ')) {
      currentTitle = trimmed.slice(3).trim()
    }

    // 判断是否为表格行
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      // 跳过分隔行（如 | --- | --- |）
      if (/^\|[\s-:|]+\|$/.test(trimmed)) {
        continue
      }
      const cells = trimmed
        .slice(1, -1) // 去掉首尾 |
        .split('|')
        .map((c) => c.trim())

      // 检测是否为表头行（包含"任务ID"、"实现端"等关键词）
      const isHeaderRow = cells.some((c) => c.includes('任务ID') || c.includes('实现端'))
      if (isHeaderRow) {
        // 遇到新表头：先把之前的表格保存
        if (inTable && tableRows.length > 0) {
          tables.push({ title: currentTitle, rows: [...tableRows] })
          tableRows = []
        }
        lastHeader = cells
      }

      tableRows.push(cells)
      inTable = true
    } else {
      // 表格结束
      if (inTable && tableRows.length > 0) {
        tables.push({ title: currentTitle, rows: [...tableRows] })
        tableRows = []
        inTable = false
      }
    }
  }

  // 尾部还有表格
  if (tableRows.length > 0) {
    tables.push({ title: currentTitle, rows: [...tableRows] })
  }

  return tables
}

/**
 * 判断一行数据的实现端归属
 *
 * 根据"实现端"列的内容判断该行属于前端/后端/联调
 * 支持 emoji 标记、文本关键词、任务ID前缀等多种格式
 */
function classifyRow(cell: string, taskIdCell?: string): '前端任务' | '后端任务' | '联调任务' {
  const text = cell.toLowerCase()
  const taskId = (taskIdCell || '').toUpperCase()

  // 前端判断：🟢 / [前端] / FE- 前缀 / 纯"前端"关键词
  if (text.includes('🟢') || text.includes('前端') && !text.includes('前后端')) {
    return '前端任务'
  }
  if (taskId.startsWith('FE') || taskId.startsWith('F-')) {
    return '前端任务'
  }

  // 后端判断：🔵 / [后端] / BE- 前缀 / 纯"后端"关键词
  if (text.includes('🔵') || (text.includes('后端') && !text.includes('前后端'))) {
    return '后端任务'
  }
  if (taskId.startsWith('BE') || taskId.startsWith('B-')) {
    return '后端任务'
  }

  // 联调判断：🟣 / [前后端] / INT- 前缀 / 联调、测试关键词
  if (text.includes('🟣') || text.includes('前后端') || text.includes('联调') || text.includes('测试')) {
    return '联调任务'
  }
  if (taskId.startsWith('INT') || taskId.startsWith('T-') || taskId.startsWith('QA')) {
    return '联调任务'
  }

  // 兜底：无法判断时归入联调（大部分任务都涉及联调）
  return '联调任务'
}

/**
 * 将 sheet 中纯数字字符串单元格转为数字类型
 *
 * 避免 Excel 将工时、复杂度等数值列显示为文本
 */
function convertNumericCells(ws: XLSX.WorkSheet): void {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = ws[addr]
      if (cell && cell.t === 's' && typeof cell.v === 'string') {
        const trimmed = cell.v.trim()
        // 仅匹配纯数字（整数或小数），避免 "01"、"1.2.3" 等误转
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
          const num = Number(trimmed)
          if (Number.isFinite(num)) {
            cell.v = num
            cell.t = 'n'
          }
        }
      }
    }
  }
}

/**
 * 判断表格是否为测试用例/测试数据表，不应出现在排期 Excel 中
 */
function isTestTable(title: string, header: string[]): boolean {
  const testKeywords = ['测试用例', '测试数据', '测试场景', '测试方案', '验证数据', '边界测试']
  const headerTestKeywords = ['预期结果', '测试输入', '测试输出', '实际结果', '测试步骤']
  // 标题含测试关键词
  if (testKeywords.some((kw) => title.includes(kw))) return true
  // 表头含测试关键词
  if (header.some((h) => headerTestKeywords.some((kw) => h.includes(kw)))) return true
  return false
}

/**
 * 导出为 Excel
 *
 * 解析对话内容中的 Markdown 表格，按实现端分组为固定 3 个 Sheet：
 * 前端任务、后端任务、联调任务。无实现端列的表格放入“其他” Sheet。
 * 若内容中没有表格，则将原始文本作为单 sheet 导出。
 */
export async function exportExcel(content: string, title: string): Promise<void> {
  log.info('导出 Excel:', title)
  const { filePath } = await dialog.showSaveDialog({
    title: '导出排期',
    defaultPath: `${sanitizeFilename(title)}.xlsx`,
    filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }],
  })
  if (!filePath) {
    log.info('Excel 导出取消')
    return
  }

  const tables = parseMarkdownTables(content)
  const wb = XLSX.utils.book_new()

  if (tables.length === 0) {
    // 无表格时，将原始内容按行写入单 sheet
    const rows = content.split('\n').map((line) => [line])
    const ws = XLSX.utils.aoa_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, '内容')
  } else {
    // 按实现端分组：前端任务、后端任务、联调任务
    const groups: Record<string, string[][]> = {}
    // 收集没有实现端列的表格，作为额外 Sheet 导出
    const extraSheets: { name: string; rows: string[][] }[] = []
    // 记住最后一个包含"实现端"列的表头，供后续无表头表格复用
    let lastImplHeader: string[] | null = null
    let lastImplColIdx = -1
    let lastTaskIdColIdx = -1
    // Sheet 名称去重计数
    const nameCount: Record<string, number> = {}

    for (const table of tables) {
      if (table.rows.length < 2) continue // 只有表头没有数据，跳过

      const firstRow = table.rows[0]
      // 判断第一行是否为表头（包含"任务ID"或"实现端"关键词）
      const firstRowIsHeader = firstRow.some((c) => c.includes('任务ID') || c.includes('实现端'))

      let header: string[]
      let dataRows: string[][]

      if (firstRowIsHeader) {
        header = firstRow
        dataRows = table.rows.slice(1)
      } else if (lastImplHeader) {
        // 无表头行，复用上一个有效表头
        header = lastImplHeader
        dataRows = table.rows
      } else {
        // 无表头且没有已知表头可复用，作为额外 Sheet（跳过测试数据表）
        if (!isTestTable(table.title, table.rows[0])) {
          const sheetName = dedupeName(table.title, nameCount)
          extraSheets.push({ name: sheetName, rows: table.rows })
        }
        continue
      }

      // 查找"实现端"列的索引
      const implColIdx = header.findIndex(
        (h) => h.includes('实现端') || h.includes('实现')
      )
      // 查找"任务ID"列的索引（辅助分类）
      const taskIdColIdx = header.findIndex(
        (h) => h.includes('任务ID') || h.includes('ID') || h.includes('编号')
      )

      if (implColIdx === -1) {
        // 没有实现端列的表格作为额外 Sheet 导出（跳过测试数据表）
        if (!isTestTable(table.title, header)) {
          const sheetName = dedupeName(table.title, nameCount)
          extraSheets.push({ name: sheetName, rows: [header, ...dataRows] })
        }
        continue
      }

      // 记住当前有效表头
      lastImplHeader = header
      lastImplColIdx = implColIdx
      lastTaskIdColIdx = taskIdColIdx

      // 按实现端值分组
      for (const row of dataRows) {
        // 跳过看起来像表头的行（避免重复表头被当作数据）
        if (row.some((c) => c.includes('任务ID') || c.includes('实现端'))) continue
        // 跳过列数与表头不匹配的行
        if (row.length < header.length - 1) continue

        const taskId = lastTaskIdColIdx >= 0 ? (row[lastTaskIdColIdx] || '') : ''
        const category = classifyRow(row[lastImplColIdx] || '', taskId)
        if (!groups[category]) groups[category] = []
        if (groups[category].length === 0) groups[category].push(header)
        groups[category].push(row)
      }
    }
  
    // 按固定顺序输出任务 sheet
    const sheetOrder = ['前端任务', '后端任务', '联调任务']
    for (const name of sheetOrder) {
      if (groups[name] && groups[name].length > 1) { // 至少表头+1行数据
        const ws = XLSX.utils.aoa_to_sheet(groups[name])
        convertNumericCells(ws)
        XLSX.utils.book_append_sheet(wb, ws, name)
      }
    }

    // 输出额外 sheet（汇总表、测试用例、关键路径等）
    for (const sheet of extraSheets) {
      if (sheet.rows.length >= 2) {
        const ws = XLSX.utils.aoa_to_sheet(sheet.rows)
        convertNumericCells(ws)
        XLSX.utils.book_append_sheet(wb, ws, sheet.name)
      }
    }
  
    // 如果分组后没有任何 sheet，兜底输出原始内容
    if (Object.keys(groups).length === 0) {
      const rows = content.split('\n').map((line) => [line])
      const ws = XLSX.utils.aoa_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, '内容')
    }
  }

  XLSX.writeFile(wb, filePath)
  log.info('Excel 导出成功:', filePath)
}
