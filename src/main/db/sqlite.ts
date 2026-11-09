import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from 'sql.js'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

export type Params = SqlValue[]

/**
 * Small wrapper around sql.js (SQLite compiled to WebAssembly). It needs no native build
 * tools on the user's PC. The whole database lives in memory and is written back to its
 * file after every change, which is fast for estimate-sized data.
 */
export class Db {
  private depth = 0

  constructor(
    private readonly db: SqlJsDatabase,
    private readonly file: string | null
  ) {}

  exec(sql: string): void {
    this.db.exec(sql)
    this.persist()
  }

  all<T = Record<string, unknown>>(sql: string, params: Params = []): T[] {
    const stmt = this.db.prepare(sql)
    try {
      stmt.bind(params)
      const rows: T[] = []
      while (stmt.step()) rows.push(stmt.getAsObject() as T)
      return rows
    } finally {
      stmt.free()
    }
  }

  get<T = Record<string, unknown>>(sql: string, params: Params = []): T | undefined {
    return this.all<T>(sql, params)[0]
  }

  /** Runs a write statement and returns the new row id. */
  run(sql: string, params: Params = []): number {
    this.db.run(sql, params)
    const id = Number(this.db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] ?? 0)
    this.persist()
    return id
  }

  /** Runs fn inside one transaction; nested calls join the outer one. */
  transaction<T>(fn: () => T): T {
    if (this.depth > 0) return fn()
    this.db.run('BEGIN')
    this.depth++
    try {
      const result = fn()
      this.db.run('COMMIT')
      return result
    } catch (err) {
      this.db.run('ROLLBACK')
      throw err
    } finally {
      this.depth--
      this.persist()
    }
  }

  userVersion(): number {
    return Number(this.db.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0)
  }

  close(): void {
    this.persist()
    this.db.close()
  }

  private persist(): void {
    if (!this.file || this.depth > 0) return
    // Write to a temporary file first so a crash never leaves a half-written database.
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, Buffer.from(this.db.export()))
    renameSync(tmp, this.file)
  }
}

/** Opens a database file, or an in-memory one when file is ':memory:'. */
export async function openSqlite(file: string): Promise<Db> {
  const SQL = await initSqlJs()
  const memory = file === ':memory:'
  const data = !memory && existsSync(file) ? readFileSync(file) : undefined
  const db = new SQL.Database(data)
  db.run('PRAGMA foreign_keys = ON')
  return new Db(db, memory ? null : file)
}
