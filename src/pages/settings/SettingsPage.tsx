import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Select, Input, Button, Space, Typography, Tag, App, Radio, Modal, List } from 'antd'
import { ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined, ApiOutlined, DeleteOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons'
import { useSettingsStore } from '../../stores/settingsStore'
import type { AIProvider } from '../../../shared/types'

const { Title, Text } = Typography

export default function SettingsPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const {
    provider, model, tokenMode, manualKey, mkpPassword, mkpConnected,
    setProvider, setModel, setTokenMode, setManualKey, setMkpPassword, setMkpConnected, loadSettings,
  } = useSettingsStore()
  const [saving, setSaving] = useState(false)
  const [logFiles, setLogFiles] = useState<string[]>([])
  const [logViewOpen, setLogViewOpen] = useState(false)
  const [logContent, setLogContent] = useState('')
  const [logViewTitle, setLogViewTitle] = useState('')
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      await window.electronAPI.setSetting('ai.provider', provider)
      await window.electronAPI.setSetting('ai.model', model)
      await window.electronAPI.setSetting('token.mode', tokenMode)
      if (tokenMode === 'manual') {
        await window.electronAPI.setSetting('ai.manualKey', manualKey)
      }
      if (mkpPassword) {
        await window.electronAPI.setSetting('mkp_master_password', mkpPassword)
      }
      message.success('设置已保存')
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleCheckMkp() {
    try {
      const status = await window.electronAPI.getMkpStatus()
      setMkpConnected(status?.available ?? false)
      if (status?.available) {
        message.success('MKP 连接正常')
      } else {
        message.warning('MKP daemon 未连接')
      }
    } catch {
      setMkpConnected(false)
      message.error('MKP 状态检查失败')
    }
  }

  // ---- 日志管理 ----

  async function handleLoadLogs() {
    try {
      const files = await window.electronAPI.listLogFiles()
      setLogFiles(files)
    } catch {
      message.error('加载日志列表失败')
    }
  }

  async function handleViewLog(filename: string) {
    try {
      const content = await window.electronAPI.readLogFile(filename)
      setLogContent(content || '（空文件）')
      setLogViewTitle(filename)
      setLogViewOpen(true)
    } catch {
      message.error('读取日志失败')
    }
  }

  async function handleClearLogs() {
    try {
      const result = await window.electronAPI.clearLogs()
      message.success(`已清除 ${result.deleted} 个日志文件`)
      setLogFiles([])
    } catch {
      message.error('清除日志失败')
    }
  }

  const modelOptions = provider === 'deepseek'
    ? [
        { label: 'deepseek-chat', value: 'deepseek-chat' },
        { label: 'deepseek-reasoner', value: 'deepseek-reasoner' },
      ]
    : [
        { label: 'gpt-4o', value: 'gpt-4o' },
        { label: 'gpt-4o-mini', value: 'gpt-4o-mini' },
        { label: 'gpt-4-turbo', value: 'gpt-4-turbo' },
      ]

  return (
    <div style={{ height: '100vh', background: '#141414', overflow: 'auto' }}>
      {/* 头部 */}
      <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #303030' }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
        <Title level={4} style={{ margin: 0 }}>设置</Title>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: 24 }}>
        {/* AI 提供商 */}
        <Card title="AI 模型配置" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text>提供商</Text>
              <Select
                value={provider}
                onChange={(v: AIProvider) => {
                  setProvider(v)
                  setModel(v === 'deepseek' ? 'deepseek-chat' : 'gpt-4o')
                }}
                style={{ width: '100%', marginTop: 4 }}
                options={[
                  { label: 'DeepSeek', value: 'deepseek' },
                  { label: 'OpenAI', value: 'openai' },
                ]}
              />
            </div>
            <div>
              <Text>模型</Text>
              <Select
                value={model}
                onChange={setModel}
                style={{ width: '100%', marginTop: 4 }}
                options={modelOptions}
              />
            </div>
          </Space>
        </Card>

        {/* Token 获取方式 */}
        <Card title="Token 获取方式" style={{ marginBottom: 16 }}>
          <Radio.Group
            value={tokenMode}
            onChange={(e) => setTokenMode(e.target.value)}
            style={{ marginBottom: 16 }}
          >
            <Space direction="vertical">
              <Radio value="mkp">
                <Space>
                  <ApiOutlined />
                  MKP 自动获取（推荐）
                  {mkpConnected ? (
                    <Tag icon={<CheckCircleOutlined />} color="success">已连接</Tag>
                  ) : (
                    <Tag icon={<CloseCircleOutlined />} color="error">未连接</Tag>
                  )}
                </Space>
              </Radio>
              <Radio value="manual">手动输入 API Key</Radio>
            </Space>
          </Radio.Group>

          {tokenMode === 'mkp' && (
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <Text>MKP 主密码（可选，用于连接 daemon）</Text>
                <Input.Password
                  value={mkpPassword}
                  onChange={(e) => setMkpPassword(e.target.value)}
                  placeholder="输入 MKP master password"
                  style={{ marginTop: 4 }}
                />
              </div>
              <Button onClick={handleCheckMkp}>检查 MKP 连接</Button>
            </Space>
          )}

          {tokenMode === 'manual' && (
            <div>
              <Text>API Key</Text>
              <Input.Password
                value={manualKey}
                onChange={(e) => setManualKey(e.target.value)}
                placeholder="输入你的 API Key"
                style={{ marginTop: 4 }}
              />
            </div>
          )}
        </Card>

        {/* 保存 */}
        <Button type="primary" block size="large" loading={saving} onClick={handleSave}>
          保存设置
        </Button>

        {/* 日志管理 */}
        <Card
          title="日志管理"
          style={{ marginTop: 24 }}
          extra={
            <Space>
              <Button size="small" icon={<ReloadOutlined />} onClick={handleLoadLogs}>刷新</Button>
              <Button size="small" danger icon={<DeleteOutlined />} loading={clearing} onClick={async () => {
                setClearing(true)
                await handleClearLogs()
                setClearing(false)
              }}>清除全部</Button>
            </Space>
          }
        >
          {logFiles.length === 0 ? (
            <Text type="secondary">暂无日志文件，点击上方「刷新」加载</Text>
          ) : (
            <List
              size="small"
              dataSource={logFiles}
              renderItem={(file: string) => (
                <List.Item
                  actions={[
                    <Button
                      type="link"
                      size="small"
                      icon={<FileTextOutlined />}
                      onClick={() => handleViewLog(file)}
                    >查看</Button>
                  ]}
                >
                  {file}
                </List.Item>
              )}
            />
          )}
        </Card>

        {/* 日志查看弹窗 */}
        <Modal
          title={logViewTitle}
          open={logViewOpen}
          onCancel={() => setLogViewOpen(false)}
          footer={null}
          width={900}
          styles={{ body: { maxHeight: '60vh', overflow: 'auto' } }}
        >
          <pre style={{
            background: '#1a1a1a',
            color: '#d4d4d4',
            padding: 16,
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            margin: 0,
          }}>
            {logContent}
          </pre>
        </Modal>
      </div>
    </div>
  )
}
