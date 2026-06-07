/**
 * OneBook 共享类型定义
 *
 * 主进程和渲染进程共用的 TypeScript 类型
 */

/** 项目 */
export interface Project {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
}

/** 文档 */
export interface Document {
  id: string
  project_id: string
  name: string
  type: 'md' | 'xlsx' | 'html'
  content: string
  source: 'local' | 'git' | 'url'
  file_path: string | null
  created_at: string
}

/** 对话 */
export interface Conversation {
  id: string
  project_id: string
  document_id: string | null
  title: string
  created_at: string
}

/** 消息 */
export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  /** 消息类型：'text' 普通消息，'schedule' 排期方案（显示下载按钮） */
  content_type?: 'text' | 'schedule'
  created_at: string
}

/** 分析记录 */
export interface Analysis {
  id: string
  document_id: string
  type: 'review' | 'extract' | 'generate'
  result: string // JSON
  created_at: string
}

/** AI 提供商 */
export type AIProvider = 'deepseek' | 'openai'

/** AI 模型配置 */
export interface AIModelConfig {
  provider: AIProvider
  model: string
}

/** 分析类型 */
export type AnalysisType = 'review' | 'extract' | 'generate'

/** 严重性级别 */
export type Severity = 'high' | 'medium' | 'low'

/** AI 流式响应 chunk */
export interface AIStreamChunk {
  type: 'chunk' | 'done' | 'error'
  content?: string
  error?: string
}

/** 创建项目参数 */
export interface CreateProjectParams {
  name: string
  description?: string
}

/** 导入文档参数 */
export interface ImportDocumentParams {
  project_id: string
  source: 'local' | 'git' | 'url'
  file_path?: string
  url?: string
  git_repo?: string
  git_branch?: string
  git_path?: string
}

/** 发送消息参数 */
export interface SendMessageParams {
  conversation_id: string
  content: string
  content_type?: 'text' | 'schedule'
  document_id?: string
}
