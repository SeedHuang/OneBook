/**
 * 数据库服务
 *
 * SQLite 数据库初始化与 CRUD 操作
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import path from 'path'
import type { Project, Document, Conversation, Message, Analysis, AIModel, CreateModelParams } from '../../shared/types'
import { KNOWN_CONTEXT_WINDOWS, DEFAULT_CONTEXT_WINDOW } from '../../shared/constants'
import { createLogger } from '../utils/logger'

const log = createLogger('db')

let db: Database.Database

/** 初始化数据库（应用启动时调用） */
export function initDatabase(): void {
  const dbPath = path.join(app.getPath('userData'), 'onebook.db')
  log.info('初始化数据库:', dbPath)
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('md', 'xlsx', 'html')),
      content TEXT,
      source TEXT NOT NULL CHECK(source IN ('local', 'git', 'url')),
      file_path TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      document_id TEXT REFERENCES documents(id),
      title TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('review', 'extract', 'generate')),
      result TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL CHECK(provider IN ('deepseek', 'openai')),
      model_name TEXT NOT NULL UNIQUE,
      api_base_url TEXT,
      api_key TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      context_window INTEGER NOT NULL DEFAULT 131072,
      created_at TEXT NOT NULL
    );
  `)

  // 迁移: 旧版 documents 表 CHECK 约束不含 'html'，需重建
  try {
    const tableInfo = db.pragma("table_info('documents')", { simple: false }) as Array<{ name: string; type: string; notnull: number; dflt_value: string | null; pk: number; cid: number }> | undefined
    if (Array.isArray(tableInfo)) {
      const sql = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'documents'").get() as { sql: string } | undefined
      if (sql && !sql.sql.includes("'html'")) {
        log.info('迁移 documents 表: 添加 html 类型支持')
        db.exec(`
          PRAGMA foreign_keys = OFF;
          CREATE TABLE documents_new (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('md', 'xlsx', 'html')),
            content TEXT,
            source TEXT NOT NULL CHECK(source IN ('local', 'git', 'url')),
            file_path TEXT,
            created_at TEXT NOT NULL
          );
          INSERT INTO documents_new SELECT * FROM documents;
          DROP TABLE documents;
          ALTER TABLE documents_new RENAME TO documents;
          PRAGMA foreign_keys = ON;
        `)
        log.info('迁移完成')
      }
    }
  } catch (err) {
    log.warn('documents 表迁移检查跳过:', err instanceof Error ? err.message : String(err))
  }

  // 迁移: messages 表增加 content_type 列（标记排期消息）
  try {
    const cols = db.pragma("table_info('messages')", { simple: false }) as Array<{ name: string }>
    if (Array.isArray(cols) && !cols.some((c) => c.name === 'content_type')) {
      log.info('迁移 messages 表: 添加 content_type 列')
      db.exec("ALTER TABLE messages ADD COLUMN content_type TEXT DEFAULT 'text'")
      log.info('迁移完成')
    }
  } catch (err) {
    log.warn('messages 表迁移检查跳过:', err instanceof Error ? err.message : String(err))
  }

  log.info('数据库表结构已就绪')

  // 迁移: models 表预填默认记录
  try {
    const anyModel = db.prepare('SELECT id FROM models LIMIT 1').get() as { id: string } | undefined
    if (!anyModel) {
      const now = new Date().toISOString()
      db.prepare('INSERT INTO models (id, provider, model_name, is_default, context_window, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), 'deepseek', 'deepseek-v4-flash', 1, 1048576, now)
      db.prepare('INSERT INTO models (id, provider, model_name, is_default, context_window, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), 'deepseek', 'deepseek-v4-pro', 0, 1048576, now)
      log.info('预填默认模型: deepseek-v4-flash, deepseek-v4-pro')
    }
  } catch (err) {
    log.warn('models 表预填跳过:', err instanceof Error ? err.message : String(err))
  }

  // 迁移: conversations 表添加 total_tokens 列
  try {
    const cols = db.pragma("table_info('conversations')", { simple: false }) as Array<{ name: string }>
    if (Array.isArray(cols) && !cols.some(c => c.name === 'total_tokens')) {
      db.exec("ALTER TABLE conversations ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0")
      log.info('迁移 conversations 表: 添加 total_tokens 列')
    }
  } catch (err) {
    log.warn('conversations 迁移跳过:', err instanceof Error ? err.message : String(err))
  }
}

/** 关闭数据库 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    log.info('数据库连接已关闭')
  }
}

// ---- 项目 CRUD ----

export function listProjects(): Project[] {
  const rows = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as Project[]
  log.debug('listProjects 返回', rows.length, '条')
  return rows
}

export function createProject(id: string, name: string, description: string): Project {
  const now = new Date().toISOString()
  db.prepare('INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, name, description, now, now)
  log.info('创建项目:', name, `(${id})`)
  return { id, name, description, created_at: now, updated_at: now }
}

export function updateProject(id: string, name: string, description: string): void {
  db.prepare('UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?').run(name, description, new Date().toISOString(), id)
  log.info('更新项目:', id)
}

export function deleteProject(id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  log.info('删除项目:', id)
}

// ---- 文档 CRUD ----

export function listDocuments(projectId: string): Document[] {
  const rows = db.prepare('SELECT * FROM documents WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as Document[]
  log.debug('listDocuments 项目', projectId, '返回', rows.length, '条')
  return rows
}

export function getDocument(id: string): Document | undefined {
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as Document | undefined
}

export function createDocument(doc: Omit<Document, 'created_at'>): Document {
  const now = new Date().toISOString()
  db.prepare('INSERT INTO documents (id, project_id, name, type, content, source, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(doc.id, doc.project_id, doc.name, doc.type, doc.content, doc.source, doc.file_path, now)
  log.info('创建文档:', doc.name, `(${doc.id})`, '来源:', doc.source)
  return { ...doc, created_at: now }
}

export function deleteDocument(id: string): void {
  db.prepare('DELETE FROM documents WHERE id = ?').run(id)
  log.info('删除文档:', id)
}

// ---- 对话 CRUD ----

export function listConversations(projectId: string): Conversation[] {
  const rows = db.prepare('SELECT * FROM conversations WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as Conversation[]
  log.debug('listConversations 项目', projectId, '返回', rows.length, '条')
  return rows
}

export function createConversation(id: string, projectId: string, documentId: string | null, title: string): Conversation {
  const now = new Date().toISOString()
  db.prepare('INSERT INTO conversations (id, project_id, document_id, title, total_tokens, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(id, projectId, documentId, title, now)
  log.info('创建对话:', title, `(${id})`)
  return { id, project_id: projectId, document_id: documentId, title, total_tokens: 0, created_at: now }
}

export function deleteConversation(id: string): void {
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  log.info('删除对话:', id)
}

export function updateConversationTitle(id: string, title: string): void {
  db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, id)
  log.info('更新对话标题:', id)
}

// ---- 消息 ----

export function listMessages(conversationId: string): Message[] {
  return db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId) as Message[]
}

export function createMessage(id: string, conversationId: string, role: 'user' | 'assistant', content: string, contentType: 'text' | 'schedule' = 'text'): Message {
  const now = new Date().toISOString()
  db.prepare('INSERT INTO messages (id, conversation_id, role, content, content_type, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, conversationId, role, content, contentType, now)
  log.debug('创建消息:', role, `(${id})`, contentType !== 'text' ? `[${contentType}]` : '')
  return { id, conversation_id: conversationId, role, content, content_type: contentType, created_at: now }
}

/** 删除指定消息（及紧随其后的配对消息） */
export function deleteMessagePair(userMsgId: string): void {
  // 查找该用户消息所在的对话
  const userMsg = db.prepare('SELECT conversation_id FROM messages WHERE id = ?').get(userMsgId) as { conversation_id: string } | undefined
  if (!userMsg) return

  // 通过消息插入顺序查找紧随其后的 assistant 消息
  const msgs = db.prepare(
    'SELECT id, role FROM messages WHERE conversation_id = ? ORDER BY rowid ASC',
  ).all(userMsg.conversation_id) as Array<{ id: string; role: string }>
  const idx = msgs.findIndex((m) => m.id === userMsgId)
  const nextAssistant = idx >= 0 && idx + 1 < msgs.length && msgs[idx + 1].role === 'assistant'
    ? msgs[idx + 1].id
    : undefined

  db.prepare('DELETE FROM messages WHERE id = ?').run(userMsgId)
  if (nextAssistant) {
    db.prepare('DELETE FROM messages WHERE id = ?').run(nextAssistant)
    log.debug('删除消息对:', userMsgId, nextAssistant)
  } else {
    log.debug('删除消息:', userMsgId)
  }
}

// ---- 分析记录 ----

export function listAnalyses(documentId: string): Analysis[] {
  return db.prepare('SELECT * FROM analyses WHERE document_id = ? ORDER BY created_at DESC').all(documentId) as Analysis[]
}

export function createAnalysis(id: string, documentId: string, type: 'review' | 'extract' | 'generate', result: string): Analysis {
  const now = new Date().toISOString()
  db.prepare('INSERT INTO analyses (id, document_id, type, result, created_at) VALUES (?, ?, ?, ?, ?)').run(id, documentId, type, result, now)
  log.info('创建分析记录:', type, `(${id})`)
  return { id, document_id: documentId, type, result, created_at: now }
}

// ---- 设置 ----

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  log.info('更新设置:', key)
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare('SELECT * FROM settings').all() as { key: string; value: string }[]
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

// ---- 模型管理 ----

function rowToModel(row: Record<string, unknown>): AIModel {
  return {
    id: row.id as string,
    provider: row.provider as 'deepseek' | 'openai',
    model_name: row.model_name as string,
    api_base_url: (row.api_base_url as string) || undefined,
    api_key: (row.api_key as string) || undefined,
    is_default: !!(row.is_default as number),
    context_window: row.context_window as number,
    created_at: row.created_at as string,
  }
}

export function listModels(): AIModel[] {
  const rows = db.prepare('SELECT * FROM models ORDER BY is_default DESC, created_at ASC').all() as Record<string, unknown>[]
  return rows.map(rowToModel)
}

export function createModel(params: CreateModelParams): AIModel {
  const id = randomUUID()
  const now = new Date().toISOString()
  const ctx = params.context_window ?? KNOWN_CONTEXT_WINDOWS[params.model_name] ?? DEFAULT_CONTEXT_WINDOW
  db.prepare(
    'INSERT INTO models (id, provider, model_name, api_base_url, api_key, is_default, context_window, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, params.provider, params.model_name, params.api_base_url || null, params.api_key || null, 0, ctx, now)
  return rowToModel(db.prepare('SELECT * FROM models WHERE id = ?').get(id) as Record<string, unknown>)
}

export function updateModel(id: string, params: Partial<CreateModelParams>): AIModel {
  const fields: string[] = []
  const values: unknown[] = []
  if (params.provider !== undefined) { fields.push('provider = ?'); values.push(params.provider) }
  if (params.model_name !== undefined) { fields.push('model_name = ?'); values.push(params.model_name) }
  if (params.api_base_url !== undefined) { fields.push('api_base_url = ?'); values.push(params.api_base_url || null) }
  if (params.api_key !== undefined) { fields.push('api_key = ?'); values.push(params.api_key || null) }
  if (params.context_window !== undefined) { fields.push('context_window = ?'); values.push(params.context_window) }
  if (fields.length === 0) throw new Error('无更新字段')
  values.push(id)
  db.prepare(`UPDATE models SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return rowToModel(db.prepare('SELECT * FROM models WHERE id = ?').get(id) as Record<string, unknown>)
}

export function deleteModel(id: string): void {
  const model = db.prepare('SELECT * FROM models WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!model) throw new Error('模型不存在')
  if (model.is_default) throw new Error('不能删除默认模型')
  db.prepare('DELETE FROM models WHERE id = ?').run(id)
}

export function setDefaultModel(id: string): void {
  db.prepare('UPDATE models SET is_default = 0').run()
  db.prepare('UPDATE models SET is_default = 1 WHERE id = ?').run(id)
}

export function getDefaultModel(): AIModel | null {
  const row = db.prepare('SELECT * FROM models WHERE is_default = 1 LIMIT 1').get() as Record<string, unknown> | undefined
  return row ? rowToModel(row) : null
}

// ---- Token 追踪 ----

export function addConversationTokens(conversationId: string, tokens: number): void {
  db.prepare('UPDATE conversations SET total_tokens = total_tokens + ? WHERE id = ?').run(tokens, conversationId)
}
