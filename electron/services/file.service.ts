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

/** 读取 Markdown 文件内容 */
export async function readMarkdown(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8')
}

/** 读取 Excel 文件并转为 JSON */
export async function readExcel(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath)
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheets: Record<string, unknown[][]> = {}
  for (const name of workbook.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 })
  }
  return JSON.stringify(sheets, null, 2)
}

/** 根据文件类型读取内容 */
export async function readFileContent(filePath: string): Promise<{ content: string; type: 'md' | 'xlsx' }> {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.md') {
    return { content: await readMarkdown(filePath), type: 'md' }
  }
  if (ext === '.xlsx' || ext === '.xls') {
    return { content: await readExcel(filePath), type: 'xlsx' }
  }
  throw new Error(`不支持的文件类型: ${ext}`)
}

/** 将 Markdown 转为 HTML（用于预览） */
export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown) as string
}

/** 从 Git 仓库克隆并读取指定文件 */
export async function readFromGit(repoUrl: string, branch: string, filePath: string): Promise<{ content: string; type: 'md' | 'xlsx' }> {
  const tmpDir = path.join(os.tmpdir(), `onebook-git-${Date.now()}`)
  const git = simpleGit()
  await git.clone(repoUrl, tmpDir, ['--depth', '1', '--branch', branch])
  const fullPath = path.join(tmpDir, filePath)
  const result = await readFileContent(fullPath)
  await fs.rm(tmpDir, { recursive: true, force: true })
  return result
}

/** 从 URL 抓取内容并转为 Markdown */
export async function readFromUrl(url: string): Promise<{ content: string; type: 'md' }> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`URL 请求失败: ${response.status}`)
  const html = await response.text()
  const content = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { content, type: 'md' }
}
