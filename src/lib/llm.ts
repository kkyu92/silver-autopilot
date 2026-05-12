import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'

export interface CallClaudeOptions {
  systemPrompt: string
  userMessage: string
  model?: 'sonnet' | 'opus'
  expectJson?: boolean
  jsonRetries?: number
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 900_000
const FORCE_KILL_GRACE_MS = 5_000
const SPAWN_RETRY_DELAY_MS = 5_000
const SPAWN_TRANSIENT_PATTERN =
  /\b(ENOENT|EFAULT|EIO|EAGAIN|EBADF|EMFILE|ENFILE)\b|Unknown system error|spawn [a-z]+ failed/i

const SDK_MODEL_MAP = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
} as const

const SDK_MAX_TOKENS = 16_000

let sdkClientCache: Anthropic | null | undefined

function getSdkClient(): Anthropic | null {
  if (sdkClientCache !== undefined) return sdkClientCache
  const apiKey = process.env.ANTHROPIC_API_KEY
  sdkClientCache = apiKey ? new Anthropic({ apiKey }) : null
  return sdkClientCache
}

const JSON_GUARD =
  '\n\n---\n\nCRITICAL: Your response MUST be valid JSON only — no markdown headers, no preamble, no closing remarks, no code fences. Reply with the raw JSON object or array as the entire response. Start your response with `{` or `[` immediately.'

const JSON_RETRY_GUARD =
  '\n\n---\n\nRETRY (previous response rejected): JSON.parse failed on the prior attempt. Common causes — (1) unescaped " inside string values: use \\" for every internal double-quote, (2) trailing comma before } or ], (3) markdown code fences wrapping the output, (4) explanatory text after the closing brace. Re-emit the COMPLETE JSON object with ALL internal quotes properly escaped. Begin response with `{` immediately.'

export function extractJson(stdout: string): string {
  let s = stdout.trim()
  const fenceMatch = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/)
  if (fenceMatch) s = fenceMatch[1].trim()

  const start = s.search(/[{[]/)
  if (start === -1) throw new Error('no JSON delimiter found in output')
  s = s.slice(start)

  let depth = 0
  let inString = false
  let escape = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0) return s.slice(0, i + 1)
    }
  }
  return s
}

function dumpBadOutput(stdout: string): string | null {
  try {
    const dumpPath = join(homedir(), 'logs', `llm-bad-json-${Date.now()}.txt`)
    mkdirSync(dirname(dumpPath), { recursive: true })
    writeFileSync(dumpPath, stdout)
    return dumpPath
  } catch {
    return null
  }
}

function spawnClaudeOnce(
  opts: CallClaudeOptions,
): Promise<{ stdout: string; stderr: string; code: number | null; signal: NodeJS.Signals | null }> {
  const model = opts.model ?? 'sonnet'
  const systemPrompt = opts.expectJson ? opts.systemPrompt + JSON_GUARD : opts.systemPrompt
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return new Promise((resolve, reject) => {
    const child = spawn(
      'claude',
      ['-p', opts.userMessage, '--system-prompt', systemPrompt, '--dangerously-skip-permissions', '--model', model, '--tools', ''],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let settled = false
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined

    const timeoutTimer = setTimeout(() => {
      if (settled) return
      settled = true
      try { child.kill('SIGTERM') } catch { /* dead */ }
      forceKillTimer = setTimeout(() => {
        try { child.kill('SIGKILL') } catch { /* dead */ }
      }, FORCE_KILL_GRACE_MS)
      reject(new Error(`claude CLI timeout after ${timeoutMs}ms (SIGTERM sent)`))
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => { stdoutChunks.push(chunk) })
    child.stderr.on('data', (chunk: Buffer) => { stderrChunks.push(chunk) })
    child.on('close', (code, signal) => {
      clearTimeout(timeoutTimer)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      if (settled) return
      settled = true
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8').trim(),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        code,
        signal,
      })
    })
    child.on('error', (err) => {
      clearTimeout(timeoutTimer)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      if (settled) return
      settled = true
      reject(err)
    })
  })
}

async function spawnClaudeWithRetry(
  opts: CallClaudeOptions,
): Promise<{ stdout: string; stderr: string; code: number | null; signal: NodeJS.Signals | null }> {
  let lastErr: Error | null = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await spawnClaudeOnce(opts)
    } catch (err) {
      lastErr = err as Error
      const isTransient = SPAWN_TRANSIENT_PATTERN.test(lastErr.message ?? '')
      if (isTransient && attempt < 2) {
        await new Promise((r) => setTimeout(r, SPAWN_RETRY_DELAY_MS))
        continue
      }
      throw lastErr
    }
  }
  throw lastErr ?? new Error('spawnClaudeWithRetry: unknown failure')
}

async function callViaSdk(client: Anthropic, opts: CallClaudeOptions): Promise<string> {
  const modelName = opts.model ?? 'sonnet'
  const modelId = SDK_MODEL_MAP[modelName]
  const baseSystem = opts.expectJson ? opts.systemPrompt + JSON_GUARD : opts.systemPrompt
  const maxJsonAttempts = opts.expectJson ? 1 + (opts.jsonRetries ?? 1) : 1
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let lastErr: Error | null = null
  for (let attempt = 1; attempt <= maxJsonAttempts; attempt++) {
    const sysPrompt = attempt === 1 ? baseSystem : opts.systemPrompt + JSON_RETRY_GUARD
    const response = await client.messages.create(
      {
        model: modelId,
        max_tokens: SDK_MAX_TOKENS,
        system: sysPrompt,
        messages: [{ role: 'user', content: opts.userMessage }],
      },
      { timeout: timeoutMs },
    )

    const stdout = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    if (!opts.expectJson) return stdout

    try {
      const cleaned = extractJson(stdout)
      JSON.parse(cleaned)
      return cleaned
    } catch (e) {
      const dumpPath = dumpBadOutput(stdout)
      if (dumpPath) console.error(`[llm] raw dumped → ${dumpPath}`)
      lastErr = new Error(
        `invalid JSON (attempt ${attempt}/${maxJsonAttempts}): ${(e as Error).message}`,
      )
      if (attempt < maxJsonAttempts) continue
    }
  }
  throw lastErr ?? new Error('callViaSdk: unknown failure')
}

async function callViaCli(opts: CallClaudeOptions): Promise<string> {
  const maxJsonAttempts = opts.expectJson ? 1 + (opts.jsonRetries ?? 1) : 1
  let lastErr: Error | null = null

  for (let attempt = 1; attempt <= maxJsonAttempts; attempt++) {
    const attemptOpts =
      attempt === 1
        ? opts
        : { ...opts, systemPrompt: opts.systemPrompt + JSON_RETRY_GUARD, expectJson: false }
    const { stdout, stderr, code, signal } = await spawnClaudeWithRetry(attemptOpts)

    if (code !== 0) {
      throw new Error(`claude CLI exit ${code ?? `signal ${signal}`}: ${stderr}`)
    }

    if (!opts.expectJson) return stdout

    try {
      const cleaned = extractJson(stdout)
      JSON.parse(cleaned)
      return cleaned
    } catch (e) {
      const dumpPath = dumpBadOutput(stdout)
      if (dumpPath) console.error(`[llm] raw dumped → ${dumpPath}`)
      lastErr = new Error(
        `invalid JSON (attempt ${attempt}/${maxJsonAttempts}): ${(e as Error).message}`,
      )
      if (attempt < maxJsonAttempts) continue
    }
  }

  throw lastErr ?? new Error('callViaCli: unknown failure')
}

export async function callClaude(opts: CallClaudeOptions): Promise<string> {
  const client = getSdkClient()
  return client ? callViaSdk(client, opts) : callViaCli(opts)
}
