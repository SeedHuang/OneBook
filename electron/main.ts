/**
 * Electron 主进程入口
 *
 * 创建窗口、初始化数据库、注册 IPC、绑定 MKP daemon 生命周期
 */
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { initDatabase, closeDatabase } from './services/db.service'
import { registerIpcHandlers } from './ipc/handlers'
import { createLogger } from './utils/logger'

const log = createLogger('main')

// 尝试绑定 MKP daemon 生命周期（如果 mkp-sdk 可用）
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { bindDaemonLifecycle } = require('mkp-sdk/electron')
  bindDaemonLifecycle(app)
  log.info('MKP daemon 生命周期已绑定')
} catch {
  log.warn('MKP SDK 未安装，跳过 daemon 绑定')
}

function createWindow(): void {
  log.info('正在创建主窗口...')
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    title: 'OneBook',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    log.info('主窗口已显示')
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    log.info('加载开发服务器:', process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    log.info('加载生产构建文件')
  }
}

app.whenReady().then(() => {
  log.info('应用就绪，开始初始化...')
  try {
    initDatabase()
    log.info('数据库初始化成功')
    registerIpcHandlers()
    log.info('IPC 处理器注册成功')
  } catch (err) {
    log.error('初始化失败:', err)
  }
  createWindow()
})

app.on('window-all-closed', () => {
  log.info('所有窗口已关闭')
  closeDatabase()
  log.info('数据库连接已关闭')
  if (process.platform !== 'darwin') {
    app.quit()
    log.info('应用已退出')
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    log.info('应用激活，重新创建窗口')
    createWindow()
  }
})
