// @vitest-environment happy-dom
/**
 * ProjectsPage 组件测试
 *
 * 验证项目列表页面的渲染、加载、错误处理
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ConfigProvider, App as AntdApp } from 'antd'
import { useProjectStore } from '../stores/projectStore'
import ProjectsPage from '../pages/projects/ProjectsPage'
import type { Project } from '../../shared/types'

// ---- Mock 设置 ----

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock window.electronAPI
const mockElectronAPI = {
  listProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis
}
(globalThis as any).window.electronAPI = mockElectronAPI

// 测试用包装器
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <ConfigProvider>
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </MemoryRouter>
  )
}

// 测试数据
const mockProjects: Project[] = [
  {
    id: 'p1',
    name: '测试项目A',
    description: '项目描述A',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'p2',
    name: '测试项目B',
    description: '项目描述B',
    created_at: '2025-02-01T00:00:00.000Z',
    updated_at: '2025-02-01T00:00:00.000Z',
  },
]

describe('ProjectsPage 组件', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 重置 zustand store
    useProjectStore.setState({
      projects: [],
      currentProject: null,
      loading: false,
    })
  })

  // ---- 加载场景 ----

  it('加载成功时显示项目列表', async () => {
    mockElectronAPI.listProjects.mockResolvedValue(mockProjects)

    await act(async () => {
      render(<ProjectsPage />, { wrapper: Wrapper })
    })

    await waitFor(() => {
      expect(screen.getByText('测试项目A')).toBeDefined()
      expect(screen.getByText('测试项目B')).toBeDefined()
    })
  })

  it('加载成功且项目为空时显示空状态', async () => {
    mockElectronAPI.listProjects.mockResolvedValue([])

    await act(async () => {
      render(<ProjectsPage />, { wrapper: Wrapper })
    })

    await waitFor(() => {
      expect(screen.getByText('暂无项目')).toBeDefined()
    })
  })

  it('加载失败时显示错误提示', async () => {
    mockElectronAPI.listProjects.mockRejectedValue(new Error('IPC通道未注册'))

    await act(async () => {
      render(<ProjectsPage />, { wrapper: Wrapper })
    })

    await waitFor(() => {
      expect(screen.getByText(/加载项目失败/)).toBeDefined()
    })
  })

  it('加载失败时错误信息包含具体原因', async () => {
    mockElectronAPI.listProjects.mockRejectedValue(new Error('database is locked'))

    await act(async () => {
      render(<ProjectsPage />, { wrapper: Wrapper })
    })

    await waitFor(() => {
      expect(screen.getByText(/database is locked/)).toBeDefined()
    })
  })

  it('只调用一次 listProjects（无重复请求）', async () => {
    mockElectronAPI.listProjects.mockResolvedValue([])

    await act(async () => {
      render(<ProjectsPage />, { wrapper: Wrapper })
    })

    expect(mockElectronAPI.listProjects).toHaveBeenCalledTimes(1)
  })

  // ---- 创建项目 ----

  it('点击新建项目按钮弹出创建对话框', async () => {
    mockElectronAPI.listProjects.mockResolvedValue([])

    await act(async () => {
      render(<ProjectsPage />, { wrapper: Wrapper })
    })

    // 点击顶部“新建项目”按钮
    const buttons = screen.getAllByRole('button')
    const createBtn = buttons.find(b => b.textContent?.includes('新建项目'))!
    await act(async () => {
      fireEvent.click(createBtn)
    })

    // Modal 通过 Portal 渲染，需要等待动画完成
    await waitFor(() => {
      expect(screen.getByText('项目名称 *')).toBeDefined()
    }, { timeout: 3000 })
  })

  it('创建项目成功后添加到列表', async () => {
    mockElectronAPI.listProjects.mockResolvedValue([])
    const newProject: Project = {
      id: 'p-new',
      name: '新项目',
      description: '新项目描述',
      created_at: '2025-03-01T00:00:00.000Z',
      updated_at: '2025-03-01T00:00:00.000Z',
    }
    mockElectronAPI.createProject.mockResolvedValue(newProject)

    await act(async () => {
      render(<ProjectsPage />, { wrapper: Wrapper })
    })

    // 打开创建弹窗
    const buttons = screen.getAllByRole('button')
    const createBtn = buttons.find(b => b.textContent?.includes('新建项目'))!
    await act(async () => {
      fireEvent.click(createBtn)
    })

    // 等待 Modal 渲染
    await waitFor(() => {
      expect(screen.getByPlaceholderText('输入项目名称')).toBeDefined()
    }, { timeout: 3000 })

    // 输入项目名称
    const nameInput = screen.getByPlaceholderText('输入项目名称')
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: '新项目' } })
    })

    // 点击创建按钮（Modal 底部 OK 按钮）
    const okBtn = screen.getByRole('button', { name: '创 建' })
    await act(async () => {
      fireEvent.click(okBtn)
    })

    await waitFor(() => {
      expect(mockElectronAPI.createProject).toHaveBeenCalledWith({
        name: '新项目',
        description: '',
      })
    })
  })

  it('创建项目时名称为空不发送请求', async () => {
    mockElectronAPI.listProjects.mockResolvedValue([])

    await act(async () => {
      render(<ProjectsPage />, { wrapper: Wrapper })
    })

    // 打开创建弹窗
    const buttons = screen.getAllByRole('button')
    const createBtn = buttons.find(b => b.textContent?.includes('新建项目'))!
    await act(async () => {
      fireEvent.click(createBtn)
    })

    // 等待 Modal 渲染
    await waitFor(() => {
      expect(screen.getByPlaceholderText('输入项目名称')).toBeDefined()
    }, { timeout: 3000 })

    // 不输入名称，直接点创建
    const okBtn = screen.getByRole('button', { name: '创 建' })
    await act(async () => {
      fireEvent.click(okBtn)
    })

    expect(mockElectronAPI.createProject).not.toHaveBeenCalled()
  })

  // ---- 搜索 ----

  it('搜索框可过滤项目', async () => {
    mockElectronAPI.listProjects.mockResolvedValue(mockProjects)

    await act(async () => {
      render(<ProjectsPage />, { wrapper: Wrapper })
    })

    await waitFor(() => {
      expect(screen.getByText('测试项目A')).toBeDefined()
    })

    // 输入搜索关键词
    const searchInput = screen.getByPlaceholderText('搜索项目...')
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: '项目A' } })
    })

    expect(screen.getByText('测试项目A')).toBeDefined()
    expect(screen.queryByText('测试项目B')).toBeNull()
  })

  // ---- 导航 ----

  it('点击设置按钮导航到设置页', async () => {
    mockElectronAPI.listProjects.mockResolvedValue([])

    await act(async () => {
      render(<ProjectsPage />, { wrapper: Wrapper })
    })

    const settingsBtn = screen.getByText('设置')
    await act(async () => {
      fireEvent.click(settingsBtn)
    })

    expect(mockNavigate).toHaveBeenCalledWith('/settings')
  })
})
