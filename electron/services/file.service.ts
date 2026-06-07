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

/** 读取 HTML 文件并提取文本内容 */
export async function readHtml(filePath: string): Promise<string> {
  log.info('读取 HTML:', filePath)
  const html = await fs.readFile(filePath, 'utf-8')
  const content = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[^>]*-->/g, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  log.info('HTML 解析完成, 内容长度:', content.length)
  return content
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
