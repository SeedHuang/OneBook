import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Empty, Input, Modal, Space, Spin, Typography, App, Row, Col } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, FolderOpenOutlined, SettingOutlined } from '@ant-design/icons'
import { useProjectStore } from '../../stores/projectStore'
import type { Project } from '../../../shared/types'

const { Title, Text, Paragraph } = Typography
const { Search } = Input

export default function ProjectsPage() {
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const { projects, loading, setProjects, setLoading, addProject, removeProject, updateProject } = useProjectStore()
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Project | null>(null)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    setLoading(true)
    try {
      const list = await window.electronAPI.listProjects()
      setProjects(list)
    } catch {
      message.error('加载项目失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!newName.trim()) {
      message.warning('请输入项目名称')
      return
    }
    try {
      const project = await window.electronAPI.createProject({ name: newName, description: newDesc })
      addProject(project)
      setCreateOpen(false)
      setNewName('')
      setNewDesc('')
      message.success('项目创建成功')
    } catch {
      message.error('创建项目失败')
    }
  }

  function handleOpenEdit(project: Project) {
    setEditTarget(project)
    setEditName(project.name)
    setEditDesc(project.description)
    setEditOpen(true)
  }

  async function handleEdit() {
    if (!editTarget || !editName.trim()) {
      message.warning('请输入项目名称')
      return
    }
    try {
      await window.electronAPI.updateProject(editTarget.id, editName, editDesc)
      updateProject(editTarget.id, { name: editName, description: editDesc })
      setEditOpen(false)
      message.success('项目已更新')
    } catch {
      message.error('更新失败')
    }
  }

  function handleDelete(project: Project) {
    modal.confirm({
      title: '确认删除',
      content: `确定要删除项目「${project.name}」吗？所有相关文档和分析记录也会被删除。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await window.electronAPI.deleteProject(project.id)
          removeProject(project.id)
          message.success('项目已删除')
        } catch {
          message.error('删除失败')
        }
      },
    })
  }

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ height: '100vh', background: '#141414', overflow: 'auto' }}>
      {/* 顶部导航 */}
      <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #303030' }}>
        <Space>
          <FolderOpenOutlined style={{ fontSize: 20, color: '#89b4fa' }} />
          <Title level={4} style={{ margin: 0, color: '#e0e0e0' }}>OneBook</Title>
        </Space>
        <Space>
          <Button icon={<SettingOutlined />} onClick={() => navigate('/settings')}>设置</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建项目</Button>
        </Space>
      </div>

      {/* 内容区域 */}
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <Search
          placeholder="搜索项目..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 24 }}
          allowClear
        />

        <Spin spinning={loading}>
          {filtered.length === 0 ? (
            <Empty description="暂无项目" style={{ marginTop: 80 }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                创建第一个项目
              </Button>
            </Empty>
          ) : (
            <Row gutter={[16, 16]}>
              {filtered.map((project) => (
                <Col xs={24} sm={12} lg={8} key={project.id}>
                  <Card
                    hoverable
                    onClick={() => navigate(`/project/${project.id}`)}
                    actions={[
                      <EditOutlined key="edit" onClick={(e) => { e.stopPropagation(); handleOpenEdit(project) }} />,
                      <DeleteOutlined key="delete" style={{ color: '#ff4d4f' }} onClick={(e) => { e.stopPropagation(); handleDelete(project) }} />,
                    ]}
                    styles={{ body: { padding: '16px 20px' } }}
                  >
                    <Card.Meta
                      title={<Text strong style={{ fontSize: 16 }}>{project.name}</Text>}
                      description={
                        <Paragraph ellipsis={{ rows: 2 }} style={{ color: '#888', marginBottom: 0 }}>
                          {project.description || '暂无描述'}
                        </Paragraph>
                      }
                    />
                    <div style={{ marginTop: 12 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(project.created_at).toLocaleDateString('zh-CN')}
                      </Text>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </Spin>
      </div>

      {/* 新建项目弹窗 */}
      <Modal
        title="新建项目"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        okText="创建"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text>项目名称 *</Text>
            <Input
              placeholder="输入项目名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onPressEnter={handleCreate}
              autoFocus
            />
          </div>
          <div>
            <Text>项目描述</Text>
            <Input.TextArea
              placeholder="简要描述项目内容（可选）"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={3}
            />
          </div>
        </Space>
      </Modal>

      {/* 编辑项目弹窗 */}
      <Modal
        title="编辑项目"
        open={editOpen}
        onOk={handleEdit}
        onCancel={() => setEditOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text>项目名称 *</Text>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onPressEnter={handleEdit}
            />
          </div>
          <div>
            <Text>项目描述</Text>
            <Input.TextArea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              rows={3}
            />
          </div>
        </Space>
      </Modal>
    </div>
  )
}
