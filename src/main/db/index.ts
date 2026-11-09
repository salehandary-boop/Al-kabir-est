import { migrations } from './schema'
import { seedCountries } from './seed'
import { openSqlite, type Db } from './sqlite'

export type { Db } from './sqlite'

/** Opens (or creates) a company database file and brings it to the latest schema. */
export async function openDatabase(file: string): Promise<Db> {
  const db = await openSqlite(file)
  migrate(db)
  seedCountries(db)
  return db
}

export function migrate(db: Db): void {
  for (let i = db.userVersion(); i < migrations.length; i++) {
    db.transaction(() => {
      db.exec(migrations[i])
      db.exec(`PRAGMA user_version = ${i + 1}`)
    })
  }
}
