/**
 * dev 启动前清理残留 Electron 进程
 *
 * 通过命令行参数匹配本项目路径，只杀 OneBook 的 electron 进程，
 * 不影响其他 Electron 开发项目。
 */
import { execSync } from 'child_process'
import { resolve } from 'path'

const PROJECT_DIR = resolve(import.meta.dirname, '..')

try {
  // 查询所有 electron.exe 进程的命令行
  const output = execSync(
    'wmic process where "name=\'electron.exe\'" get processid,commandline /format:list',
    { encoding: 'utf-8', timeout: 5000 }
  )

  const entries = output.split('\r\n\r\n').filter(Boolean)
  let killed = 0

  for (const entry of entries) {
    const cmdMatch = entry.match(/CommandLine=(.*)/i)
    const pidMatch = entry.match(/ProcessId=(\d+)/i)

    if (!cmdMatch || !pidMatch) continue

    const cmd = cmdMatch[1].trim()
    const pid = parseInt(pidMatch[1])

    // 命令行包含本项目路径 → 是 OneBook 的进程
    const projectDirNormalized = PROJECT_DIR.replace(/\\/g, '/')
    const cmdNormalized = cmd.replace(/\\/g, '/')

    if (cmdNormalized.includes(projectDirNormalized) || cmdNormalized.includes('onebook')) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { timeout: 3000 })
        console.log(`[predev] 已清理 OneBook 进程 (PID: ${pid})`)
        killed++
      } catch {
        // 进程可能已退出，忽略
      }
    }
  }

  if (killed === 0) {
    console.log('[predev] 无残留 OneBook 进程')
  } else {
    console.log(`[predev] 共清理 ${killed} 个进程`)
  }
} catch {
  // wmic 不可用或无 electron.exe 进程，正常跳过
  console.log('[predev] 无需清理')
}

// 设置控制台编码为 UTF-8，避免中文日志乱码
try {
  execSync('chcp.com 65001', { stdio: 'ignore', timeout: 3000 })
  console.log('[predev] 控制台编码已设为 UTF-8')
} catch {
  // chcp 不可用时静默跳过
}
