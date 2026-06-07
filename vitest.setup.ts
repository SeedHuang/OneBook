/**
 * Vitest 全局 Setup
 *
 * Mock Electron 和 better-sqlite3，使测试在纯 Node 环境运行
 */
import { vi } from 'vitest'
import { MockDatabase } from './electron/__tests__/mock-sqlite'

// Mock electron 模块
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return '/tmp/onebook-test'
      return '/tmp'
    },
    on: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({ filePaths: [], canceled: true }),
    showSaveDialog: vi.fn().mockResolvedValue({ filePath: null, canceled: true }),
  },
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
}))

// Mock better-sqlite3
vi.mock('better-sqlite3', () => {
  return {
    default: MockDatabase,
    __esModule: true,
  }
})

// Mock @electron-toolkit/utils
vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true },
}))

// Mock mkp-sdk
vi.mock('mkp-sdk', () => ({
  getToken: vi.fn().mockResolvedValue({ success: false, token: null }),
  listServices: vi.fn().mockResolvedValue({ success: false, services: [] }),
}))

// Mock mkp-sdk/electron
vi.mock('mkp-sdk/electron', () => ({
  bindDaemonLifecycle: vi.fn(),
}))

// Mock 日志工具（避免测试中写入文件）
const noopLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}
vi.mock('./electron/utils/logger', () => ({
  createLogger: () => noopLogger,
  listLogFiles: vi.fn().mockReturnValue([]),
  readLogFile: vi.fn().mockReturnValue(''),
  clearAllLogs: vi.fn().mockReturnValue({ deleted: 0, errors: [] }),
}))
