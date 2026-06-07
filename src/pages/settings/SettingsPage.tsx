import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Select, Input, Button, Space, Typography, Tag, App, Radio, Modal, List, Table, InputNumber, Popconfirm, Tooltip } from 'antd'
import { ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined, ApiOutlined, DeleteOutlined, FileTextOutlined, ReloadOutlined, StarOutlined, StarFilled, PlusOutlined, EditOutlined, ThunderboltOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useSettingsStore } from '../../stores/settingsStore'
import type { AIModel, AIProvider, CreateModelParams } from '../../../shared/types'
import { KNOWN_CONTEXT_WINDOWS, DEFAULT_CONTEXT_WINDOW } from '../../../shared/constants'

const { Title, Text } = Typography

export default function SettingsPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const {
    tokenMode, manualKey, mkpPassword, mkpConnected,
    setTokenMode, setManualKey, setMkpPassword, setMkpConnected, loadSettings,
    models, currentModel, loadModels, createModel, updateModel, deleteModel, setDefaultModel, testModel,
  } = useSettingsStore()
  const [saving, setSaving] = useState(false)
  const [logFiles, setLogFiles] = useState<string[]>([])
  const [logViewOpen, setLogViewOpen] = useState(false)
  const [logContent, setLogContent] = useState('')
  const [logViewTitle, setLogViewTitle] = useState('')
  const [clearing, setClearing] = useState(false)

  // 模型编辑弹窗
  const [modelModalOpen, setModelModalOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<AIModel | null>(null)
  const [formProvider, setFormProvider] = useState<AIProvider>('deepseek')
  const [formModelName, setFormModelName] = useState('')
  const [formApiBase, setFormApiBase] = useState('')
  const [formApiKey, setFormApiKey] = useState('')
  const [formContextWindow, setFormContextWindow] = useState<number>(DEFAULT_CONTEXT_WINDOW)
  const [formLoading, setFormLoading] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)

  useEffect(() => {
    loadSettings()
    loadModels()
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
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

  // ---- 模型管理 ----

  function openAddModal() {
    setEditingModel(null)
    setFormProvider('deepseek')
    setFormModelName('')
    setFormApiBase('')
    setFormApiKey('')
    setFormContextWindow(DEFAULT_CONTEXT_WINDOW)
    setModelModalOpen(true)
  }

  function openEditModal(model: AIModel) {
    setEditingModel(model)
    setFormProvider(model.provider)
    setFormModelName(model.model_name)
    setFormApiBase(model.api_base_url || '')
    setFormApiKey(model.api_key || '')
    setFormContextWindow(model.context_window)
    setModelModalOpen(true)
  }

  function handleModelNameChange(name: string) {
    setFormModelName(name)
    // 自动填充 context_window
    if (KNOWN_CONTEXT_WINDOWS[name]) {
      setFormContextWindow(KNOWN_CONTEXT_WINDOWS[name])
    }
  }

  async function handleModelSubmit() {
    if (!formModelName.trim()) {
      message.warning('请输入模型名称')
      return
    }
    setFormLoading(true)
    try {
      const params: CreateModelParams = {
        provider: formProvider,
        model_name: formModelName.trim(),
        api_base_url: formApiBase.trim() || undefined,
        api_key: formApiKey.trim() || undefined,
        context_window: formContextWindow,
      }
      if (editingModel) {
        await updateModel(editingModel.id, params)
        message.success('模型已更新')
      } else {
        await createModel(params)
        message.success('模型已添加')
      }
      setModelModalOpen(false)
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleSetDefault(id: string) {
    try {
      await setDefaultModel(id)
      message.success('已设为默认模型')
    } catch {
      message.error('设置失败')
    }
  }

  async function handleTestModel(id: string) {
    setTestingId(id)
    try {
      const ok = await testModel(id)
      if (ok) {
        message.success('连通性测试成功')
      } else {
        message.error('连通性测试失败')
      }
    } catch {
      message.error('测试异常')
    } finally {
      setTestingId(null)
    }
  }

  async function handleDeleteModel(id: string) {
    try {
      await deleteModel(id)
      message.success('模型已删除')
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除失败')
    }
  }

  const modelColumns: ColumnsType<AIModel> = [
    {
      title: '模型名称',
      dataIndex: 'model_name',
      key: 'model_name',
      render: (name: string, record) => (
        <Space>
          <Text strong>{name}</Text>
          {record.is_default && <Tag color="gold">默认</Tag>}
        </Space>
      ),
    },
    {
      title: '提供商',
      dataIndex: 'provider',
      key: 'provider',
      width: 100,
      render: (p: string) => <Tag>{p}</Tag>,
    },
    {
      title: 'API 地址',
      dataIndex: 'api_base_url',
      key: 'api_base_url',
      width: 160,
      render: (url: string | undefined) => url
        ? <Tooltip title={url}><Text type="secondary" ellipsis style={{ maxWidth: 140 }}>{url.replace(/https?:\/\//, '')}</Text></Tooltip>
        : <Text type="secondary">默认</Text>,
    },
    {
      title: 'Context',
      dataIndex: 'context_window',
      key: 'context_window',
      width: 100,
      render: (ctx: number) => ctx >= 1048576 ? `${(ctx / 1048576).toFixed(0)}M` : ctx >= 1024 ? `${(ctx / 1024).toFixed(0)}K` : `${ctx}`,
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title={record.is_default ? '当前默认' : '设为默认'}>
            <Button
              type="text"
              size="small"
              icon={record.is_default ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
              disabled={record.is_default}
              onClick={() => handleSetDefault(record.id)}
            />
          </Tooltip>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          <Button
            type="text"
            size="small"
            icon={<ThunderboltOutlined />}
            loading={testingId === record.id}
            onClick={() => handleTestModel(record.id)}
          />
          <Popconfirm
            title="确认删除此模型？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => handleDeleteModel(record.id)}
            disabled={record.is_default}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} disabled={record.is_default} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

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

  return (
    <div style={{ height: '100vh', background: '#141414', overflow: 'auto' }}>
      {/* 头部 */}
      <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #303030' }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
        <Title level={4} style={{ margin: 0 }}>设置</Title>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
        {/* 模型管理 */}
        <Card
          title={`AI 模型管理${currentModel ? `（当前: ${currentModel.model_name}）` : ''}`}
          style={{ marginBottom: 16 }}
          extra={
            <Button type="primary" icon={<PlusOutlined />} size="small" onClick={openAddModal}>
              添加模型
            </Button>
          }
        >
          <Table
            dataSource={models}
            columns={modelColumns}
            rowKey="id"
            size="small"
            pagination={false}
          />
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
              <Text>全局 API Key（模型未配置独立 Key 时使用）</Text>
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

        {/* 模型编辑弹窗 */}
        <Modal
          title={editingModel ? '编辑模型' : '添加模型'}
          open={modelModalOpen}
          onCancel={() => setModelModalOpen(false)}
          onOk={handleModelSubmit}
          confirmLoading={formLoading}
          okText={editingModel ? '更新' : '添加'}
          cancelText="取消"
        >
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text>提供商</Text>
              <Select
                value={formProvider}
                onChange={setFormProvider}
                style={{ width: '100%', marginTop: 4 }}
                options={[
                  { label: 'DeepSeek', value: 'deepseek' },
                  { label: 'OpenAI', value: 'openai' },
                ]}
              />
            </div>
            <div>
              <Text>模型名称</Text>
              <Input
                value={formModelName}
                onChange={(e) => handleModelNameChange(e.target.value)}
                placeholder="如 deepseek-v4、gpt-4o"
                style={{ marginTop: 4 }}
              />
            </div>
            <div>
              <Text>API 地址（可选）</Text>
              <Input
                value={formApiBase}
                onChange={(e) => setFormApiBase(e.target.value)}
                placeholder={`https://api.${formProvider}.com/v1/chat/completions`}
                style={{ marginTop: 4 }}
              />
            </div>
            <div>
              <Text>API Key（可选，留空使用全局 Key）</Text>
              <Input.Password
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
                placeholder="留空使用全局 Key"
                style={{ marginTop: 4 }}
              />
            </div>
            <div>
              <Text>Context Window (tokens)</Text>
              <InputNumber
                value={formContextWindow}
                onChange={(v) => setFormContextWindow(v || DEFAULT_CONTEXT_WINDOW)}
                min={1024}
                style={{ width: '100%', marginTop: 4 }}
                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => Number((value || '').replace(/,/g, ''))}
              />
            </div>
          </Space>
        </Modal>
      </div>
    </div>
  )
}
