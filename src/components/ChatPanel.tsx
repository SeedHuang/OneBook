import { useState, useRef, useEffect } from 'react'
import { Input, Button, Space, Typography, Dropdown, Tag, App, Avatar, Spin } from 'antd'
import {
  SendOutlined,
  RobotOutlined,
  UserOutlined,
  SearchOutlined,
  BulbOutlined,
  FileTextOutlined,
  PlusOutlined,
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
    currentConversation, messages, streaming, streamContent,
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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1a1a1a' }}>
      {/* 头部 */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #303030', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <RobotOutlined style={{ color: '#89b4fa' }} />
          <Text strong style={{ fontSize: 13 }}>AI 助手</Text>
          {currentDocument && <Tag color="blue" style={{ fontSize: 11 }}>{currentDocument.name}</Tag>}
        </Space>
        <Button type="text" size="small" icon={<PlusOutlined />} onClick={handleNewConversation} />
      </div>

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
