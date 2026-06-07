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
import { createLogger, listLogFiles, readLogFile, clearAllLogs } from '../utils/logger'
import type { CreateProjectParams, ImportDocumentParams } from '../../shared/types'

const log = createLogger('ipc')

/** 注册所有 IPC 处理器 */
export function registerIpcHandlers(): void {
  // ---- 项目 ----
  ipcMain.handle(IPC.PROJECT_LIST, () => {
    log.debug('IPC: project:list')
    return db.listProjects()
  })
  ipcMain.handle(IPC.PROJECT_CREATE, (_, params: CreateProjectParams) => {
    log.info('IPC: project:create', params.name)
    return db.createProject(uuidv4(), params.name, params.description ?? '')
  })
  ipcMain.handle(IPC.PROJECT_UPDATE, (_, id: string, name: string, description: string) => {
    log.info('IPC: project:update', id)
    db.updateProject(id, name, description)
  })
  ipcMain.handle(IPC.PROJECT_DELETE, (_, id: string) => {
    log.info('IPC: project:delete', id)
    db.deleteProject(id)
  })

  // ---- 文档 ----
  ipcMain.handle(IPC.DOCUMENT_LIST, (_, projectId: string) => {
    log.debug('IPC: document:list', projectId)
    return db.listDocuments(projectId)
  })
  ipcMain.handle(IPC.DOCUMENT_GET, (_, id: string) => {
    log.debug('IPC: document:get', id)
    return db.getDocument(id)
  })
  ipcMain.handle(IPC.DOCUMENT_DELETE, (_, id: string) => {
    log.info('IPC: document:delete', id)
    db.deleteDocument(id)
  })

  ipcMain.handle(IPC.DOCUMENT_IMPORT, async (_, params: ImportDocumentParams) => {
    log.info('IPC: document:import', params.source, params.project_id)
    let content: string
    let type: 'md' | 'xlsx' | 'html'
    let name: string

    try {
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
    } catch (err) {
      log.error('文档导入失败:', err)
      throw err
    }

    const doc = db.createDocument({
      id: uuidv4(),
      project_id: params.project_id,
      name,
      type,
      content,
      source: params.source,
      file_path: params.file_path ?? null,
    })
    log.info('文档导入成功:', name, `(${doc.id})`)
    return doc
  })

  // ---- 对话 ----
  ipcMain.handle(IPC.CONVERSATION_LIST, (_, projectId: string) => {
    log.debug('IPC: conversation:list', projectId)
    return db.listConversations(projectId)
  })
  ipcMain.handle(IPC.CONVERSATION_CREATE, (_, projectId: string, documentId: string | null, title: string) => {
    log.info('IPC: conversation:create', title)
    return db.createConversation(uuidv4(), projectId, documentId, title)
  })
  ipcMain.handle(IPC.CONVERSATION_UPDATE, (_, id: string, title: string) => {
    log.info('IPC: conversation:update', id)
    db.updateConversationTitle(id, title)
  })
  ipcMain.handle(IPC.CONVERSATION_DELETE, (_, id: string) => {
    log.info('IPC: conversation:delete', id)
    db.deleteConversation(id)
  })
  ipcMain.handle(IPC.MESSAGE_LIST, (_, conversationId: string) => {
    log.debug('IPC: message:list', conversationId)
    return db.listMessages(conversationId)
  })

  // ---- 消息持久化 ----
  ipcMain.handle(IPC.MESSAGE_SEND, (_, params: { conversation_id: string; content: string; role: 'user' | 'assistant'; content_type?: 'text' | 'schedule' }) => {
    log.debug('IPC: message:send', params.role, params.content_type || 'text')
    return db.createMessage(uuidv4(), params.conversation_id, params.role, params.content, params.content_type || 'text')
  })
  ipcMain.handle(IPC.MESSAGE_DELETE, (_, messageId: string) => {
    log.info('IPC: message:delete', messageId)
    db.deleteMessagePair(messageId)
  })

  // ---- AI 流式对话 ----
  ipcMain.handle(IPC.AI_CHAT_STREAM, async (event, params: { messages: { role: string; content: string }[] }) => {
    const sysMsg = params.messages.find((m) => m.role === 'system')
    const docNames = sysMsg ? [...sysMsg.content.matchAll(/### (.+)/g)].map((m) => m[1]) : []
    const totalSize = params.messages.reduce((sum, m) => sum + m.content.length, 0)
    log.info('IPC: ai:chat:stream 开始', {
      消息数: params.messages.length,
      文档数: docNames.length,
      文档列表: docNames,
      总字符数: totalSize,
    })
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) {
      log.warn('AI 流式对话: 无法获取窗口实例')
      return
    }

    try {
      const stream = aiService.streamChat(params.messages)
      let chunkCount = 0
      for await (const chunk of stream) {
        if (chunk.type === 'chunk') {
          chunkCount++
          win.webContents.send(IPC.AI_CHAT_STREAM_CHUNK, chunk.content)
        } else if (chunk.type === 'done') {
          win.webContents.send(IPC.AI_CHAT_STREAM_DONE)
          log.info('AI 流式对话完成, 共', chunkCount, '个 chunk')
        } else if (chunk.type === 'error') {
          win.webContents.send(IPC.AI_CHAT_STREAM_ERROR, chunk.error)
          log.error('AI 流式对话错误:', chunk.error)
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      win.webContents.send(IPC.AI_CHAT_STREAM_ERROR, errMsg)
      log.error('AI 流式对话异常:', errMsg)
    }
  })

  // ---- 设置 ----
  ipcMain.handle(IPC.SETTINGS_GET, (_, key: string) => {
    log.debug('IPC: settings:get', key)
    return db.getSetting(key)
  })
  ipcMain.handle(IPC.SETTINGS_SET, (_, key: string, value: string) => {
    log.info('IPC: settings:set', key)
    db.setSetting(key, value)
  })
  ipcMain.handle(IPC.SETTINGS_GET_ALL, () => {
    log.debug('IPC: settings:get-all')
    return db.getAllSettings()
  })

  // ---- MKP ----
  ipcMain.handle(IPC.MKP_STATUS, () => {
    log.debug('IPC: mkp:status')
    return aiService.checkMkpStatus()
  })
  ipcMain.handle(IPC.MKP_LIST_SERVICES, async () => {
    log.debug('IPC: mkp:list-services')
    const { listServices } = await import('mkp-sdk')
    const result = await listServices()
    return result.services ?? []
  })

  // ---- 文件对话框 ----
  ipcMain.handle(IPC.FILE_OPEN_DIALOG, async () => {
    log.info('IPC: file:open-dialog')
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '文档', extensions: ['md', 'xlsx', 'xls', 'html', 'htm'] },
      ],
    })
    log.info('文件选择结果:', result.filePaths.length, '个文件')
    return result.filePaths
  })

  ipcMain.handle(IPC.FILE_READ, async (_, filePath: string) => {
    log.info('IPC: file:read', filePath)
    return fileService.readFileContent(filePath)
  })

  // ---- 导出 ----
  ipcMain.handle(IPC.EXPORT_MARKDOWN, async (_, content: string, title: string) => {
    log.info('IPC: export:markdown', title)
    const { exportMarkdown } = await import('../services/export.service')
    await exportMarkdown(content, title)
    log.info('Markdown 导出完成:', title)
  })
  ipcMain.handle(IPC.EXPORT_WORD, async (_, content: string, title: string) => {
    log.info('IPC: export:word', title)
    const { exportWord } = await import('../services/export.service')
    await exportWord(content, title)
    log.info('Word 导出完成:', title)
  })
  ipcMain.handle(IPC.EXPORT_PDF, async (_, htmlContent: string, title: string) => {
    log.info('IPC: export:pdf', title)
    const { exportPdf } = await import('../services/export.service')
    await exportPdf(htmlContent, title)
    log.info('PDF 导出完成:', title)
  })
  ipcMain.handle(IPC.EXPORT_EXCEL, async (_, content: string, title: string) => {
    log.info('IPC: export:excel', title)
    const { exportExcel } = await import('../services/export.service')
    await exportExcel(content, title)
    log.info('Excel 导出完成:', title)
  })

  // ---- 日志管理 ----
  ipcMain.handle(IPC.LOG_LIST, () => {
    log.debug('IPC: log:list')
    return listLogFiles()
  })
  ipcMain.handle(IPC.LOG_READ, (_, filename: string) => {
    log.info('IPC: log:read', filename)
    return readLogFile(filename)
  })
  ipcMain.handle(IPC.LOG_CLEAR, () => {
    log.info('IPC: log:clear — 清除所有日志文件')
    const result = clearAllLogs()
    log.info('日志清除完成:', result.deleted, '个文件已删除')
    return result
  })

  log.info('所有 IPC 处理器注册完成')
}
