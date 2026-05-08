# Silver Autopilot — Phase 5: SRT 설계 스펙

**날짜**: 2026-05-08
**범위**: `pipeline_runs.audio_path` (mp3) → 자막 타임스탬프 생성 → `pipeline_runs.srt_path` 저장
**제외**: 영상 합성 (Phase 6+)

---

## 1. 목표

Phase 4에서 생성된 mp3 파일을 Groq Whisper API로 transcribe하여, 한국어 노후사연 영상에 적합한 SRT 자막 파일을 생성한다. 자막 컨벤션은 시니어 타깃 큰 글자 + 한 줄 10자.

---

## 2. 핵심 결정사항

| 항목 | 결정 | 근거 |
|---|---|---|
| STT 엔진 | **Groq Whisper API** (`whisper-large-v3-turbo`, 한국어) | 무료 티어, 카드 등록 불필요, 하루 1편 워커에 충분 |
| 자막 단위 | **한 줄 10자, 한 줄만 표시** | 시니어 타깃 큰 글자 + 볼드 + stroke 스타일 |
| 텍스트 출처 | **Whisper 인식 텍스트 그대로** | 단순함, TTS 발음 = 자막 sync 정확 |
| 분할 방식 | **segment 기반 + word timestamp로 정확히 자르기** | segment 길면(>10자) word 시간으로 분할 |

---

## 3. 데이터 흐름

```
audio_path (mp3, output/audio/{run.id}.mp3)
  ↓
[1] Groq Whisper API 호출 (1회, mp3 통째로)
  ↓ verbose_json: { segments[], words[] }
[2] cue splitter
  ↓ 각 segment를 한 줄 10자로 word-timestamp 비례 분할
  → SrtCue[]
  ↓
[3] SRT 포맷터
  ↓ "1\n00:00:01,200 --> 00:00:03,400\n할머니의 손은\n\n" 형식
  → 문자열
  ↓
[4] output/srt/{run.id}.srt 저장
  ↓
{ srt_path } 반환
```

---

## 4. 파일 구조

```
src/
  lib/
    srt/
      types.ts           ← SrtCue, WhisperResponse, WhisperSegment, WhisperWord
      whisper.ts         ← Groq Whisper API 호출
      cue-splitter.ts    ← segment → 한 줄 10자 cue 재분할
      formatter.ts       ← Cue[] → .srt 문자열
  worker/
    steps/
      srt.ts             ← stub 교체: orchestration
output/
  srt/                   ← {run.id}.srt (.gitignore에 이미 포함)
```

---

## 5. Groq Whisper API 호출

`src/lib/srt/whisper.ts`

```
POST https://api.groq.com/openai/v1/audio/transcriptions
Headers:
  Authorization: Bearer {GROQ_API_KEY}
Body (multipart/form-data):
  file: <mp3 binary>
  model: whisper-large-v3-turbo
  language: ko
  response_format: verbose_json
  timestamp_granularities[]: word
  timestamp_granularities[]: segment
```

**응답 (verbose_json)**:
```json
{
  "text": "전체 텍스트...",
  "segments": [
    { "id": 0, "start": 0.0, "end": 3.2, "text": "할머니의 손은 거칠었다" },
    ...
  ],
  "words": [
    { "word": "할머니의", "start": 0.0, "end": 0.5 },
    { "word": "손은", "start": 0.5, "end": 0.9 },
    ...
  ]
}
```

- 입력: `audioPath: string`
- 출력: `WhisperResponse` (segments + words)
- 에러: HTTP != 200 → throw (메시지에 status + body 포함), 1회 재시도 후 실패 시 throw
- `GROQ_API_KEY` 미설정 시 즉시 throw

---

## 6. Cue Splitter

`src/lib/srt/cue-splitter.ts`

```typescript
function splitIntoCues(
  segments: WhisperSegment[],
  words: WhisperWord[]
): SrtCue[]
```

**상수**:
- `MAX_CHARS = 10` (한 줄 글자수, v1에서 강제하는 유일한 정책)

**알고리즘**:
1. 각 segment를 순회
2. segment.text를 단어별로 누적, 글자 수 카운트 (공백 제외)
3. 누적이 `MAX_CHARS` 초과 직전에 한 cue로 끊음
4. 끊는 시점: 직전 단어의 `end` time (words 배열에서 매칭)
5. 다음 cue는 그 시점부터 시작
6. segment 끝까지 반복

**예외 케이스**:
- segment에 word 없음 (Whisper 누락): segment 자체를 한 cue로 (분할 안 함)
- 한 단어가 10자 초과 (드묾): 그 단어를 한 cue로 (글자수 정책 위반 허용)

**v1 scope 외 (Phase 6 이후 결과 보고 결정)**:
- 자막 최소/최대 노출 시간 강제 (예: 너무 짧은 cue 병합, 너무 긴 cue 분할)
- v1은 Whisper word timestamp를 그대로 신뢰

**SrtCue 타입**:
```typescript
interface SrtCue {
  index: number      // 1, 2, 3...
  start: number      // 초 (예: 1.234)
  end: number
  text: string       // "할머니의 손은"
}
```

**word-text 매칭 주의사항**:
- Whisper의 `words[].word`는 segment.text의 substring으로 등장하지만 공백/구두점 처리가 미세하게 다를 수 있음
- 매칭 전략: segment.text의 word 누적 길이로 글자 수 추적, words 배열을 segment 시간 범위로 필터링

---

## 7. SRT 포맷터

`src/lib/srt/formatter.ts`

순수 함수: `SrtCue[]` → SRT 텍스트 문자열

```
1
00:00:00,000 --> 00:00:01,000
할머니의 손은

2
00:00:01,000 --> 00:00:01,800
거칠었지만

3
00:00:01,800 --> 00:00:03,500
그 손에서 만들어진

```

- 시간 포맷: `HH:MM:SS,mmm` (밀리초는 콤마 구분, SRT 표준)
- cue 사이 빈 줄 1개
- 파일 끝 빈 줄 1개

---

## 8. 메인 파이프라인

`src/worker/steps/srt.ts` (TTS 패턴 동일)

```typescript
export async function runSrt(run: PipelineRun): Promise<Partial<PipelineRun>> {
  if (!run.audio_path) throw new Error('audio_path 없음')

  // 1. Whisper 호출 (1회 재시도)
  const whisper = await callWithRetry(() => transcribe(run.audio_path!))

  // 2. cue 생성 (한 줄 10자 분할)
  const cues = splitIntoCues(whisper.segments, whisper.words)

  // 3. SRT 포맷
  const srt = formatSrt(cues)

  // 4. 저장
  const outDir = path.join(process.cwd(), 'output', 'srt')
  fs.mkdirSync(outDir, { recursive: true })
  const srtPath = path.join(outDir, `${run.id}.srt`)
  fs.writeFileSync(srtPath, srt, 'utf8')

  log(`[srt] 저장 완료: ${srtPath} (${cues.length} cues)`)
  return { srt_path: srtPath }
}
```

---

## 9. 환경변수

```
GROQ_API_KEY=
GROQ_WHISPER_MODEL=whisper-large-v3-turbo  # 옵션, 기본값 turbo
```

---

## 10. 에러 처리

| 상황 | 처리 |
|---|---|
| `audio_path` 없음 | throw → 파이프라인 중단 |
| `GROQ_API_KEY` 미설정 | 즉시 throw (API 호출 전) |
| Whisper API 호출 실패 | 1회 재시도 후 throw |
| Whisper 응답에 segments 비어있음 | throw "음성 인식 결과 없음" |
| segment에 word 누락 | 폴백: segment를 한 cue로 그대로 사용 |
| 출력 디렉토리 없음 | `mkdirSync` 자동 생성 |

---

## 11. 테스트

`tests/lib/srt/cue-splitter.test.ts` — 핵심 로직
- segment 짧을 때 (≤10자): 그대로 한 cue 반환
- segment 길 때 (>10자): word timestamp로 자른 여러 cue 반환
- cue 시작/끝 시간이 word timestamp와 일치
- segment에 word 없음 (폴백): segment 자체를 한 cue로
- 한 단어가 10자 초과: 그 단어를 한 cue로 (예외 허용)

`tests/lib/srt/formatter.test.ts` — 순수 변환
- SrtCue 배열 → 정확한 SRT 포맷 문자열
- 시간 포맷 `HH:MM:SS,mmm` (예: 1.234초 → `00:00:01,234`)
- 1시간 넘는 케이스, 0초 케이스, 정수 초 케이스

`tests/lib/srt/whisper.test.ts` — API 호출 (mock)
- 정상 응답 파싱
- HTTP 에러 시 1회 재시도 후 throw
- `GROQ_API_KEY` 미설정 시 즉시 throw

`tests/worker/srt.test.ts` — orchestration (mock)
- audio_path 없으면 throw
- 정상 흐름: Whisper mock → cue 분할 → SRT 저장 → `srt_path` 반환
- 파일이 실제로 생성되는지 (tmp 디렉토리)

---

## 12. Phase 5 완료 기준

- [ ] `src/lib/srt/types.ts` — 타입 정의
- [ ] `src/lib/srt/whisper.ts` — Groq Whisper API 호출
- [ ] `src/lib/srt/cue-splitter.ts` — 한 줄 10자 분할
- [ ] `src/lib/srt/formatter.ts` — SRT 포맷
- [ ] `src/worker/steps/srt.ts` stub 교체
- [ ] 단위 테스트 통과 (cue-splitter 위주)
- [ ] `pnpm worker` 실행 시 srt 스텝 성공, `pipeline_runs.srt_path` 채워짐

---

## 13. 다음 단계

Phase 5 완료 후 → Phase 6: 영상 합성 (배경 + 음성 + 자막 → mp4)
