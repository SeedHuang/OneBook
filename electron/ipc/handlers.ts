/**
 * IPC 处理器注册
 *
 * 注册所有主进程 IPC 通道
 */
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import { IPC } from '../../shared/ipc-channels'
import * as db from '../services/db.service'
import * as fileService from '../services/file.service'
import * as aiService from '../services/ai.service'
import type { CreateProjectParams, ImportDocumentParams } from '../../shared/types'

/** 注册所有 IPC 处理器 */
export function registerIpcHandlers(): void {
  // ---- 项目 ----
  ipcMain.handle(IPC.PROJECT_LIST, () => db.listProjects())
  ipcMain.handle(IPC.PROJECT_CREATE, (_, params: CreateProjectParams) => {
    return db.createProject(uuidv4(), params.name, params.description ?? '')
  })
  ipcMain.handle(IPC.PROJECT_UPDATE, (_, id: string, name: string, description: string) => {
    db.updateProject(id, name, description)
  })
  ipcMain.handle(IPC.PROJECT_DELETE, (_, id: string) => db.deleteProject(id))

  // ---- 文档 ----
  ipcMain.handle(IPC.DOCUMENT_LIST, (_, projectId: string) => db.listDocuments(projectId))
  ipcMain.handle(IPC.DOCUMENT_GET, (_, id: string) => db.getDocument(id))
  ipcMain.handle(IPC.DOCUMENT_DELETE, (_, id: string) => db.deleteDocument(id))

  ipcMain.handle(IPC.DOCUMENT_IMPORT, async (_, params: ImportDocumentParams) => {
    let content: string
    let type: 'md' | 'xlsx'
    let name: string

    if (params.source === 'local' && params.file_path) {
      const result = await fileService.readFileContent(params.file_path)
      content = result.content
      type = result.type
      name = path.basename(params.file_path)
    } else if (params.source === 'git' && params.git_repo) {
      const result = await fileService.readFromGit(
        params.git_repo, params.git_branch ?? 'main', params.git_path ?? ''
      )
      content = result.content
      type = result.type
      name = path.basename(params.git_path ?? 'document')
    } else if (params.source === 'url' && params.url) {
      const result = await fileService.readFromUrl(params.url)
      content = result.content
      type = result.type
      name = params.url.split('/').pop() ?? 'document'
    } else {
      throw new Error('无效的导入参数')
    }

    return db.createDocument({
      id: uuidv4(),
      project_id: params.project_id,
      name,
      type,
      content,
      source: params.source,
      file_path: params.file_path ?? null,
    })
  })

  // ---- 对话 ----
  ipcMain.handle(IPC.CONVERSATION_LIST, (_, projectId: string) => db.listConversations(projectId))
  ipcMain.handle(IPC.CONVERSATION_CREATE, (_, projectId: string, documentId: string | null, title: string) => {
    return db.createConversation(uuidv4(), projectId, documentId, title)
  })
  ipcMain.handle(IPC.CONVERSATION_DELETE, (_, id: string) => db.deleteConversation(id))
  ipcMain.handle(IPC.MESSAGE_LIST, (_, conversationId: string) => db.listMessages(conversationId))

  // ---- AI 流式对话 ----
  ipcMain.handle(IPC.AI_CHAT_STREAM, async (event, params: { messages: { role: string; content: string }[] }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    try {
      const stream = aiService.streamChat(params.messages)
      for await (const chunk of stream) {
        if (chunk.type === 'chunk') {
          win.webContents.send(IPC.AI_CHAT_STREAM_CHUNK, chunk.content)
        } else if (chunk.type === 'done') {
          win.webContents.send(IPC.AI_CHAT_STREAM_DONE)
        } else if (chunk.type === 'error') {
          win.webContents.send(IPC.AI_CHAT_STREAM_ERROR, chunk.error)
        }
      }
    } catch (err) {
      win.webContents.send(IPC.AI_CHAT_STREAM_ERROR, err instanceof Error ? err.message : String(err))
    }
  })

  // ---- 设置 ----
  ipcMain.handle(IPC.SETTINGS_GET, (_, key: string) => db.getSetting(key))
  ipcMain.handle(IPC.SETTINGS_SET, (_, key: string, value: string) => db.setSetting(key, value))
  ipcMain.handle(IPC.SETTINGS_GET_ALL, () => db.getAllSettings())

  // ---- MKP ----
  ipcMain.handle(IPC.MKP_STATUS, () => aiService.checkMkpStatus())
  ipcMain.handle(IPC.MKP_LIST_SERVICES, async () => {
    const { listServices } = await import('mkp-sdk')
    const result = await listServices()
    return result.services ?? []
  })

  // ---- 文件对话框 ----
  ipcMain.handle(IPC.FILE_OPEN_DIALOG, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '文档', extensions: ['md', 'xlsx', 'xls'] },
      ],
    })
    return result.filePaths
  })

  ipcMain.handle(IPC.FILE_READ, async (_, filePath: string) => {
    return fileService.readFileContent(filePath)
  })

  // ---- 导出 ----
  ipcMain.handle(IPC.EXPORT_MARKDOWN, async (_, content: string, title: string) => {
    const { exportMarkdown } = await import('../services/export.service')
    await exportMarkdown(content, title)
  })
  ipcMain.handle(IPC.EXPORT_WORD, async (_, content: string, title: string) => {
    const { exportWord } = await import('../services/export.service')
    await exportWord(content, title)
  })
  ipcMain.handle(IPC.EXPORT_PDF, async (_, htmlContent: string, title: string) => {
    const { exportPdf } = await import('../services/export.service')
    await exportPdf(htmlContent, title)
  })
}
