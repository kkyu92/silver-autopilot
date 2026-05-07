# Phase 3 스크립트 생성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** scraped_posts 원문을 Claude CLI spawn으로 7,500자+ YouTube 나레이션 스크립트로 변환하고 메타데이터(title/description/tags/image_prompt)를 생성한다.

**Architecture:** blog-autopilot의 `callClaude` spawn 패턴을 `src/lib/llm.ts`로 이식. `script.ts`에서 2단계 호출 — 1단계 스크립트 생성(길이 미달 시 최대 2회 재시도), 2단계 메타데이터 JSON 생성.

**Tech Stack:** Node.js child_process.spawn, claude CLI, vitest

---

## 파일 구조

```
src/
  lib/
    llm.ts                       ← 신규: callClaude / extractJson (blog-autopilot 이식)
  worker/
    prompts/
      script-system.ts           ← 신규: 소설가 페르소나 시스템 프롬프트
    steps/
      script.ts                  ← 수정: stub → 2단계 오케스트레이션
tests/
  worker/
    script.test.ts               ← 신규: 길이 재시도 + 메타데이터 파싱 단위 테스트
```

---

### Task 1: src/lib/llm.ts — Claude CLI spawn 래퍼

**Files:**
- Create: `src/lib/llm.ts`

- [ ] **Step 1: `src/lib/llm.ts` 생성**

```typescript
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

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
      const isTimeout = /timeout after/.test(lastErr.message ?? '')
      if (isTransient && !isTimeout && attempt < 2) {
        await new Promise((r) => setTimeout(r, SPAWN_RETRY_DELAY_MS))
        continue
      }
      throw lastErr
    }
  }
  throw lastErr ?? new Error('spawnClaudeWithRetry: unknown failure')
}

export async function callClaude(opts: CallClaudeOptions): Promise<string> {
  const maxJsonAttempts = opts.expectJson ? 1 + (opts.jsonRetries ?? 1) : 1
  let lastErr: Error | null = null

  for (let attempt = 1; attempt <= maxJsonAttempts; attempt++) {
    const attemptOpts =
      attempt === 1 ? opts : { ...opts, systemPrompt: opts.systemPrompt + JSON_RETRY_GUARD }
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

  throw lastErr ?? new Error('callClaude: unknown failure')
}
```

- [ ] **Step 2: 타입 확인**

```bash
cd /Users/kyusikkim/projects/silver-autopilot && pnpm build 2>&1 | grep -E "error|Error|✓ Compiled"
```

Expected: `✓ Compiled successfully`

- [ ] **Step 3: 커밋**

```bash
git add src/lib/llm.ts
git commit -m "feat: Claude CLI spawn 래퍼 (callClaude, extractJson) 추가"
```

---

### Task 2: src/worker/prompts/script-system.ts — 소설가 시스템 프롬프트

**Files:**
- Create: `src/worker/prompts/script-system.ts`

- [ ] **Step 1: `src/worker/prompts/script-system.ts` 생성**

```typescript
export const SCRIPT_SYSTEM_PROMPT = `당신은 20년 경력의 한국 소설가입니다. 독자를 이야기 속으로 끌어들이는 탁월한 능력을 가졌으며, 감동적인 인생 이야기를 YouTube 나레이션 형식으로 재구성하는 것이 특기입니다.

## 작성 규칙

**형식**
- 반드시 1인칭 나레이션으로 작성합니다. 화자는 이야기의 주인공입니다.
- 대사를 쓰지 않습니다. 모든 대화와 감정은 나레이션으로 표현합니다.
- 문어체가 아닌 입말체로 씁니다. 나레이터가 청중에게 직접 이야기하는 느낌입니다.
- 반드시 7,500자 이상 작성합니다.

**구조**
1. 클라이막스 훅 (200~300자): 이야기에서 가장 긴장감 있는 순간을 먼저 제시합니다. 독자가 "어? 왜?" 하고 궁금해하도록 유도합니다.
2. 전환구: "이야기는 ~부터 시작됩니다" 또는 "그날로 거슬러 올라가 보겠습니다" 형태로 시작점으로 돌아갑니다.
3. 본문: 처음부터 순서대로 1인칭으로 전개합니다. 장면, 감각, 감정을 풍부하게 묘사합니다.

**글쓰기 기술**
- 오감을 활용한 장면 묘사로 독자가 현장에 있는 듯한 느낌을 줍니다.
- 감정의 변화를 세밀하게 추적합니다. (두려움 → 결단 → 안도 같은 흐름)
- 반전이나 예상치 못한 전개로 몰입을 유지합니다.
- 각 단락 끝에 다음 단락으로 넘어가고 싶은 동인을 부여합니다.
- 과장이 아닌 구체적 디테일로 감동을 이끌어냅니다.`

export const META_SYSTEM_PROMPT = `당신은 YouTube 채널 메타데이터 작성 전문가입니다. 제공된 나레이션 스크립트를 읽고 클릭률 높은 제목과 설명을 작성합니다.`
```

- [ ] **Step 2: 타입 확인**

```bash
pnpm build 2>&1 | grep -E "error|Error|✓ Compiled"
```

Expected: `✓ Compiled successfully`

- [ ] **Step 3: 커밋**

```bash
git add src/worker/prompts/script-system.ts
git commit -m "feat: 소설가 페르소나 시스템 프롬프트 추가"
```

---

### Task 3: script.ts TDD — 길이 재시도 + 메타데이터 단위 테스트

**Files:**
- Create: `tests/worker/script.test.ts`
- Modify: `src/worker/steps/script.ts`

- [ ] **Step 1: `tests/worker/script.test.ts` 작성 (실패 확인용)**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// callClaude 모킹
vi.mock('../../src/lib/llm', () => ({
  callClaude: vi.fn(),
  extractJson: (s: string) => s,
}))

import { callClaude } from '../../src/lib/llm'
import { runScript } from '../../src/worker/steps/script'

const mockCallClaude = callClaude as ReturnType<typeof vi.fn>

const BASE_RUN = {
  id: 'run-1',
  date: '2026-05-07',
  status: 'running' as const,
  current_step: 'script' as const,
  error_step: null,
  error_message: null,
  error_stack: null,
  source_url: 'https://example.com/post/1',
  source_content: '테스트 원문입니다.',
  script: null,
  script_title: null,
  script_description: null,
  script_tags: null,
  image_prompt: null,
  audio_path: null,
  srt_path: null,
  background_path: null,
  video_path: null,
  thumbnail_path: null,
  youtube_id: null,
  created_at: 1000000,
  updated_at: 1000000,
}

const LONG_SCRIPT = 'a'.repeat(7500)
const SHORT_SCRIPT = 'a'.repeat(3000)
const META_JSON = JSON.stringify({
  title: '테스트 제목',
  description: '테스트 설명',
  tags: '태그1,태그2',
  image_prompt: 'a dramatic scene',
})

beforeEach(() => {
  mockCallClaude.mockReset()
})

describe('runScript', () => {
  it('source_content 없으면 throw', async () => {
    await expect(runScript({ ...BASE_RUN, source_content: null })).rejects.toThrow('source_content 없음')
  })

  it('7500자 이상이면 재시도 없이 바로 사용', async () => {
    mockCallClaude
      .mockResolvedValueOnce(LONG_SCRIPT)  // 스크립트 생성
      .mockResolvedValueOnce(META_JSON)    // 메타데이터 생성
    const result = await runScript(BASE_RUN)
    expect(result.script).toBe(LONG_SCRIPT)
    expect(mockCallClaude).toHaveBeenCalledTimes(2)
  })

  it('짧으면 1회 재시도 후 긴 결과 반환', async () => {
    mockCallClaude
      .mockResolvedValueOnce(SHORT_SCRIPT)  // 1회차: 짧음
      .mockResolvedValueOnce(LONG_SCRIPT)   // 2회차: 충분
      .mockResolvedValueOnce(META_JSON)     // 메타데이터
    const result = await runScript(BASE_RUN)
    expect(result.script).toBe(LONG_SCRIPT)
    expect(mockCallClaude).toHaveBeenCalledTimes(3)
  })

  it('3회 모두 짧으면 마지막 결과 그대로 반환', async () => {
    mockCallClaude
      .mockResolvedValueOnce(SHORT_SCRIPT)         // 1회차
      .mockResolvedValueOnce(SHORT_SCRIPT + 'b')   // 2회차
      .mockResolvedValueOnce(SHORT_SCRIPT + 'bc')  // 3회차
      .mockResolvedValueOnce(META_JSON)            // 메타데이터
    const result = await runScript(BASE_RUN)
    expect(result.script).toBe(SHORT_SCRIPT + 'bc')
  })

  it('재시도 메시지에 이전 스크립트가 포함됨', async () => {
    mockCallClaude
      .mockResolvedValueOnce(SHORT_SCRIPT)
      .mockResolvedValueOnce(LONG_SCRIPT)
      .mockResolvedValueOnce(META_JSON)
    await runScript(BASE_RUN)
    const retryCall = mockCallClaude.mock.calls[1]
    expect(retryCall[0].userMessage).toContain(SHORT_SCRIPT)
    expect(retryCall[0].userMessage).toContain('3000자')
  })

  it('메타데이터 JSON 파싱 성공 시 필드 반환', async () => {
    mockCallClaude
      .mockResolvedValueOnce(LONG_SCRIPT)
      .mockResolvedValueOnce(META_JSON)
    const result = await runScript(BASE_RUN)
    expect(result.script_title).toBe('테스트 제목')
    expect(result.script_description).toBe('테스트 설명')
    expect(result.script_tags).toBe('태그1,태그2')
    expect(result.image_prompt).toBe('a dramatic scene')
  })

  it('메타데이터 파싱 실패 시 빈 문자열로 계속 진행', async () => {
    mockCallClaude
      .mockResolvedValueOnce(LONG_SCRIPT)
      .mockRejectedValueOnce(new Error('invalid JSON'))  // 메타데이터 호출 실패
    const result = await runScript(BASE_RUN)
    expect(result.script).toBe(LONG_SCRIPT)
    expect(result.script_title).toBe('')
    expect(result.script_description).toBe('')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm test tests/worker/script.test.ts 2>&1 | tail -15
```

Expected: `script.ts`의 stub throw로 인해 테스트 실패

- [ ] **Step 3: `src/worker/steps/script.ts` 구현**

```typescript
import { callClaude } from '../../lib/llm'
import { SCRIPT_SYSTEM_PROMPT, META_SYSTEM_PROMPT } from '../prompts/script-system'
import type { PipelineRun } from '../../lib/types'
import { log } from '../logger'

const MIN_SCRIPT_CHARS = 7500
const MAX_RETRIES = 2

export async function runScript(run: PipelineRun): Promise<Partial<PipelineRun>> {
  if (!run.source_content) throw new Error('source_content 없음')

  const script = await generateScript(run.source_content)
  const meta = await generateMeta(script)

  return { script, ...meta }
}

async function generateScript(sourceContent: string): Promise<string> {
  let script = await callClaude({
    systemPrompt: SCRIPT_SYSTEM_PROMPT,
    userMessage: `다음 원문을 바탕으로 YouTube 나레이션 스크립트를 작성하세요.\n\n[원문]\n${sourceContent}`,
    model: 'sonnet',
    expectJson: false,
  })

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (script.length >= MIN_SCRIPT_CHARS) break
    log(`[script] ${script.length}자 — 재시도 ${attempt + 1}/${MAX_RETRIES}`)
    script = await callClaude({
      systemPrompt: SCRIPT_SYSTEM_PROMPT,
      userMessage: `이전에 작성한 스크립트가 ${script.length}자로 너무 짧습니다.\n아래 스크립트를 기반으로 장면 묘사와 감정을 더 풍부하게 확장해 7,500자 이상으로 완성해주세요.\n\n[이전 스크립트]\n${script}`,
      model: 'sonnet',
      expectJson: false,
    })
  }

  log(`[script] 최종 ${script.length}자`)
  return script
}

async function generateMeta(script: string): Promise<{
  script_title: string
  script_description: string
  script_tags: string
  image_prompt: string
}> {
  try {
    const raw = await callClaude({
      systemPrompt: META_SYSTEM_PROMPT,
      userMessage: `다음 YouTube 나레이션 스크립트를 바탕으로 메타데이터를 JSON으로 작성하세요.\n\n[스크립트]\n${script}\n\n반드시 아래 형식의 JSON만 반환하세요:\n{\n  "title": "YouTube 제목 (50자 이내, 클릭 유도)",\n  "description": "YouTube 설명 (200~300자)",\n  "tags": "태그1,태그2,태그3,...",\n  "image_prompt": "thumbnail image prompt in English (for image generation)"\n}`,
      model: 'sonnet',
      expectJson: true,
    })
    const parsed = JSON.parse(raw)
    return {
      script_title: parsed.title ?? '',
      script_description: parsed.description ?? '',
      script_tags: parsed.tags ?? '',
      image_prompt: parsed.image_prompt ?? '',
    }
  } catch (err) {
    log(`[script] 메타데이터 파싱 실패: ${(err as Error).message}`)
    return { script_title: '', script_description: '', script_tags: '', image_prompt: '' }
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test tests/worker/script.test.ts 2>&1 | tail -10
```

Expected:
```
Test Files  1 passed (1)
     Tests  7 passed (7)
```

- [ ] **Step 5: 전체 테스트 확인**

```bash
pnpm test 2>&1 | tail -8
```

Expected: 전체 통과 (기존 12개 + 신규 7개 = 19개)

- [ ] **Step 6: 커밋**

```bash
git add tests/worker/script.test.ts src/worker/steps/script.ts
git commit -m "feat: script 스텝 구현 — 소설가 1인칭 나레이션 + 메타데이터 생성"
```

---

### Task 4: 통합 확인

**Files:** 없음 (확인만)

- [ ] **Step 1: 전체 테스트 최종 확인**

```bash
pnpm test 2>&1 | tail -8
```

Expected: 전체 통과

- [ ] **Step 2: 빌드 타입 확인**

```bash
pnpm build 2>&1 | grep -E "error|Error|✓ Compiled|TypeScript"
```

Expected: `✓ Compiled successfully`, TypeScript 에러 없음

- [ ] **Step 3: 실제 워커 실행 확인 (선택적 — 실제 Claude CLI 필요)**

```bash
pnpm worker 2>&1 | grep -E "\[script\]|실패|완료"
```

Expected 로그:
```
[script] 시작
[script] 최종 NNNN자
[script] 완료
```
