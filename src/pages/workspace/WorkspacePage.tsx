import { useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Layout, Typography, Button, Space, App } from 'antd'
import { ArrowLeftOutlined, SettingOutlined } from '@ant-design/icons'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useProjectStore } from '../../stores/projectStore'
import { useDocumentStore } from '../../stores/documentStore'
import { useChatStore } from '../../stores/chatStore'
import LeftPanel from '../../components/LeftPanel'
import DocumentPanel from '../../components/DocumentPanel'
import ChatPanel from '../../components/ChatPanel'

const { Title } = Typography

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { currentProject, setCurrentProject, setProjects } = useProjectStore()
  const { setDocuments } = useDocumentStore()
  const { setConversations } = useChatStore()

  const loadProject = useCallback(async () => {
    if (!id) return
    try {
      // Load all projects to find the current one
      const list = await window.electronAPI.listProjects()
      setProjects(list)
      const project = list.find((p) => p.id === id)
      if (project) {
        setCurrentProject(project)
      } else {
        message.error('项目不存在')
        navigate('/')
      }
      // Load documents
      const docs = await window.electronAPI.listDocuments(id)
      setDocuments(docs)
      // Load conversations
      const convs = await window.electronAPI.listConversations(id)
      setConversations(convs)
    } catch {
      message.error('加载项目数据失败')
    }
  }, [id])

  useEffect(() => {
    loadProject()
  }, [loadProject])

  if (!currentProject) {
    return null
  }

  return (
    <Layout style={{ height: '100vh', background: '#141414' }}>
      {/* 顶部栏 */}
      <div style={{
        height: 48,
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #303030',
        background: '#1f1f1f',
        flexShrink: 0,
      }}>
        <Space>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/')}
          />
          <Title level={5} style={{ margin: 0 }}>{currentProject.name}</Title>
        </Space>
        <Button icon={<SettingOutlined />} type="text" onClick={() => navigate('/settings')} />
      </div>

      {/* 三栏布局 */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <PanelGroup direction="horizontal">
          <Panel defaultSize={18} minSize={12} maxSize={30}>
            <LeftPanel projectId={id!} />
          </Panel>
          <PanelResizeHandle style={{ width: 1, background: '#303030' }} />
          <Panel defaultSize={52} minSize={30}>
            <DocumentPanel />
          </Panel>
          <PanelResizeHandle style={{ width: 1, background: '#303030' }} />
          <Panel defaultSize={30} minSize={20} maxSize={50}>
            <ChatPanel projectId={id!} />
          </Panel>
        </PanelGroup>
      </div>
    </Layout>
  )
}
