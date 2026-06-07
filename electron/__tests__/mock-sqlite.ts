/**
 * better-sqlite3 内存 Mock
 *
 * 模拟 better-sqlite3 的核心 API，用于测试环境
 */

type Row = Record<string, unknown>

export class MockDatabase {
  private tables: Map<string, { columns: string[]; rows: Row[] }> = new Map()
  private _closed = false

  pragma(_str: string): void {
    // no-op in mock
  }

  exec(sql: string): void {
    // 解析 CREATE TABLE 语句
    const createRegex = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\)/gi
    let match
    while ((match = createRegex.exec(sql)) !== null) {
      const tableName = match[1]
      const colDefs = match[2]
      const columns = colDefs
        .split(',')
        .map((c) => c.trim().split(/\s+/)[0])
        .filter((c) => c && !c.startsWith('FOREIGN') && !c.startsWith('CHECK'))
      if (!this.tables.has(tableName)) {
        this.tables.set(tableName, { columns, rows: [] })
      }
    }
  }

  prepare(sql: string): MockStatement {
    return new MockStatement(this.tables, sql)
  }

  close(): void {
    this._closed = true
  }

  get closed(): boolean {
    return this._closed
  }
}

class MockStatement {
  constructor(private tables: Map<string, { columns: string[]; rows: Row[] }>, private sql: string) {}

  run(...params: unknown[]): { changes: number } {
    const sql = this.sql.trim()

    // INSERT
    if (sql.toUpperCase().startsWith('INSERT')) {
      const tableMatch = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i)
      if (!tableMatch) return { changes: 0 }
      const tableName = tableMatch[1]
      const table = this.tables.get(tableName)
      if (!table) return { changes: 0 }

      const colMatch = sql.match(/\(([^)]+)\)\s*VALUES/i)
      if (!colMatch) return { changes: 0 }
      const columns = colMatch[1].split(',').map((c) => c.trim())

      // INSERT OR REPLACE
      if (sql.toUpperCase().includes('OR REPLACE')) {
        const pkCol = table.columns[0] // 假设第一列是主键
        const pkIdx = columns.indexOf(pkCol)
        if (pkIdx >= 0) {
          const pkVal = params[pkIdx]
          table.rows = table.rows.filter((r) => r[pkCol] !== pkVal)
        }
      }

      const row: Row = {}
      columns.forEach((col, i) => {
        row[col] = params[i] ?? null
      })
      table.rows.push(row)
      return { changes: 1 }
    }

    // UPDATE
    if (sql.toUpperCase().startsWith('UPDATE')) {
      const tableMatch = sql.match(/UPDATE\s+(\w+)/i)
      if (!tableMatch) return { changes: 0 }
      const tableName = tableMatch[1]
      const table = this.tables.get(tableName)
      if (!table) return { changes: 0 }

      const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i)
      if (!setMatch) return { changes: 0 }
      const setCols = setMatch[1].split(',').map((s) => s.trim().split(/\s*=\s*/)[0])

      const whereMatch = sql.match(/WHERE\s+(.+)$/i)
      const whereCol = whereMatch ? whereMatch[1].split(/\s*=\s*/)[0].trim() : null

      let changes = 0
      for (const row of table.rows) {
        if (whereCol) {
          const whereVal = params[setCols.length]
          if (row[whereCol] !== whereVal) continue
        }
        setCols.forEach((col, i) => {
          row[col] = params[i]
        })
        changes++
      }
      return { changes }
    }

    // DELETE
    if (sql.toUpperCase().startsWith('DELETE')) {
      const tableMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i)
      if (!tableMatch) return { changes: 0 }
      const tableName = tableMatch[1]
      const table = this.tables.get(tableName)
      if (!table) return { changes: 0 }

      const whereMatch = sql.match(/WHERE\s+(.+)$/i)
      if (!whereMatch) {
        const count = table.rows.length
        table.rows = []
        return { changes: count }
      }

      const whereCol = whereMatch[1].split(/\s*=\s*/)[0].trim()
      const before = table.rows.length
      table.rows = table.rows.filter((r) => r[whereCol] !== params[0])
      return { changes: before - table.rows.length }
    }

    return { changes: 0 }
  }

  all(...params: unknown[]): Row[] {
    const sql = this.sql.trim()
    const tableMatch = sql.match(/FROM\s+(\w+)/i)
    if (!tableMatch) return []
    const tableName = tableMatch[1]
    const table = this.tables.get(tableName)
    if (!table) return []

    let rows = [...table.rows]

    // WHERE
    const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i)
    if (whereMatch && params.length > 0) {
      rows = rows.filter((r) => r[whereMatch[1]] === params[0])
    }

    // ORDER BY
    const orderMatch = sql.match(/ORDER BY\s+(\w+)\s*(ASC|DESC)?/i)
    if (orderMatch) {
      const col = orderMatch[1]
      const desc = orderMatch[2]?.toUpperCase() === 'DESC'
      rows.sort((a, b) => {
        const av = String(a[col] ?? '')
        const bv = String(b[col] ?? '')
        return desc ? bv.localeCompare(av) : av.localeCompare(bv)
      })
    }

    return rows
  }

  get(...params: unknown[]): Row | undefined {
    const results = this.all(...params)
    return results[0]
  }
}

export default MockDatabase
