/**
 * 主进程日志工具
 *
 * - 始终写入日志文件（按天滚动）
 * - 开发环境同时输出到 console
 * - 提供清除历史日志的能力
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

/** 日志目录：userData/logs */
function getLogDir(): string {
  return path.join(app.getPath('userData'), 'logs')
}

/** 获取当前日期的日志文件路径 */
function getLogFilePath(): string {
  const dir = getLogDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return path.join(dir, `onebook-${date}.log`)
}

/** 格式化当前时间为 HH:mm:ss.SSS */
function timestamp(): string {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  const ms = String(now.getMilliseconds()).padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

/** 判断是否为开发环境 */
function isDev(): boolean {
  return !app.isPackaged
}

/** 将消息序列化为一行字符串 */
function serialize(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.message}\n${a.stack}`
      if (typeof a === 'object' && a !== null) {
        try { return JSON.stringify(a) } catch { return String(a) }
      }
      return String(a)
    })
    .join(' ')
}

/** 写入日志文件（追加模式） */
function writeToFile(level: string, module: string, args: unknown[]): void {
  try {
    const filePath = getLogFilePath()
    const line = `${new Date().toISOString()} [${level}] [${module}] ${serialize(args)}\n`
    fs.appendFileSync(filePath, line, 'utf-8')
  } catch {
    // 日志写入失败时静默处理，避免阻塞业务
  }
}

/** 创建带模块前缀的 logger */
export function createLogger(module: string) {
  return {
    info: (...args: unknown[]) => {
      writeToFile('INFO', module, args)
      if (isDev()) console.log(`${timestamp()} [${module}]`, ...args)
    },
    warn: (...args: unknown[]) => {
      writeToFile('WARN', module, args)
      if (isDev()) console.warn(`${timestamp()} [${module}]`, ...args)
    },
    error: (...args: unknown[]) => {
      writeToFile('ERROR', module, args)
      if (isDev()) console.error(`${timestamp()} [${module}]`, ...args)
    },
    debug: (...args: unknown[]) => {
      writeToFile('DEBUG', module, args)
      if (isDev()) console.log(`${timestamp()} [${module}] [DEBUG]`, ...args)
    },
  }
}

/** 获取所有日志文件列表 */
export function listLogFiles(): string[] {
  const dir = getLogDir()
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.endsWith('.log')).sort()
}

/** 清除所有日志文件 */
export function clearAllLogs(): { deleted: number; errors: string[] } {
  const dir = getLogDir()
  if (!fs.existsSync(dir)) return { deleted: 0, errors: [] }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.log'))
  let deleted = 0
  const errors: string[] = []
  for (const file of files) {
    try {
      fs.unlinkSync(path.join(dir, file))
      deleted++
    } catch (err) {
      errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { deleted, errors }
}

/** 读取指定日志文件内容（用于调试查看） */
export function readLogFile(filename: string): string {
  const filePath = path.join(getLogDir(), filename)
  if (!fs.existsSync(filePath)) return ''
  // 限制读取大小，防止内存溢出
  const MAX_SIZE = 1024 * 1024 // 1MB
  const stat = fs.statSync(filePath)
  if (stat.size > MAX_SIZE) {
    const fd = fs.openSync(filePath, 'r')
    const buffer = Buffer.alloc(MAX_SIZE)
    fs.readSync(fd, buffer, 0, MAX_SIZE, stat.size - MAX_SIZE)
    fs.closeSync(fd)
    return `... (仅显示最后 1MB) ...\n${buffer.toString('utf-8')}`
  }
  return fs.readFileSync(filePath, 'utf-8')
}
