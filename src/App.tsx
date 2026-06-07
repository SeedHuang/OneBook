import { HashRouter, Routes, Route } from 'react-router-dom'
import { ConfigProvider, theme, App as AntdApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useEffect } from 'react'
import { useSettingsStore } from './stores/settingsStore'
import ProjectsPage from './pages/projects/ProjectsPage'
import WorkspacePage from './pages/workspace/WorkspacePage'
import SettingsPage from './pages/settings/SettingsPage'

export default function App() {
  const loadSettings = useSettingsStore((s) => s.loadSettings)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#89b4fa',
          borderRadius: 6,
        },
      }}
    >
      <AntdApp>
        <HashRouter>
          <Routes>
            <Route path="/" element={<ProjectsPage />} />
            <Route path="/project/:id" element={<WorkspacePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </HashRouter>
      </AntdApp>
    </ConfigProvider>
  )
}
