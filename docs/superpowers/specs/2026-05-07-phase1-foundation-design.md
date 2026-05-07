# Silver Autopilot — Phase 1: Foundation 설계 스펙

**날짜**: 2026-05-07  
**범위**: DB 스키마, 오케스트레이터 뼈대, cron 등록, 로그/에러 추적  
**제외**: 어드민 UI (추후 필요 시 추가)

---

## 1. 전체 파이프라인 개요

은퇴/인생 사연 YouTube 채널 자동화 파이프라인. 매일 01:17 cron으로 실행.

```
cron 01:17
  └─ orchestrator.ts
       ├─ scrape      커뮤니티 사연 수집
       ├─ script      Claude Code 스크립트 재창작 (7,500자)
       ├─ tts         Naver Clova TTS → MP3
       ├─ srt         타임스탬프 → SRT 자막
       ├─ video       FFmpeg 루프 배경 + 음성 + 자막 → MP4 (30분)
       ├─ thumbnail   Ideogram/Leonardo/Getimg 유화 이미지 생성
       └─ upload      YouTube Data API 업로드
```

Phase 1은 이 파이프라인의 **뼈대**만 구현한다. 각 스텝은 stub으로 두고, 이후 Phase 2~7에서 순서대로 채운다.

---

## 2. DB 스키마

SQLite + Drizzle ORM. 테이블 2개.

### 2.1 `pipeline_runs`

파이프라인 실행 단위. 하루에 1개.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | text PK | nanoid |
| date | text | YYYY-MM-DD (unique) |
| status | text | `pending \| running \| failed \| done` |
| current_step | text | `scrape \| script \| tts \| srt \| video \| thumbnail \| upload` |
| error_step | text \| null | 실패한 스텝 이름 |
| error_message | text \| null | 에러 메시지 전문 |
| error_stack | text \| null | 스택 트레이스 |
| source_url | text \| null | 수집한 원본 게시물 URL |
| source_content | text \| null | 원본 내용 |
| script | text \| null | 생성된 스크립트 (7,500자) |
| script_title | text \| null | 영상 제목 |
| script_description | text \| null | 영상 설명 |
| script_tags | text \| null | JSON 배열 문자열 |
| image_prompt | text \| null | 썸네일 이미지 생성 프롬프트 |
| audio_path | text \| null | MP3 파일 경로 |
| srt_path | text \| null | SRT 파일 경로 |
| background_path | text \| null | 배경 클립 파일 경로 |
| video_path | text \| null | 최종 MP4 파일 경로 |
| thumbnail_path | text \| null | 생성된 일러스트 이미지 경로 |
| youtube_id | text \| null | YouTube 업로드 후 영상 ID |
| created_at | integer | Unix timestamp |
| updated_at | integer | Unix timestamp |

### 2.2 `scraped_posts`

수집한 원본 게시물. 중복 수집 방지용.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | text PK | nanoid |
| source | text | `nate \| naver_cafe \| bobae` |
| original_url | text UNIQUE | 원본 URL (중복 방지 키) |
| title | text | 게시물 제목 |
| content | text | 게시물 본문 |
| likes | integer | 좋아요 수 |
| comments | integer | 댓글 수 |
| scraped_at | integer | Unix timestamp |
| used | integer | 0 or 1 (파이프라인에 사용됐는지) |
| pipeline_run_id | text \| null | FK → pipeline_runs.id |

---

## 3. 파일 구조

```
src/
  db/
    schema.ts          Drizzle 스키마 정의
    index.ts           DB 커넥션 (singleton)
  worker/
    orchestrator.ts    메인 러너
    steps/
      scrape.ts        stub → Phase 2에서 구현
      script.ts        stub → Phase 3
      tts.ts           stub → Phase 4
      srt.ts           stub → Phase 4
      video.ts         stub → Phase 5
      thumbnail.ts     stub → Phase 6
      upload.ts        stub → Phase 7
    status.ts          현재 실행 상태 터미널 출력
    restart.ts         실패한 run 재시작
  lib/
    types.ts           공유 타입 (PipelineRun, StepName 등)
logs/
  worker.log           cron 실행 stdout/stderr (append)
  YYYY-MM-DD.log       날짜별 상세 실행 로그
storage/
  audio/               TTS MP3 파일
  video/               최종 MP4 파일
  thumbnail/           썸네일 일러스트 이미지
  background/          Pexels/Pixabay 배경 클립 캐시
```

---

## 4. 오케스트레이터 동작

### 4.1 실행 흐름

```typescript
// src/worker/orchestrator.ts 의사코드

async function main() {
  const today = getToday() // YYYY-MM-DD

  let run = db.findRunByDate(today)

  if (run?.status === 'done') {
    log('이미 완료됨, 종료')
    return
  }

  if (!run) {
    run = db.createRun({ date: today, status: 'pending', current_step: 'scrape' })
  }

  // 실패 시 failed_step부터 재시작
  const startStep = run.error_step ?? run.current_step ?? 'scrape'

  db.updateRun(run.id, { status: 'running' })

  const steps = ['scrape', 'script', 'tts', 'srt', 'video', 'thumbnail', 'upload']
  const startIndex = steps.indexOf(startStep)

  for (const step of steps.slice(startIndex)) {
    db.updateRun(run.id, { current_step: step, error_step: null })
    log(`[${step}] 시작`)

    try {
      await runStep(step, run)
      log(`[${step}] 완료`)
    } catch (err) {
      db.updateRun(run.id, {
        status: 'failed',
        error_step: step,
        error_message: err.message,
        error_stack: err.stack,
      })
      log(`[${step}] 실패: ${err.message}`)
      process.exit(1)
    }
  }

  db.updateRun(run.id, { status: 'done', current_step: 'upload' })
  log('파이프라인 완료')
}
```

### 4.2 스텝 stub (Phase 1)

```typescript
// 각 steps/*.ts — Phase 1에서는 모두 stub
export async function runScrape(run: PipelineRun) {
  // TODO: Phase 2에서 구현
  throw new Error('scrape step not implemented')
}
```

---

## 5. 로그 및 에러 추적

어드민 UI 없이 터미널과 파일로 모든 상태를 파악한다.

### 5.1 로그 구조

모든 로그는 두 곳에 동시 기록:
- `logs/worker.log` — 전체 append 로그 (cron stdout)
- `logs/YYYY-MM-DD.log` — 날짜별 상세 로그

로그 형식:
```
[2026-05-07 01:17:03] [scrape] 시작
[2026-05-07 01:17:05] [scrape] 완료
[2026-05-07 01:17:05] [script] 시작
[2026-05-07 01:17:42] [script] 실패: Naver Clova API timeout
[2026-05-07 01:17:42] [ERROR] Error: Naver Clova API timeout
    at runTts (src/worker/steps/tts.ts:34:11)
    at main (src/worker/orchestrator.ts:52:5)
```

### 5.2 에러 영구 보존

실패 시 DB의 `error_message` + `error_stack` 컬럼에 전문 저장. 나중에 언제든 조회 가능.

### 5.3 status.ts — 상태 확인 명령

```bash
pnpm tsx src/worker/status.ts
```

출력 예시:
```
=== Silver Autopilot 상태 ===

오늘 (2026-05-07): FAILED
  실패 스텝: tts
  에러: Naver Clova API timeout
  발생 시각: 01:17:42

최근 실행 내역:
  2026-05-06  DONE     upload  youtube.com/watch?v=xxx
  2026-05-05  DONE     upload  youtube.com/watch?v=yyy
  2026-05-04  FAILED   script  Claude API rate limit
  2026-05-03  DONE     upload  youtube.com/watch?v=zzz
```

### 5.4 restart.ts — 재시작 명령

```bash
pnpm tsx src/worker/restart.ts
```

오늘 실패한 run의 `status`를 `pending`으로 리셋하고 오케스트레이터 재실행. `error_step`에 기록된 스텝부터 자동으로 이어서 실행.

---

## 6. cron 등록

```bash
# crontab -e
17 1 * * * cd /Users/kyusikkim/projects/silver-autopilot && pnpm tsx src/worker/orchestrator.ts >> logs/worker.log 2>&1
```

---

## 7. 환경변수 (.env.local)

Phase 1에서는 아래 변수만 필요. 나머지는 각 Phase에서 추가.

```
# Phase 2~7에서 순서대로 채워나감
ANTHROPIC_API_KEY=         # Phase 3
NAVER_CLOVA_CLIENT_ID=     # Phase 4
NAVER_CLOVA_CLIENT_SECRET= # Phase 4
PEXELS_API_KEY=            # Phase 5
IDEOGRAM_API_KEY=          # Phase 6
LEONARDO_API_KEY=          # Phase 6
GETIMG_API_KEY=            # Phase 6
YOUTUBE_CLIENT_ID=         # Phase 7
YOUTUBE_CLIENT_SECRET=     # Phase 7
```

---

## 8. Phase 1 완료 기준

- [ ] DB 스키마 정의 + 마이그레이션 적용
- [ ] `pipeline_runs`, `scraped_posts` 테이블 생성 확인
- [ ] 오케스트레이터 뼈대 실행 (stub 스텝으로 failed 처리 확인)
- [ ] 로그 파일 생성 확인 (`logs/worker.log`, `logs/YYYY-MM-DD.log`)
- [ ] `status.ts` 실행 시 오늘 상태 출력 확인
- [ ] `restart.ts` 실행 시 재시작 동작 확인
- [ ] cron 등록 확인

---

## 9. 다음 단계

Phase 1 완료 후 → Phase 2: 스크래퍼 (네이트판/네이버카페/보배드림 수집)
