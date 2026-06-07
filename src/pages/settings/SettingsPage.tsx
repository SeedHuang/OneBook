import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Select, Input, Button, Space, Typography, Tag, App, Radio } from 'antd'
import { ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined, ApiOutlined } from '@ant-design/icons'
import { useSettingsStore } from '../../stores/settingsStore'
import type { AIProvider } from '../../../shared/types'

const { Title, Text } = Typography

export default function SettingsPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const {
    provider, model, tokenMode, manualKey, mkpConnected,
    setProvider, setModel, setTokenMode, setManualKey, setMkpConnected, loadSettings,
  } = useSettingsStore()
  const [saving, setSaving] = useState(false)

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
      setMkpConnected(status?.connected ?? false)
      if (status?.connected) {
        message.success('MKP 连接正常')
      } else {
        message.warning('MKP daemon 未连接')
      }
    } catch {
      setMkpConnected(false)
      message.error('MKP 状态检查失败')
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
            <Button onClick={handleCheckMkp} style={{ marginTop: 8 }}>检查 MKP 连接</Button>
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
      </div>
    </div>
  )
}
