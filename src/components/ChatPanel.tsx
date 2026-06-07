import { useState, useRef, useEffect } from 'react'
import { Input, Button, Space, Typography, Dropdown, Tag, App, Avatar, Select, Popconfirm } from 'antd'
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
  LoadingOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useChatStore } from '../stores/chatStore'
import { useDocumentStore } from '../stores/documentStore'
import type { Message } from '../../shared/types'

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

/** AI 分析角色定义与结构化分析框架 */
const SYSTEM_PROMPT = `你是一位资深产品架构师和需求分析专家，拥有15年以上的产品设计、需求评审和技术架构经验。你同时具备产品经理、交互设计师和前端工程师的视角。

## 分析原则

1. **不遗漏** — 每个功能点必须拆解到具体的用户操作路径，覆盖正常流程、异常流程和边界条件
2. **不假设** — 文档中未明确说明的内容必须标注为"待确认"，不脑补、不脑测
3. **可执行** — 输出的功能点、任务必须足够具体，开发人员和测试人员可以直接引用
4. **多角色交叉验证** — 分别从产品经理、前端工程师、测试工程师的角度审视，发现单一视角的盲区

## 分析框架

### 阶段一：文档概览
- 列出所有收到的文档名称、类型和大致内容量
- 说明文档间的关联关系（如果有的话）
- 概述项目背景和目标用户

### 阶段二：逐文档深度分析
- **功能模块拆解**: 按业务模块分组，每个模块下列出功能点
- **用户角色识别**: 系统涉及哪些角色，各角色的权限和操作范围
- **交互流程梳理**: 核心操作流程、页面跳转关系、状态变化
- **前端逻辑检查**: 表单验证规则、状态管理、权限控制、异常提示
- **边界条件**: 空数据、加载状态、错误处理、并发场景、极端输入

### 阶段三：交叉验证
- 文档间的一致性检查（同一概念在不同文档中的定义是否冲突）
- 完整性评估（PRD 中的功能点是否都有对应的 UI/交互设计）
- 遗漏检测（基于行业最佳实践，指出可能遗漏的功能点）

### 阶段四：问题与建议
- 按优先级（P0/P1/P2）列出所有发现的问题
- 每个问题给出具体的改进建议
- 标注不确定的部分，建议与产品/设计确认

## 输出要求
- 使用 Markdown 结构化输出，方便后续引用
- 功能点编号格式: [模块]-[编号]（如 ORD-001 订单模块第1个功能点）
- 对于需求描述不清晰的地方，给出你的理解 + "建议确认"
- 根据用户的具体请求调整分析重点，不必每次都输出全部阶段`

export default function ChatPanel({ projectId }: ChatPanelProps) {
  const { message: msgApi } = App.useApp()
  const {
    conversations, currentConversation, messages, streaming, streamContent,
    setCurrentConversation, setMessages, setStreaming,
    setStreamContent, appendStreamContent, addMessage, addConversation, removeConversation,
  } = useChatStore()
  const { currentDocument, documents } = useDocumentStore()
  const [input, setInput] = useState('')
  const [streamStatus, setStreamStatus] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

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
    return () => {
      window.electronAPI.removeChatStreamListeners()
    }
  }, [])

  // 加载对话历史消息
  async function loadHistory(conversationId: string) {
    try {
      const msgs = await window.electronAPI.listMessages(conversationId)
      setMessages(msgs)
    } catch {
      setMessages([])
    }
  }

  // 切换对话
  function handleSwitchConversation(convId: string) {
    const conv = conversations.find((c) => c.id === convId)
    if (conv) {
      setCurrentConversation(conv)
      loadHistory(conv.id)
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
    } catch {
      msgApi.error('创建对话失败')
    }
  }

  async function handleSend(content?: string) {
    const text = content || input.trim()
    if (!text || streaming) return

    // Create conversation if none
    let conv = currentConversation
    if (!conv) {
      try {
        const newConv = await window.electronAPI.createConversation(projectId, currentDocument?.id ?? null, text.slice(0, 30))
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
        await window.electronAPI.updateConversationTitle(activeConv.id, text.slice(0, 30))
      } catch { /* ignore */ }
    }

    // 持久化用户消息
    try {
      await window.electronAPI.sendMessage({ conversation_id: activeConv.id, content: text, role: 'user' })
    } catch {
      // 持久化失败不阻断 UI
    }

    // Add user message locally
    const userMsg: Message = {
      id: Date.now().toString(),
      conversation_id: activeConv.id,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }
    addMessage(userMsg)
    setInput('')
    setStreaming(true)
    setStreamContent('')

    // 构建文档上下文并显示发送状态
    setStreamStatus(`正在准备 ${documents.length} 份文档...`)
    const docContext = documents.length > 0
      ? documents.map((d) => `### ${d.name}\n${d.content || '(内容为空)'}`).join('\n\n---\n\n')
      : '(未导入任何文档)'
    const systemMsg = {
      role: 'system' as const,
      content: `${SYSTEM_PROMPT}\n\n---\n\n## 以下是用户提供的项目文档\n\n${docContext}`,
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
          const assistantMsg: Message = {
            id: (Date.now() + 1).toString(),
            conversation_id: activeConv!.id,
            role: 'assistant',
            content: sc,
            created_at: new Date().toISOString(),
          }
          // 持久化 AI 回复
          window.electronAPI.sendMessage({ conversation_id: activeConv!.id, content: sc, role: 'assistant' }).catch(() => {})
          addMessage(assistantMsg)
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
      review: `请对以下文档进行需求审查，检查其中的矛盾、遗漏、歧义等问题，并给出改进建议：${docNames}`,
      extract: `请从以下文档中提取关键需求信息，包括功能点、角色、业务流程等，生成结构化摘要：${docNames}`,
      generate: `请根据以下文档的内容，生成开发任务列表和测试用例：${docNames}`,
    }
    handleSend(prompts[key])
  }

  /** 导出对话内容为报告 */
  async function handleExport(format: 'pdf' | 'word' | 'markdown') {
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
            <Dropdown menu={{ items: exportItems, onClick: ({ key }) => handleExport(key as 'pdf' | 'word' | 'markdown') }} trigger={['click']}>
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
              <div key={msg.id} style={{ marginBottom: 16, display: 'flex', gap: 8, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
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
              </div>
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

      {/* 输入区 */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid #303030' }}>
        <Space.Compact style={{ width: '100%' }}>
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息... (Enter 发送)"
            autoSize={{ minRows: 1, maxRows: 4 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            disabled={streaming}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => handleSend()}
            loading={streaming}
            style={{ height: 'auto' }}
          />
        </Space.Compact>
      </div>
    </div>
  )
}
