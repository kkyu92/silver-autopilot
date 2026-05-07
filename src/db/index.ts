import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'
import fs from 'fs'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data', 'silver-autopilot.db')
const MIGRATIONS_PATH = path.join(process.cwd(), 'src/db/migrations')

function createDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  const sqlite = new Database(DB_PATH)
  sqlite.pragma('journal_mode = WAL')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: MIGRATIONS_PATH })
  return db
}

export const db = createDb()
export type Db = typeof db
