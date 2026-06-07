/**
 * 全局常量
 */
import type { AIModelConfig } from './types'

/** 支持的 AI 模型列表 */
export const AI_MODELS: Record<string, AIModelConfig[]> = {
  deepseek: [
    { provider: 'deepseek', model: 'deepseek-chat' },
    { provider: 'deepseek', model: 'deepseek-reasoner' },
  ],
  openai: [
    { provider: 'openai', model: 'gpt-4o' },
    { provider: 'openai', model: 'gpt-4o-mini' },
  ],
}

/** 默认模型 */
export const DEFAULT_MODEL: AIModelConfig = {
  provider: 'deepseek',
  model: 'deepseek-chat',
}

/** 支持的文档类型 */
export const SUPPORTED_FILE_TYPES = ['.md', '.xlsx', '.xls']

/** 应用名称 */
export const APP_NAME = 'OneBook'
