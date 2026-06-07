/**
 * Preload 脚本
 *
 * 在主进程和渲染进程之间建立安全的 IPC 桥接
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../../shared/ipc-channels'

/** 暴露给渲染进程的安全 API */
const electronAPI = {
  // 项目
  listProjects: () => ipcRenderer.invoke(IPC.PROJECT_LIST),
  createProject: (params: { name: string; description?: string }) => ipcRenderer.invoke(IPC.PROJECT_CREATE, params),
  updateProject: (id: string, name: string, description: string) => ipcRenderer.invoke(IPC.PROJECT_UPDATE, id, name, description),
  deleteProject: (id: string) => ipcRenderer.invoke(IPC.PROJECT_DELETE, id),

  // 文档
  listDocuments: (projectId: string) => ipcRenderer.invoke(IPC.DOCUMENT_LIST, projectId),
  getDocument: (id: string) => ipcRenderer.invoke(IPC.DOCUMENT_GET, id),
  importDocument: (params: { project_id: string; source: string; file_path?: string; url?: string; git_repo?: string; git_branch?: string; git_path?: string }) => ipcRenderer.invoke(IPC.DOCUMENT_IMPORT, params),
  deleteDocument: (id: string) => ipcRenderer.invoke(IPC.DOCUMENT_DELETE, id),

  // 对话
  listConversations: (projectId: string) => ipcRenderer.invoke(IPC.CONVERSATION_LIST, projectId),
  createConversation: (projectId: string, documentId: string | null, title: string) => ipcRenderer.invoke(IPC.CONVERSATION_CREATE, projectId, documentId, title),
  deleteConversation: (id: string) => ipcRenderer.invoke(IPC.CONVERSATION_DELETE, id),
  listMessages: (conversationId: string) => ipcRenderer.invoke(IPC.MESSAGE_LIST, conversationId),

  // AI
  startChatStream: (messages: { role: string; content: string }[]) => ipcRenderer.invoke(IPC.AI_CHAT_STREAM, { messages }),
  onChatStreamChunk: (callback: (content: string) => void) => ipcRenderer.on(IPC.AI_CHAT_STREAM_CHUNK, (_, content) => callback(content)),
  onChatStreamDone: (callback: () => void) => ipcRenderer.on(IPC.AI_CHAT_STREAM_DONE, () => callback()),
  onChatStreamError: (callback: (error: string) => void) => ipcRenderer.on(IPC.AI_CHAT_STREAM_ERROR, (_, error) => callback(error)),
  removeChatStreamListeners: () => {
    ipcRenderer.removeAllListeners(IPC.AI_CHAT_STREAM_CHUNK)
    ipcRenderer.removeAllListeners(IPC.AI_CHAT_STREAM_DONE)
    ipcRenderer.removeAllListeners(IPC.AI_CHAT_STREAM_ERROR)
  },

  // 设置
  getSetting: (key: string) => ipcRenderer.invoke(IPC.SETTINGS_GET, key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke(IPC.SETTINGS_SET, key, value),
  getAllSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET_ALL),

  // MKP
  getMkpStatus: () => ipcRenderer.invoke(IPC.MKP_STATUS),
  listMkpServices: () => ipcRenderer.invoke(IPC.MKP_LIST_SERVICES),

  // 文件
  openFileDialog: () => ipcRenderer.invoke(IPC.FILE_OPEN_DIALOG),
  readFile: (filePath: string) => ipcRenderer.invoke(IPC.FILE_READ, filePath),

  // 导出
  exportMarkdown: (content: string, title: string) => ipcRenderer.invoke(IPC.EXPORT_MARKDOWN, content, title),
  exportWord: (content: string, title: string) => ipcRenderer.invoke(IPC.EXPORT_WORD, content, title),
  exportPdf: (htmlContent: string, title: string) => ipcRenderer.invoke(IPC.EXPORT_PDF, htmlContent, title),

  // 窗口
  minimizeWindow: () => ipcRenderer.send(IPC.WINDOW_MINIMIZE),
  maximizeWindow: () => ipcRenderer.send(IPC.WINDOW_MAXIMIZE),
  closeWindow: () => ipcRenderer.send(IPC.WINDOW_CLOSE),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
