/**
 * AI 服务
 *
 * 集成 mkp-sdk 获取 Token，调用 DeepSeek/OpenAI API 进行流式对话
 */
import { getToken, listServices } from 'mkp-sdk'
import type { AIProvider, AIModelConfig, AIStreamChunk, AnalysisType } from '../../shared/types'
import { getSetting } from './db.service'
import { DEFAULT_MODEL } from '../../shared/constants'

/** API 基础 URL */
const API_URLS: Record<AIProvider, string> = {
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
}

/** 获取 AI Token（MKP 优先，手动兜底） */
export async function getAIToken(provider: AIProvider): Promise<string> {
  // 优先尝试 MKP
  try {
    const result = await getToken(provider, { requester: 'onebook' })
    if (result.success && result.token) return result.token
  } catch {
    // MKP 不可用，继续
  }
  // 回退到手动 Key
  const manualKey = getSetting(`${provider}_api_key`)
  if (manualKey) return manualKey
  throw new Error(`未配置 ${provider} 的 API Key。请在设置中配置，或安装 MKP 并配置 ${provider} 服务。`)
}

/** 检查 MKP daemon 状态 */
export async function checkMkpStatus(): Promise<{ available: boolean; services: string[] }> {
  try {
    const result = await listServices({ timeout: 5000 })
    return { available: result.success, services: result.services ?? [] }
  } catch {
    return { available: false, services: [] }
  }
}

/** 获取当前选中的模型配置 */
export function getCurrentModel(): AIModelConfig {
  const providerStr = getSetting('ai_provider')
  const modelStr = getSetting('ai_model')
  if (providerStr && modelStr) {
    return { provider: providerStr as AIProvider, model: modelStr }
  }
  return DEFAULT_MODEL
}

/** 分析类型对应的系统 Prompt */
const ANALYSIS_PROMPTS: Record<AnalysisType, string> = {
  review: `你是一位资深的需求分析师。请对以下需求文档进行审查，检查：
1. 矛盾检测 — 不同部分的逻辑冲突
2. 歧义标注 — 表述不清的需求
3. 完整性检查 — 遗漏的功能或边界条件
4. 改进建议

对每个问题标注严重性（高/中/低），按优先级排列输出。`,

  extract: `你是一位资深的需求分析师。请从以下需求文档中提取结构化信息：
1. 功能点列表
2. 角色与权限识别
3. 业务流程梳理
4. 数据实体识别
以结构化 JSON 格式输出。`,

  generate: `你是一位资深的需求分析师。请基于以下需求文档生成：
1. 测试用例（含前置条件、步骤、预期结果）
2. 用户故事（As a... I want... So that... 格式）
3. 开发任务拆分（含优先级和估算）
4. 验收标准定义`,
}

/** 流式调用 AI API */
export async function* streamChat(
  messages: { role: string; content: string }[],
  model?: AIModelConfig
): AsyncGenerator<AIStreamChunk> {
  const config = model ?? getCurrentModel()
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
    yield { type: 'error', error: `API 请求失败 (${response.status}): ${errText}` }
    return
  }

  const reader = response.body?.getReader()
  if (!reader) {
    yield { type: 'error', error: '无法读取响应流' }
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') {
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
    yield { type: 'done' }
  } catch (err) {
    yield { type: 'error', error: err instanceof Error ? err.message : String(err) }
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
