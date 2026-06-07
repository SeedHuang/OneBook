import { useState, useRef, useEffect } from 'react'
import { Input, Button, Space, Typography, Dropdown, Tag, App, Avatar, Spin, Select } from 'antd'
import {
  SendOutlined,
  RobotOutlined,
  UserOutlined,
  SearchOutlined,
  BulbOutlined,
  FileTextOutlined,
  PlusOutlined,
  ExportOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileMarkdownOutlined,
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

export default function ChatPanel({ projectId }: ChatPanelProps) {
  const { message: msgApi } = App.useApp()
  const {
    conversations, currentConversation, messages, streaming, streamContent,
    setCurrentConversation, setMessages, setStreaming,
    setStreamContent, appendStreamContent, addMessage, addConversation,
  } = useChatStore()
  const { currentDocument } = useDocumentStore()
  const [input, setInput] = useState('')
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

    // Build messages array for API
    const apiMessages = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))

    try {
      await window.electronAPI.startChatStream(apiMessages)
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
      msgApi.error(e?.message || '发送失败')
    }
  }

  function handleQuickAction(key: string) {
    const docName = currentDocument?.name || '当前文档'
    const prompts: Record<string, string> = {
      review: `请对「${docName}」进行需求审查，检查其中的矛盾、遗漏、歧义等问题，并给出改进建议。`,
      extract: `请从「${docName}」中提取关键需求信息，包括功能点、角色、业务流程等，生成结构化摘要。`,
      generate: `请根据「${docName}」的内容，生成开发任务列表和测试用例。`,
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
          {currentDocument && <Tag color="blue" style={{ fontSize: 11 }}>{currentDocument.name}</Tag>}
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

      {/* 对话切换选择器 */}
      {conversations.length > 0 && (
        <div style={{ padding: '4px 12px', borderBottom: '1px solid #252525' }}>
          <Select
            size="small"
            style={{ width: '100%' }}
            value={currentConversation?.id}
            onChange={handleSwitchConversation}
            placeholder="选择对话"
            options={conversations.map((c) => ({ label: c.title || '未命名对话', value: c.id }))}
          />
        </div>
      )}

      {/* 消息列表 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {messages.length === 0 && !streaming ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: '#666' }}>
            <RobotOutlined style={{ fontSize: 40, marginBottom: 12, color: '#89b4fa' }} />
            <div style={{ marginBottom: 16 }}>你好！我可以帮你分析需求文档</div>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button block type="dashed" onClick={() => handleQuickAction('review')} disabled={!currentDocument}>
                审查当前文档
              </Button>
              <Button block type="dashed" onClick={() => handleQuickAction('extract')} disabled={!currentDocument}>
                提取需求要点
              </Button>
              <Button block type="dashed" onClick={() => handleQuickAction('generate')} disabled={!currentDocument}>
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
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {msg.content}
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
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {streamContent || <Spin size="small" />}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 快捷操作 */}
      {messages.length > 0 && currentDocument && (
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
