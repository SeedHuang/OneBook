import { useMemo } from 'react'
import { Tabs, Empty, Space, Tag } from 'antd'
import { FileTextOutlined, FileExcelOutlined } from '@ant-design/icons'
import { marked } from 'marked'
import { useDocumentStore } from '../stores/documentStore'

export default function DocumentPanel() {
  const { openDocuments, currentDocument, closeDocument, setCurrentDocument } = useDocumentStore()

  const renderedContent = useMemo(() => {
    if (!currentDocument) return ''
    if (currentDocument.type === 'md') {
      return marked.parse(currentDocument.content, { async: false }) as string
    }
    // For xlsx, show raw content (parsed JSON table)
    return currentDocument.content
  }, [currentDocument])

  if (openDocuments.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#141414' }}>
        <Empty description="选择左侧文档查看" />
      </div>
    )
  }

  const items = openDocuments.map((doc) => ({
    key: doc.id,
    label: (
      <Space size={4}>
        {doc.type === 'md' ? <FileTextOutlined /> : <FileExcelOutlined />}
        <span>{doc.name}</span>
      </Space>
    ),
    closable: true,
    children: null, // We render content separately
  }))

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#141414' }}>
      {/* 标签栏 */}
      <Tabs
        type="editable-card"
        hideAdd
        activeKey={currentDocument?.id}
        onChange={(key) => {
          const doc = openDocuments.find((d) => d.id === key)
          if (doc) setCurrentDocument(doc)
        }}
        onEdit={(key, action) => {
          if (action === 'remove') closeDocument(key as string)
        }}
        items={items}
        style={{ padding: '0 8px' }}
        size="small"
      />

      {/* 文档内容 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
        {currentDocument?.type === 'md' ? (
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: renderedContent }}
          />
        ) : currentDocument?.type === 'xlsx' ? (
          <XlsxViewer content={currentDocument.content} />
        ) : null}
      </div>
    </div>
  )
}

function XlsxViewer({ content }: { content: string }) {
  try {
    const data = JSON.parse(content) as Record<string, any[][]>
    return (
      <div>
        {Object.entries(data).map(([sheet, rows]) => (
          <div key={sheet} style={{ marginBottom: 24 }}>
            <Tag color="blue" style={{ marginBottom: 8 }}>{sheet}</Tag>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #303030' }}>
                    {row.map((cell, j) => (
                      i === 0 ? (
                        <th key={j} style={{ padding: '8px 12px', textAlign: 'left', background: '#1f1f1f', fontWeight: 600 }}>
                          {String(cell ?? '')}
                        </th>
                      ) : (
                        <td key={j} style={{ padding: '6px 12px' }}>
                          {String(cell ?? '')}
                        </td>
                      )
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    )
  } catch {
    return <pre style={{ color: '#ccc', whiteSpace: 'pre-wrap' }}>{content}</pre>
  }
}
