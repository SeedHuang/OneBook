/**
 * Context Ring 工具函数
 * 用于计算上下文消耗环形图的颜色、格式化和百分比
 */

/**
 * 根据百分比返回环形图颜色
 * @param percent 使用百分比 (0-100)
 * @returns 颜色 hex 字符串
 */
export function getContextRingColor(percent: number): string {
  if (percent > 95) return '#f5222d'
  if (percent > 80) return '#faad14'
  return '#52c41a'
}

/**
 * 智能格式化 token 数字显示
 * @param n token 数量
 * @returns 格式化后的字符串（如 "500", "49K", "1.0M"）
 */
export function formatContextTokens(n: number): string {
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)}M`
  if (n >= 1024) return `${Math.round(n / 1024)}K`
  return `${n}`
}

/**
 * 计算上下文使用百分比（钳制到 0-100）
 * @param used 已使用的 token 数
 * @param total 总 context window 大小
 * @returns 百分比整数 (0-100)
 */
export function getContextPercent(used: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(Math.round((used / total) * 100), 100)
}
