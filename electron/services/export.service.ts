/**
 * 导出服务
 *
 * 导出报告为 PDF、Word、Markdown 格式
 */
import { dialog } from 'electron'
import fs from 'fs/promises'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import jsPDF from 'jspdf'

/** 导出为 Markdown */
export async function exportMarkdown(content: string, title: string): Promise<void> {
  const { filePath } = await dialog.showSaveDialog({
    title: '导出 Markdown',
    defaultPath: `${title}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (filePath) {
    await fs.writeFile(filePath, content, 'utf-8')
  }
}

/** 导出为 Word */
export async function exportWord(content: string, title: string): Promise<void> {
  const { filePath } = await dialog.showSaveDialog({
    title: '导出 Word',
    defaultPath: `${title}.docx`,
    filters: [{ name: 'Word 文档', extensions: ['docx'] }],
  })
  if (!filePath) return

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
}

/** 导出为 PDF */
export async function exportPdf(htmlContent: string, title: string): Promise<void> {
  const { filePath } = await dialog.showSaveDialog({
    title: '导出 PDF',
    defaultPath: `${title}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (!filePath) return

  const pdf = new jsPDF()
  const lines = htmlContent.replace(/<[^>]+>/g, '').split('\n')
  let y = 20
  for (const line of lines) {
    if (y > 280) { pdf.addPage(); y = 20 }
    pdf.text(line, 15, y)
    y += 7
  }
  pdf.save(filePath)
}
