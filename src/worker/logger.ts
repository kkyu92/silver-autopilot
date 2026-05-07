import fs from 'fs'
import path from 'path'

const LOGS_DIR = path.join(process.cwd(), 'logs')

function ts(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function log(message: string): void {
  const line = `[${ts()}] ${message}\n`
  process.stdout.write(line)
  fs.mkdirSync(LOGS_DIR, { recursive: true })
  fs.appendFileSync(path.join(LOGS_DIR, 'worker.log'), line)
  fs.appendFileSync(path.join(LOGS_DIR, `${today()}.log`), line)
}
