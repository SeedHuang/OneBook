/**
 * AI 服务
 *
 * 集成 mkp-sdk 获取 Token，调用 DeepSeek/OpenAI API 进行流式对话
 */
import { getToken, listServices } from 'mkp-sdk'
import type { SDKCallbacks } from 'mkp-sdk'
import type { AIProvider, AIModelConfig, AIStreamChunk, AnalysisType } from '../../shared/types'
import { getSetting } from './db.service'
import { DEFAULT_MODEL } from '../../shared/constants'
import { createLogger } from '../utils/logger'
import systemPrompt from '../../src/prompts/system.md?raw'
import reviewPrompt from '../../src/prompts/review.md?raw'
import extractPrompt from '../../src/prompts/extract.md?raw'
import generatePrompt from '../../src/prompts/generate.md?raw'

const log = createLogger('ai')

/** API 基础 URL */
const API_URLS: Record<AIProvider, string> = {
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
}

/** 获取 AI Token（根据 token.mode 决定策略） */
export async function getAIToken(provider: AIProvider): Promise<string> {
  const tokenMode = getSetting('token.mode') || 'mkp'

  if (tokenMode === 'manual') {
    // 手动模式: 直接读取用户配置的 API Key
    const manualKey = getSetting('ai.manualKey')
    if (manualKey) {
      log.info(`使用手动配置的 ${provider} API Key`)
      return manualKey
    }
    log.error(`token.mode=manual，但未配置 API Key`)
    throw new Error(`未配置 ${provider} 的 API Key。请在设置中输入 API Key。`)
  }

  // MKP 模式: 优先通过 MKP 获取
  try {
    const result = await getToken(provider, { requester: 'onebook', ...mkpCallbacks() })
    if (result.success && result.token) {
      log.info(`MKP 获取 ${provider} token 成功`)
      return result.token
    }
  } catch (err) {
    log.warn(`MKP 获取 ${provider} token 失败:`, err instanceof Error ? err.message : String(err))
  }

  // MKP 失败时尝试手动 Key 兆底
  const manualKey = getSetting('ai.manualKey')
  if (manualKey) {
    log.info(`MKP 失败，回退到手动配置的 ${provider} API Key`)
    return manualKey
  }

  log.error(`未配置 ${provider} 的 API Key`)
  throw new Error(`未配置 ${provider} 的 API Key。请在设置中配置，或安装 MKP 并配置 ${provider} 服务。`)
}

/** MKP 交互回调 — 避免 stdin 阻塞终端 */
function mkpCallbacks(): SDKCallbacks {
  return {
    onPasswordRequired: async () => {
      const pwd = getSetting('mkp_master_password')
      if (pwd) return pwd
      log.warn('MKP 需要主密码，但未在设置中配置')
      return ''
    },
    onConfirmRequired: async () => {
      log.warn('MKP 需要授权确认，自动拒绝')
      return false
    },
    onSelectRequired: async (_msg, choices) => {
      log.warn('MKP 需要选择服务，自动选第一个:', choices[0])
      return choices[0] ?? ''
    },
  }
}

/** 检查 MKP daemon 状态 */
export async function checkMkpStatus(): Promise<{ available: boolean; services: string[] }> {
  try {
    const result = await listServices({ timeout: 5000, ...mkpCallbacks() })
    log.info('MKP 状态检查:', result.success ? '可用' : '不可用', '服务:', result.services)
    return { available: result.success, services: result.services ?? [] }
  } catch (err) {
    log.warn('MKP 状态检查失败:', err instanceof Error ? err.message : String(err))
    return { available: false, services: [] }
  }
}

/** 获取当前选中的模型配置 */
export function getCurrentModel(): AIModelConfig {
  const providerStr = getSetting('ai.provider')
  const modelStr = getSetting('ai.model')
  if (providerStr && modelStr) {
    log.debug('使用自定义模型:', providerStr, modelStr)
    return { provider: providerStr as AIProvider, model: modelStr }
  }
  log.debug('使用默认模型:', DEFAULT_MODEL.provider, DEFAULT_MODEL.model)
  return DEFAULT_MODEL
}

/** 分析类型对应的系统 Prompt（从 md 文件加载） */
const ANALYSIS_PROMPTS: Record<AnalysisType, string> = {
  review: `${systemPrompt}\n\n---\n\n${reviewPrompt}`,
  extract: `${systemPrompt}\n\n---\n\n${extractPrompt}`,
  generate: `${systemPrompt}\n\n---\n\n${generatePrompt}`,
}

/** 流式调用 AI API */
export async function* streamChat(
  messages: { role: string; content: string }[],
  model?: AIModelConfig
): AsyncGenerator<AIStreamChunk> {
  const config = model ?? getCurrentModel()
  log.info(`流式对话开始: provider=${config.provider}, model=${config.model}, 消息数=${messages.length}`)

  const token = await getAIToken(config.provider)

  const response = await fetch(API_URLS[config.provider], {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    log.error(`API 请求失败: ${response.status}`, errText)
    yield { type: 'error', error: `API 请求失败 (${response.status}): ${errText}` }
    return
  }

  const reader = response.body?.getReader()
  if (!reader) {
    log.error('无法读取响应流')
    yield { type: 'error', error: '无法读取响应流' }
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let chunkCount = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      chunkCount++
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          log.info(`流式对话结束: 共 ${chunkCount} 次读取`)
          yield { type: 'done' }
          return
        }
        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            yield { type: 'chunk', content }
          }
        } catch {
          // 忽略解析错误
        }
      }
    }
    log.info(`流式对话自然结束: 共 ${chunkCount} 次读取`)
    yield { type: 'done' }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    log.error('流式对话异常:', errMsg)
    yield { type: 'error', error: errMsg }
  }
}

/** 构建分析消息 */
export function buildAnalysisMessages(
  analysisType: AnalysisType,
  documentContent: string,
  userMessage?: string
): { role: string; content: string }[] {
  return [
    { role: 'system', content: ANALYSIS_PROMPTS[analysisType] },
    { role: 'user', content: userMessage ?? `请分析以下需求文档：\n\n${documentContent}` },
  ]
}
