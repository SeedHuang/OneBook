/**
 * IPC 通道常量定义
 *
 * 主进程和渲染进程通信的通道名称
 */
export const IPC = {
  // 项目
  PROJECT_LIST: 'project:list',
  PROJECT_CREATE: 'project:create',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',

  // 文档
  DOCUMENT_LIST: 'document:list',
  DOCUMENT_IMPORT: 'document:import',
  DOCUMENT_DELETE: 'document:delete',
  DOCUMENT_GET: 'document:get',

  // 对话
  CONVERSATION_LIST: 'conversation:list',
  CONVERSATION_CREATE: 'conversation:create',
  CONVERSATION_UPDATE: 'conversation:update',
  CONVERSATION_DELETE: 'conversation:delete',
  MESSAGE_LIST: 'message:list',
  MESSAGE_SEND: 'message:send',
  MESSAGE_DELETE: 'message:delete',

  // AI
  AI_CHAT_STREAM: 'ai:chat:stream',
  AI_CHAT_STREAM_CHUNK: 'ai:chat:stream:chunk',
  AI_CHAT_STREAM_DONE: 'ai:chat:stream:done',
  AI_CHAT_STREAM_ERROR: 'ai:chat:stream:error',
  AI_ANALYZE: 'ai:analyze',

  // 设置
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:get-all',

  // MKP
  MKP_STATUS: 'mkp:status',
  MKP_LIST_SERVICES: 'mkp:list-services',

  // 文件
  FILE_OPEN_DIALOG: 'file:open-dialog',
  FILE_READ: 'file:read',

  // 导出
  EXPORT_PDF: 'export:pdf',
  EXPORT_WORD: 'export:word',
  EXPORT_MARKDOWN: 'export:markdown',
  EXPORT_EXCEL: 'export:excel',

  // 窗口
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',

  // 日志
  LOG_LIST: 'log:list',
  LOG_READ: 'log:read',
  LOG_CLEAR: 'log:clear',
} as const
