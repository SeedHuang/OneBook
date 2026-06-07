/**
 * 数据库服务
 *
 * SQLite 数据库初始化与 CRUD 操作
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import type { Project, Document, Conversation, Message, Analysis } from '../../shared/types'

let db: Database.Database

/** 初始化数据库（应用启动时调用） */
export function initDatabase(): void {
  const dbPath = path.join(app.getPath('userData'), 'onebook.db')
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
      type TEXT NOT NULL CHECK(type IN ('md', 'xlsx')),
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
  `)
}

/** 关闭数据库 */
export function closeDatabase(): void {
  db?.close()
}

// ---- 项目 CRUD ----

export function listProjects(): Project[] {
  return db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as Project[]
}

export function createProject(id: string, name: string, description: string): Project {
  const now = new Date().toISOString()
  db.prepare('INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, name, description, now, now)
  return { id, name, description, created_at: now, updated_at: now }
}

export function updateProject(id: string, name: string, description: string): void {
  db.prepare('UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?').run(name, description, new Date().toISOString(), id)
}

export function deleteProject(id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}

// ---- 文档 CRUD ----

export function listDocuments(projectId: string): Document[] {
  return db.prepare('SELECT * FROM documents WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as Document[]
}

export function getDocument(id: string): Document | undefined {
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as Document | undefined
}

export function createDocument(doc: Omit<Document, 'created_at'>): Document {
  const now = new Date().toISOString()
  db.prepare('INSERT INTO documents (id, project_id, name, type, content, source, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(doc.id, doc.project_id, doc.name, doc.type, doc.content, doc.source, doc.file_path, now)
  return { ...doc, created_at: now }
}

export function deleteDocument(id: string): void {
  db.prepare('DELETE FROM documents WHERE id = ?').run(id)
}

// ---- 对话 CRUD ----

export function listConversations(projectId: string): Conversation[] {
  return db.prepare('SELECT * FROM conversations WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as Conversation[]
}

export function createConversation(id: string, projectId: string, documentId: string | null, title: string): Conversation {
  const now = new Date().toISOString()
  db.prepare('INSERT INTO conversations (id, project_id, document_id, title, created_at) VALUES (?, ?, ?, ?, ?)').run(id, projectId, documentId, title, now)
  return { id, project_id: projectId, document_id: documentId, title, created_at: now }
}

export function deleteConversation(id: string): void {
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

// ---- 消息 ----

export function listMessages(conversationId: string): Message[] {
  return db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId) as Message[]
}

export function createMessage(id: string, conversationId: string, role: 'user' | 'assistant', content: string): Message {
  const now = new Date().toISOString()
  db.prepare('INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(id, conversationId, role, content, now)
  return { id, conversation_id: conversationId, role, content, created_at: now }
}

// ---- 分析记录 ----

export function listAnalyses(documentId: string): Analysis[] {
  return db.prepare('SELECT * FROM analyses WHERE document_id = ? ORDER BY created_at DESC').all(documentId) as Analysis[]
}

export function createAnalysis(id: string, documentId: string, type: 'review' | 'extract' | 'generate', result: string): Analysis {
  const now = new Date().toISOString()
  db.prepare('INSERT INTO analyses (id, document_id, type, result, created_at) VALUES (?, ?, ?, ?, ?)').run(id, documentId, type, result, now)
  return { id, document_id: documentId, type, result, created_at: now }
}

// ---- 设置 ----

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare('SELECT * FROM settings').all() as { key: string; value: string }[]
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}
