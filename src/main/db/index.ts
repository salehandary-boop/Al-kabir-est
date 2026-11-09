import Database from 'better-sqlite3'
import { migrations } from './schema'
import { seedCountries } from './seed'

/** Opens (or creates) a company database file and brings it to the latest schema. */
export function openDatabase(file: string): Database.Database {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  seedCountries(db)
  return db
}

export function migrate(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number
  for (let i = version; i < migrations.length; i++) {
    db.transaction(() => {
      db.exec(migrations[i])
      db.pragma(`user_version = ${i + 1}`)
    })()
  }
}
