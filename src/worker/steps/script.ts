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
