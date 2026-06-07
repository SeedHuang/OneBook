import { useState, useRef, useEffect, Fragment } from 'react'
import { Input, Button, Space, Typography, Dropdown, Tag, App, Avatar, Select, Popconfirm, Progress, Tooltip } from 'antd'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  SendOutlined,
  RobotOutlined,
  UserOutlined,
  SearchOutlined,
  BulbOutlined,
  FileTextOutlined,
  PlusOutlined,
  ExportOutlined,
  DeleteOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileMarkdownOutlined,
  FileExcelOutlined,
  DownloadOutlined,
  LoadingOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useChatStore } from '../stores/chatStore'
import { useDocumentStore } from '../stores/documentStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { Message } from '../../shared/types'
import systemPrompt from '../prompts/system.md?raw'
import reviewPrompt from '../prompts/review.md?raw'
import extractPrompt from '../prompts/extract.md?raw'
import generatePrompt from '../prompts/generate.md?raw'
import { getContextRingColor, formatContextTokens, getContextPercent } from './contextRing'

const { Text } = Typography
const { TextArea } = Input

interface ChatPanelProps {
  projectId: string
}

const QUICK_ACTIONS: MenuProps['items'] = [
  { key: 'review', label: '需求审查', icon: <SearchOutlined /> },
  { key: 'extract', label: '需求提取', icon: <BulbOutlined /> },
  { key: 'generate', label: '生成任务', icon: <FileTextOutlined /> },
]

/** 从 md 文件加载的提示词已替换内联常量 */

export default function ChatPanel({ projectId }: ChatPanelProps) {
  const { message: msgApi } = App.useApp()
  const {
    conversations, currentConversation, messages, streaming, streamContent,
    setCurrentConversation, setMessages, setStreaming,
    setStreamContent, appendStreamContent, addMessage, addConversation, removeConversation, removeMessages,
  } = useChatStore()
  const { currentDocument, documents } = useDocumentStore()
  const { models, currentModel, loadModels, setDefaultModel, tokenUsage, setTokenUsage } = useSettingsStore()
  const [input, setInput] = useState('')
  const [streamStatus, setStreamStatus] = useState('')
  const [countdown, setCountdown] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pendingMsgRef = useRef<string | null>(null)
  /** 标记下次生成的 assistant 消息应显示“下载排期”按钮 */
  const pendingGenerateRef = useRef(false)
  /** 应显示“下载排期”按钮的 assistant 消息 ID 集合 */
  const [scheduleMsgIds, setScheduleMsgIds] = useState<Set<string>>(new Set())

  // 倒计时完成时自动发送
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => {
      if (countdown === 1 && pendingMsgRef.current !== null) {
        const msg = pendingMsgRef.current
        pendingMsgRef.current = null
        setCountdown(0)
        executeSend(msg)
      } else {
        setCountdown((c) => c - 1)
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  // ESC 键撤回发送
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && countdown > 0) {
        cancelCountdown()
      }
    }
    if (countdown > 0) {
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [countdown])

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamContent])

  // Setup stream listeners
  useEffect(() => {
    window.electronAPI.onChatStreamChunk((content: string) => {
      appendStreamContent(content)
    })
    window.electronAPI.onChatStreamDone(() => {
      setStreaming(false)
    })
    window.electronAPI.onChatStreamError((error: string) => {
      setStreaming(false)
      setStreamStatus('')
      msgApi.error(`AI 响应错误: ${error}`)
    })
    window.electronAPI.onChatStreamUsage((usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) => {
      setTokenUsage(usage)
      // 更新对话的累积 token 数
      const conv = useChatStore.getState().currentConversation
      if (conv) {
        useChatStore.getState().updateConversationTokens(conv.id, usage.total_tokens)
      }
    })
    return () => {
      window.electronAPI.removeChatStreamListeners()
    }
  }, [])

  // 加载模型列表
  useEffect(() => {
    loadModels()
  }, [])

  // 自动选中最近一次对话（进入项目时）
  useEffect(() => {
    if (conversations.length > 0 && !currentConversation) {
      const latest = conversations[0] // DB 按 created_at DESC 排序，第一个就是最新的
      setCurrentConversation(latest)
      loadHistory(latest.id)
    }
  }, [conversations])

  // 加载对话历史消息
  async function loadHistory(conversationId: string) {
    try {
      const msgs = await window.electronAPI.listMessages(conversationId)
      setMessages(msgs)
      // 从 DB 恢复 scheduleMsgIds：标记了 content_type='schedule' 的消息
      const scheduleIds = new Set<string>(
        msgs.filter((m) => m.content_type === 'schedule').map((m) => m.id)
      )
      setScheduleMsgIds(scheduleIds)
    } catch {
      setMessages([])
      setScheduleMsgIds(new Set())
    }
  }

  // 切换对话
  function handleSwitchConversation(convId: string) {
    const conv = conversations.find((c) => c.id === convId)
    if (conv) {
      setCurrentConversation(conv)
      loadHistory(conv.id)
      // 对话切换时从对话的 total_tokens 恢复 token 统计
      setTokenUsage(conv.total_tokens > 0
        ? { prompt_tokens: conv.total_tokens, completion_tokens: 0, total_tokens: conv.total_tokens }
        : null
      )
    }
  }

  async function handleNewConversation() {
    try {
      const conv = await window.electronAPI.createConversation(
        projectId,
        currentDocument?.id ?? null,
        '新对话'
      )
      addConversation(conv)
      setCurrentConversation(conv)
      setMessages([])
      setTokenUsage(null)
    } catch {
      msgApi.error('创建对话失败')
    }
  }

  /** 开始发送倒计时（对外接口） */
  function requestSend(content?: string) {
    const text = content || input.trim()
    if (!text || streaming || countdown > 0) return
    pendingMsgRef.current = text
    setInput('')
    setCountdown(2)
  }

  /** 取消发送倒计时 */
  function cancelCountdown() {
    if (pendingMsgRef.current !== null) {
      setInput(pendingMsgRef.current)
      pendingMsgRef.current = null
    }
    setCountdown(0)
  }

  /** 从消息中提取对话标题：优先取 "# 任务：XXX" 标题，否则取首行前30字 */
  function extractTitle(text: string): string {
    const taskMatch = text.match(/^#\s*任务[：:]\s*(.+)/m)
    if (taskMatch) return taskMatch[1].trim()
    const firstLine = text.split(/[\n\r]/)[0].trim()
    return firstLine.slice(0, 30) || 'AI 对话'
  }

  /** 实际发送消息（倒计时结束后调用） */
  async function executeSend(text: string) {

    // Create conversation if none
    let conv = currentConversation
    if (!conv) {
      try {
        const newConv = await window.electronAPI.createConversation(projectId, currentDocument?.id ?? null, extractTitle(text))
        addConversation(newConv)
        setCurrentConversation(newConv)
        conv = newConv
      } catch {
        msgApi.error('创建对话失败')
        return
      }
    }

    const activeConv = conv!

    // 自动更新对话标题（首条消息前30字）
    if (messages.length === 0 && activeConv.title === '新对话') {
      try {
        await window.electronAPI.updateConversationTitle(activeConv.id, extractTitle(text))
      } catch { /* ignore */ }
    }

    // 持久化用户消息，使用 DB 返回的 UUID
    let userMsgId: string
    try {
      const persisted = await window.electronAPI.sendMessage({ conversation_id: activeConv.id, content: text, role: 'user' })
      userMsgId = persisted.id
    } catch {
      // 持久化失败时用临时 ID，不阻断 UI
      userMsgId = Date.now().toString()
    }

    // Add user message locally
    const userMsg: Message = {
      id: userMsgId,
      conversation_id: activeConv.id,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }
    addMessage(userMsg)
    setStreaming(true)
    setStreamContent('')

    // 构建文档上下文并显示发送状态
    setStreamStatus(`正在准备 ${documents.length} 份文档...`)
    const DOC_TYPE_LABEL: Record<string, string> = {
      md: '📄 需求文档',
      html: '🎨 设计稿',
      xlsx: '📊 数据文档',
    }
    const docContext = documents.length > 0
      ? documents.map((d) => {
          const label = DOC_TYPE_LABEL[d.type] || '📄 文档'
          return `### ${label}：${d.name}\n${d.content || '(内容为空)'}`
        }).join('\n\n---\n\n')
      : '(未导入任何文档)'
    const systemMsg = {
      role: 'system' as const,
      content: `${systemPrompt}\n\n---\n\n## 以下是用户提供的项目文档\n\n${docContext}`,
    }
    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))
    const apiMessages = [systemMsg, ...history]

    setStreamStatus(`正在发送 ${documents.length} 份文档 (${documents.map((d) => d.name).join(', ')})，等待 AI 响应...`)

    try {
      await window.electronAPI.startChatStream(apiMessages)
      setStreamStatus('')
      // Stream will come via event listeners
      // When done, save the assistant message
      const checkDone = setInterval(() => {
        const { streaming: isStreaming, streamContent: sc } = useChatStore.getState()
        if (!isStreaming && sc) {
          clearInterval(checkDone)
          // 判断是否为排期消息
          const isSchedule = pendingGenerateRef.current
          if (isSchedule) pendingGenerateRef.current = false
          // 持久化 AI 回复（带 content_type 标记）
          const contentType = isSchedule ? 'schedule' : 'text'
          window.electronAPI.sendMessage({ conversation_id: activeConv!.id, content: sc, role: 'assistant', content_type: contentType })
            .then((persisted) => {
              const assistantMsg: Message = { ...persisted }
              addMessage(assistantMsg)
              if (isSchedule) {
                setScheduleMsgIds((prev) => new Set(prev).add(assistantMsg.id))
              }
            })
            .catch((err) => {
              // 持久化失败时用临时 ID，不阻断 UI
              console.error('AI 回复持久化失败:', err)
              const assistantMsg: Message = {
                id: (Date.now() + 1).toString(),
                conversation_id: activeConv!.id,
                role: 'assistant',
                content: sc,
                created_at: new Date().toISOString(),
              }
              addMessage(assistantMsg)
              if (isSchedule) {
                setScheduleMsgIds((prev) => new Set(prev).add(assistantMsg.id))
              }
            })
          setStreamContent('')
        }
      }, 100)
    } catch (e: any) {
      setStreaming(false)
      setStreamStatus('')
      msgApi.error(e?.message || '发送失败')
    }
  }

  function handleQuickAction(key: string) {
    const docNames = documents.map((d) => `「${d.name}」`).join('、') || '项目文档'
    const prompts: Record<string, string> = {
      review: reviewPrompt.replace('{{docNames}}', docNames),
      extract: extractPrompt.replace('{{docNames}}', docNames),
      generate: generatePrompt.replace('{{docNames}}', docNames),
    }
    if (key === 'generate') {
      pendingGenerateRef.current = true
    }
    requestSend(prompts[key])
  }

  /** 撤回一组问答（删除用户消息 + AI回复） */
  async function handleRetract(userMsgId: string) {
    // 找到紧随该用户消息后的 assistant 消息
    const idx = messages.findIndex((m) => m.id === userMsgId)
    const idsToRemove = [userMsgId]
    if (idx >= 0 && idx + 1 < messages.length && messages[idx + 1].role === 'assistant') {
      idsToRemove.push(messages[idx + 1].id)
    }
    // 从数据库和状态中删除
    try {
      await window.electronAPI.deleteMessage(userMsgId)
      removeMessages(idsToRemove)
    } catch {
      msgApi.error('撤回失败')
    }
  }

  /** 导出对话内容为报告 */
  async function handleExport(format: 'pdf' | 'word' | 'markdown' | 'excel') {
    // 将对话消息拼接为报告内容
    const title = currentConversation?.title || 'AI 分析报告'
    const reportContent = messages
      .map((m) => `## ${m.role === 'user' ? '用户提问' : 'AI 回答'}\n\n${m.content}`)
      .join('\n\n---\n\n')

    try {
      if (format === 'markdown') {
        await window.electronAPI.exportMarkdown(reportContent, title)
      } else if (format === 'word') {
        await window.electronAPI.exportWord(reportContent, title)
      } else if (format === 'excel') {
        await window.electronAPI.exportExcel(reportContent, title)
      } else if (format === 'pdf') {
        // 简单 HTML 包装用于 PDF 导出
        const html = `<h1>${title}</h1>${messages.map((m) => `<h2>${m.role === 'user' ? '用户提问' : 'AI 回答'}</h2><div>${m.content.replace(/\n/g, '<br/>')}</div>`).join('<hr/>')}`
        await window.electronAPI.exportPdf(html, title)
      }
      msgApi.success(`${format.toUpperCase()} 导出成功`)
    } catch {
      msgApi.error('导出失败')
    }
  }

  const exportItems: MenuProps['items'] = [
    { key: 'pdf', label: '导出 PDF', icon: <FilePdfOutlined /> },
    { key: 'word', label: '导出 Word', icon: <FileWordOutlined /> },
    { key: 'excel', label: '导出排期', icon: <FileExcelOutlined /> },
    { key: 'markdown', label: '导出 Markdown', icon: <FileMarkdownOutlined /> },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1a1a1a' }}>
      {/* 头部 */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #303030', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <RobotOutlined style={{ color: '#89b4fa' }} />
          <Text strong style={{ fontSize: 13 }}>AI 助手</Text>
          {currentDocument && <Tag color="blue" style={{ fontSize: 11 }}>{documents.length} 份文档已加载</Tag>}
        </Space>
        <Space>
          {messages.length > 0 && (
            <Dropdown menu={{ items: exportItems, onClick: ({ key }) => handleExport(key as 'pdf' | 'word' | 'markdown' | 'excel') }} trigger={['click']}>
              <Button type="text" size="small" icon={<ExportOutlined />} />
            </Dropdown>
          )}
          <Button type="text" size="small" icon={<PlusOutlined />} onClick={handleNewConversation} />
        </Space>
      </div>

      {/* 对话切换选择器 + 删除 */}
      {conversations.length > 0 && (
        <div style={{ padding: '4px 12px', borderBottom: '1px solid #252525', display: 'flex', gap: 4 }}>
          <Select
            size="small"
            style={{ flex: 1 }}
            value={currentConversation?.id}
            onChange={handleSwitchConversation}
            placeholder="选择对话"
            options={conversations.map((c) => ({ label: c.title || '未命名对话', value: c.id }))}
          />
          <Popconfirm
            title="删除此对话？"
            onConfirm={async () => {
              if (currentConversation) {
                try {
                  await window.electronAPI.deleteConversation(currentConversation.id)
                  removeConversation(currentConversation.id)
                } catch {
                  msgApi.error('删除失败')
                }
              }
            }}
            okText="删除"
            cancelText="取消"
          >
            <Button type="text" size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </div>
      )}

      {/* 消息列表 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {messages.length === 0 && !streaming ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: '#666' }}>
            <RobotOutlined style={{ fontSize: 40, marginBottom: 12, color: '#89b4fa' }} />
            <div style={{ marginBottom: 16 }}>你好！我可以帮你分析需求文档</div>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button block type="dashed" onClick={() => handleQuickAction('review')} disabled={documents.length === 0}>
                审查所有文档
              </Button>
              <Button block type="dashed" onClick={() => handleQuickAction('extract')} disabled={documents.length === 0}>
                提取需求要点
              </Button>
              <Button block type="dashed" onClick={() => handleQuickAction('generate')} disabled={documents.length === 0}>
                生成开发任务
              </Button>
            </Space>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <Fragment key={msg.id}>
              <div
                style={{ marginBottom: 16, display: 'flex', gap: 8, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}
                className="chat-msg-row"
              >
                <Avatar
                  size={28}
                  icon={msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                  style={{ background: msg.role === 'user' ? '#89b4fa' : '#a6e3a1', flexShrink: 0 }}
                />
                <div style={{
                  maxWidth: '85%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: msg.role === 'user' ? '#2a2a3a' : '#1f2f1f',
                  fontSize: 13,
                  lineHeight: 1.6,
                  wordBreak: 'break-word',
                }}>
                  {msg.role === 'assistant' ? (
                    <div className="chat-markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                  )}
                </div>
                {msg.role === 'user' && !streaming && (
                  <Popconfirm
                    title="撤回这组问答？"
                    description="该提问和 AI 回复将从上下文中移除"
                    onConfirm={() => handleRetract(msg.id)}
                    okText="撤回"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      className="chat-msg-retract-btn"
                      style={{ color: '#f38ba8', flexShrink: 0, alignSelf: 'flex-start' }}
                    />
                  </Popconfirm>
                )}
              </div>
                {/* 下载排期按钮：仅在“生成任务”触发的 AI 回复下方显示 */}
                {msg.role === 'assistant' && scheduleMsgIds.has(msg.id) && (
                  <div style={{ marginLeft: 36, marginTop: -8, marginBottom: 8 }}>
                    <Button
                      type="link"
                      size="small"
                      icon={<DownloadOutlined />}
                      onClick={async () => {
                        const title = currentConversation?.title || 'AI 分析报告'
                        try {
                          await window.electronAPI.exportExcel(msg.content, title)
                          msgApi.success('排期导出成功')
                        } catch {
                          msgApi.error('导出失败')
                        }
                      }}
                    >
                      下载排期
                    </Button>
                  </div>
                )}
              </Fragment>
            ))}

            {/* 流式响应中 */}
            {streaming && (
              <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
                <Avatar size={28} icon={<RobotOutlined />} style={{ background: '#a6e3a1', flexShrink: 0 }} />
                <div style={{
                  maxWidth: '85%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: '#1f2f1f',
                  fontSize: 13,
                  lineHeight: 1.6,
                  wordBreak: 'break-word',
                }}>
                  {streamContent ? (
                    <div className="chat-markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamContent}</ReactMarkdown>
                    </div>
                  ) : (
                    <div style={{ color: '#89b4fa' }}>
                      <LoadingOutlined style={{ marginRight: 8 }} />
                      {streamStatus || '正在等待 AI 响应...'}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 快捷操作 */}
      {messages.length > 0 && documents.length > 0 && (
        <div style={{ padding: '4px 12px', display: 'flex', gap: 4 }}>
          <Dropdown menu={{ items: QUICK_ACTIONS, onClick: ({ key }) => handleQuickAction(key) }} trigger={['click']}>
            <Button size="small" type="dashed">快捷分析</Button>
          </Dropdown>
        </div>
      )}

      {/* 发送倒计时提示 */}
      {countdown > 0 && (
        <div style={{
          padding: '6px 12px',
          background: '#2a2a3a',
          borderTop: '1px solid #303030',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 12,
          color: '#f9e2af',
        }}>
          <span>⏱ {countdown}s 后发送...</span>
          <Button type="text" size="small" onClick={cancelCountdown} style={{ color: '#f38ba8', fontSize: 12 }}>
            撤回 (ESC)
          </Button>
        </div>
      )}

      {/* 输入区 */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid #303030' }}>
        {/* 模型选择 + Context 环形图 */}
        {currentModel && (() => {
          const usedTokens = tokenUsage?.prompt_tokens ?? currentConversation?.total_tokens ?? 0
          const percent = getContextPercent(usedTokens, currentModel.context_window)
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Select
                size="small"
                value={currentModel.id}
                onChange={async (id) => {
                  await setDefaultModel(id)
                  msgApi.success('已切换模型')
                }}
                options={models.map(m => ({ label: m.model_name, value: m.id }))}
                style={{ flex: 1 }}
                placeholder="选择模型"
              />
              <Tooltip title={
                tokenUsage
                  ? `Prompt: ${tokenUsage.prompt_tokens.toLocaleString()} | Completion: ${tokenUsage.completion_tokens.toLocaleString()} | Total: ${tokenUsage.total_tokens.toLocaleString()}`
                  : `对话累积: ${usedTokens.toLocaleString()} tokens`
              }>
                <Progress
                  type="circle"
                  percent={percent}
                  size={28}
                  strokeColor={getContextRingColor(percent)}
                  format={() => formatContextTokens(usedTokens)}
                />
              </Tooltip>
            </div>
          )
        })()}
        <Space.Compact style={{ width: '100%' }}>
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息... (Enter 发送)"
            autoSize={{ minRows: 1, maxRows: 4 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault()
                requestSend()
              }
            }}
            disabled={streaming || countdown > 0}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => requestSend()}
            loading={streaming}
            disabled={countdown > 0}
            style={{ height: 'auto' }}
          />
        </Space.Compact>
      </div>
    </div>
  )
}
