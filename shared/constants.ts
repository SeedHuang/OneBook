/**
 * 全局常量
 */
import type { AIModelConfig } from './types'

/** 支持的 AI 模型列表 */
export const AI_MODELS: Record<string, AIModelConfig[]> = {
  deepseek: [
    { provider: 'deepseek', model: 'deepseek-v4-flash' },
    { provider: 'deepseek', model: 'deepseek-v4-pro' },
  ],
  openai: [
    { provider: 'openai', model: 'gpt-4o' },
    { provider: 'openai', model: 'gpt-4o-mini' },
  ],
}

/** 默认模型 */
export const DEFAULT_MODEL: AIModelConfig = {
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
}

/** 已知模型的 context window 默认值（tokens） */
export const KNOWN_CONTEXT_WINDOWS: Record<string, number> = {
  'deepseek-v4-flash': 1048576,  // 1M
  'deepseek-v4-pro': 1048576,    // 1M
  'deepseek-chat': 65536,        // 64K (已弃用 2026/07/24)
  'deepseek-reasoner': 65536,    // 64K (已弃用 2026/07/24)
  'gpt-4o': 131072,              // 128K
  'gpt-4o-mini': 131072,         // 128K
}

/** 默认 context window（未知模型） */
export const DEFAULT_CONTEXT_WINDOW = 131072

/** 支持的文档类型 */
export const SUPPORTED_FILE_TYPES = ['.md', '.xlsx', '.xls', '.html', '.htm']

/** 应用名称 */
export const APP_NAME = 'OneBook'
