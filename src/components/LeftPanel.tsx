import { useState } from 'react'
import { Tree, Button, Space, Typography, Dropdown, App, Input, Modal } from 'antd'
import {
  FileTextOutlined,
  PlusOutlined,
  UploadOutlined,
  GithubOutlined,
  LinkOutlined,
  FolderOpenOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useDocumentStore } from '../stores/documentStore'
import type { Document } from '../../shared/types'

const { Text } = Typography

interface LeftPanelProps {
  projectId: string
}

export default function LeftPanel({ projectId }: LeftPanelProps) {
  const { message } = App.useApp()
  const { documents, currentDocument, openDocument, addDocument, removeDocument } = useDocumentStore()
  const [importOpen, setImportOpen] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [gitRepo, setGitRepo] = useState('')
  const [gitBranch, setGitBranch] = useState('main')
  const [importTab, setImportTab] = useState<'local' | 'git' | 'url'>('local')

  const treeData = documents.map((doc) => ({
    key: doc.id,
    title: (
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</span>
        <DeleteOutlined
          style={{ color: '#ff4d4f', fontSize: 12, marginLeft: 4, opacity: 0.6 }}
          onClick={(e) => { e.stopPropagation(); handleDeleteDoc(doc) }}
        />
      </span>
    ),
    icon: <FileTextOutlined />,
    isLeaf: true,
  }))

  function handleSelect(keys: React.Key[]) {
    if (keys.length === 0) return
    const doc = documents.find((d) => d.id === keys[0])
    if (doc) openDocument(doc)
  }

  async function handleDeleteDoc(doc: Document) {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除文档「${doc.name}」吗？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await window.electronAPI.deleteDocument(doc.id)
          removeDocument(doc.id)
          message.success('文档已删除')
        } catch {
          message.error('删除失败')
        }
      },
    })
  }

  async function handleLocalImport() {
    try {
      const filePaths = await window.electronAPI.openFileDialog()
      if (!filePaths || filePaths.length === 0) return
      for (const filePath of filePaths) {
        const doc = await window.electronAPI.importDocument({
          project_id: projectId,
          source: 'local',
          file_path: filePath,
        })
        addDocument(doc)
        message.success(`已导入: ${doc.name}`)
      }
    } catch {
      message.error('导入失败')
    }
  }

  async function handleUrlImport() {
    if (!urlInput.trim()) return
    try {
      const doc = await window.electronAPI.importDocument({
        project_id: projectId,
        source: 'url',
        url: urlInput,
      })
      addDocument(doc)
      setUrlInput('')
      setImportOpen(false)
      message.success('URL 导入成功')
    } catch {
      message.error('URL 导入失败')
    }
  }

  async function handleGitImport() {
    if (!gitRepo.trim()) return
    try {
      const doc = await window.electronAPI.importDocument({
        project_id: projectId,
        source: 'git',
        git_repo: gitRepo,
        git_branch: gitBranch,
      })
      addDocument(doc)
      setGitRepo('')
      setImportOpen(false)
      message.success('Git 导入成功')
    } catch {
      message.error('Git 导入失败')
    }
  }

  const importItems: MenuProps['items'] = [
    { key: 'local', label: '本地文件', icon: <UploadOutlined /> },
    { key: 'git', label: 'Git 仓库', icon: <GithubOutlined /> },
    { key: 'url', label: 'URL 导入', icon: <LinkOutlined /> },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1a1a1a' }}>
      {/* 标题 */}
      <div style={{ padding: '12px 12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space size={4}>
          <FolderOpenOutlined style={{ color: '#89b4fa' }} />
          <Text strong style={{ fontSize: 13 }}>文档</Text>
        </Space>
        <Dropdown
          menu={{
            items: importItems,
            onClick: ({ key }) => {
              setImportTab(key as 'local' | 'git' | 'url')
              setImportOpen(true)
            },
          }}
          trigger={['click']}
        >
          <Button type="text" size="small" icon={<PlusOutlined />} />
        </Dropdown>
      </div>

      {/* 文件树 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 4px' }}>
        {documents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: '#666' }}>
            <FileTextOutlined style={{ fontSize: 32, marginBottom: 8 }} />
            <div>暂无文档</div>
            <div style={{ fontSize: 12 }}>点击 + 导入文档</div>
          </div>
        ) : (
          <Tree
            showIcon
            treeData={treeData}
            selectedKeys={currentDocument ? [currentDocument.id] : []}
            onSelect={handleSelect}
            blockNode
            style={{ background: 'transparent' }}
          />
        )}
      </div>

      {/* 导入弹窗 */}
      <Modal
        title="导入文档"
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        footer={null}
        width={480}
      >
        <div style={{ marginBottom: 16 }}>
          <Space>
            {(['local', 'git', 'url'] as const).map((tab) => (
              <Button
                key={tab}
                type={importTab === tab ? 'primary' : 'default'}
                size="small"
                onClick={() => setImportTab(tab)}
              >
                {tab === 'local' ? '本地文件' : tab === 'git' ? 'Git 仓库' : 'URL'}
              </Button>
            ))}
          </Space>
        </div>

        {importTab === 'local' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              size="large"
              onClick={handleLocalImport}
              block
            >
              选择本地文件导入
            </Button>
            <p style={{ color: '#888', fontSize: 12, marginTop: 8 }}>支持 .md, .xlsx 格式</p>
          </div>
        )}

        {importTab === 'git' && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Input placeholder="Git 仓库地址" value={gitRepo} onChange={(e) => setGitRepo(e.target.value)} />
            <Input placeholder="分支（默认 main）" value={gitBranch} onChange={(e) => setGitBranch(e.target.value)} />
            <Button type="primary" block onClick={handleGitImport}>导入</Button>
          </Space>
        )}

        {importTab === 'url' && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Input placeholder="文档 URL 地址" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />
            <Button type="primary" block onClick={handleUrlImport}>导入</Button>
          </Space>
        )}
      </Modal>
    </div>
  )
}
