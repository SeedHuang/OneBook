/**
 * better-sqlite3 内存 Mock
 *
 * 模拟 better-sqlite3 的核心 API，用于测试环境
 */

type Row = Record<string, unknown>

export class MockDatabase {
  private tables: Map<string, { columns: string[]; rows: Row[] }> = new Map()
  /** 外键关系：childTable -> [{ column, parentTable, parentColumn }] */
  private foreignKeys: Map<string, { column: string; parentTable: string; parentColumn: string }[]> = new Map()
  private _closed = false

  pragma(_str: string): void {
    // no-op in mock
  }

  exec(sql: string): void {
    // 按 CREATE TABLE IF NOT EXISTS 分割，逐个解析
    const parts = sql.split(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+/i)
    for (const part of parts) {
      if (!part.trim() || !/^\w/.test(part.trim())) continue
      const tableNameMatch = part.match(/^(\w+)\s*\(/)
      if (!tableNameMatch) continue
      const tableName = tableNameMatch[1]

      // 找到最后一个 `)` 的位置，忽略 CHECK 约束中的括号
      // 简化处理：取分号前的全部内容，然后去掉首尾的括号
      const semiIdx = part.lastIndexOf(')')
      if (semiIdx < 0) continue
      const body = part.substring(tableNameMatch[0].length, semiIdx)

      // 提取列名（跳过 CHECK/FOREIGN KEY 行）
      const columns = body
        .split(',')
        .map((c) => c.trim().split(/\s+/)[0])
        .filter((c) => c && !c.startsWith('FOREIGN') && !c.startsWith('CHECK'))
      if (!this.tables.has(tableName)) {
        this.tables.set(tableName, { columns, rows: [] })
      }

      // 解析 REFERENCES 外键
      const fkRegex = /(\w+)\s+[^,]*REFERENCES\s+(\w+)\((\w+)\)/gi
      let fkMatch
      const fks: { column: string; parentTable: string; parentColumn: string }[] = []
      while ((fkMatch = fkRegex.exec(body)) !== null) {
        fks.push({ column: fkMatch[1], parentTable: fkMatch[2], parentColumn: fkMatch[3] })
      }
      if (fks.length > 0) {
        this.foreignKeys.set(tableName, fks)
      }
    }
  }

  prepare(sql: string): MockStatement {
    return new MockStatement(this.tables, sql, this.foreignKeys)
  }

  close(): void {
    this._closed = true
  }

  get closed(): boolean {
    return this._closed
  }
}

class MockStatement {
  constructor(
    private tables: Map<string, { columns: string[]; rows: Row[] }>,
    private sql: string,
    private foreignKeys: Map<string, { column: string; parentTable: string; parentColumn: string }[]> = new Map()
  ) {}

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
      let deletedRows: Row[]
      if (!whereMatch) {
        deletedRows = [...table.rows]
        table.rows = []
      } else {
        const whereCol = whereMatch[1].split(/\s*=\s*/)[0].trim()
        deletedRows = table.rows.filter((r) => r[whereCol] === params[0])
        table.rows = table.rows.filter((r) => r[whereCol] !== params[0])
      }

      // 递归级联删除
      this.cascadeDelete(tableName, deletedRows)

      return { changes: deletedRows.length }
    }

    return { changes: 0 }
  }

  /** 递归级联删除：删除父表行后，级联删除子表中引用这些行的记录 */
  private cascadeDelete(parentTableName: string, deletedRows: Row[]): void {
    if (deletedRows.length === 0) return
    for (const [childTable, fks] of this.foreignKeys) {
      for (const fk of fks) {
        if (fk.parentTable === parentTableName) {
          const childTbl = this.tables.get(childTable)
          if (childTbl) {
            const childDeleted: Row[] = []
            for (const deletedRow of deletedRows) {
              const parentVal = deletedRow[fk.parentColumn]
              const matched = childTbl.rows.filter((r) => r[fk.column] === parentVal)
              childDeleted.push(...matched)
              childTbl.rows = childTbl.rows.filter((r) => r[fk.column] !== parentVal)
            }
            // 递归删除孙子表
            this.cascadeDelete(childTable, childDeleted)
          }
        }
      }
    }
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
