# Silver Autopilot — Phase 4: TTS 설계 스펙

**날짜**: 2026-05-08
**범위**: pipeline_runs.script(5문단 마커 포함) → 음성 파일(.mp3) 생성 → pipeline_runs.audio_path 저장
**제외**: SRT, 영상 (Phase 5+)

---

## 1. 목표

`pipeline_runs.script`에 저장된 `[문단N]` 마커 분리 스크립트를 TTS API로 변환해 단일 mp3 파일로 저장한다. 초기 품질 비교를 위해 3개 provider를 동시 테스트할 수 있는 compare 스크립트를 함께 제공한다.

---

## 2. Phase 3 변경사항

`src/worker/prompts/script-system.ts`의 `SCRIPT_SYSTEM_PROMPT`를 수정한다.

### 2.1 추가 규칙

```
**형식 추가 규칙**
- 따옴표("", '', "", '')를 일절 사용하지 않습니다. 대화와 인용은 나레이션 문장으로 풀어씁니다.
- 이야기꾼이 청중에게 직접 말하는 입말체를 유지합니다. 글을 읽는 느낌이 아닌 말하는 느낌입니다.

**문단 구조**
스크립트 전체를 반드시 5개 문단으로 나누어 아래 마커를 사용합니다:

[문단1]
(훅: 클라이막스 장면, 200~300자)

[문단2]
(전환 + 이야기 배경 소개, 약 1,400자)

[문단3]
(사건 전개 전반부, 약 1,500자)

[문단4]
(사건 전개 후반부 + 위기, 약 1,500자)

[문단5]
(결말 + 감정 마무리, 약 1,500자)

각 문단은 [문단N] 마커로 시작하며 마커 이외의 텍스트는 순수 나레이션만 포함합니다.
각 문단은 반드시 1,500자를 초과하지 않습니다. (Naver TTS 5,000 bytes 한도: 한글 1,500자 × 3 bytes = 4,500 bytes)
```

### 2.2 마커 포맷

- 마커: `[문단1]`, `[문단2]`, `[문단3]`, `[문단4]`, `[문단5]`
- 각 문단 시작에 마커 한 줄 → 빈 줄 없이 본문 시작
- 마커는 TTS 호출 직전에 제거되므로 음성에 포함되지 않음

---

## 3. TTS 서비스

### 3.1 지원 Provider

| Provider | API | 한국어 남성 Voice | 무료 한도 |
|---|---|---|---|
| **Naver Clova** | REST (ncloud) | `ntaesan` | ~1M자/월 |
| **Google Cloud TTS** | REST | `ko-KR-Neural2-C` | 1M자/월 (WaveNet) |
| **ElevenLabs** | REST | `Adam` (multilingual v2) | 10,000자/월 (테스트용) |

Voice ID는 환경변수로 오버라이드 가능:
- `NAVER_TTS_VOICE=ntaesan`
- `GOOGLE_TTS_VOICE=ko-KR-Neural2-C`
- `ELEVENLABS_VOICE_ID=pNInz6obpgDQGcFmaJgB` (Adam)

### 3.2 텍스트 한도

| Provider | 요청 한도 | 1,500자 한글 (bytes) |
|---|---|---|
| Naver Clova | 5,000 bytes | ~4,500 bytes ✅ |
| Google TTS | 5,000자 | 1,500자 ✅ |
| ElevenLabs | 5,000자 | 1,500자 ✅ |

5문단 × ~1,500자 = 각 문단이 한도 내 처리됨.

---

## 4. 파일 구조

```
src/
  lib/
    tts/
      types.ts          ← TtsOptions 인터페이스, splitScript 유틸
      naver.ts          ← Naver Clova Voice 호출
      google.ts         ← Google Cloud TTS 호출
      elevenlabs.ts     ← ElevenLabs 호출
  worker/
    prompts/
      script-system.ts  ← 수정: 5문단 마커 + 따옴표 금지 규칙 추가
    steps/
      tts.ts            ← stub 교체: TTS_PROVIDER로 하나 선택
scripts/
  tts-compare.ts        ← 신규: 3개 provider 동시 실행
output/                 ← .gitignore에 추가 (음성 파일 커밋 제외)
  audio/                ← {run_id}.mp3
  compare/              ← {run_id}-naver.mp3, {run_id}-google.mp3, {run_id}-elevenlabs.mp3
```

---

## 5. 핵심 유틸: splitScript

`src/lib/tts/types.ts`

```typescript
export interface TtsOptions {
  voice?: string
  speed?: number  // 1.0 = 기본
}

const NAVER_MAX_BYTES = 4800  // 5,000 bytes 한도에서 안전 마진

export function splitScript(script: string): string[] {
  // [문단N] 마커로 분리, 마커 제거 후 트림
  const parts = script.split(/\[문단\d+\]/).map(s => s.trim()).filter(Boolean)
  if (parts.length === 0) throw new Error('스크립트에 [문단N] 마커가 없습니다')
  // 안전 검사: 한 문단이 Naver 한도 초과 시 경고 (구현에서 처리)
  for (const part of parts) {
    if (Buffer.byteLength(part, 'utf8') > NAVER_MAX_BYTES) {
      console.warn(`[tts] 문단이 ${Buffer.byteLength(part, 'utf8')} bytes로 한도 초과 — 추가 분할 필요`)
    }
  }
  return parts
}
```

---

## 6. Provider 구현

### 6.1 Naver Clova (`src/lib/tts/naver.ts`)

```
POST https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts
Headers:
  X-NCP-APIGW-API-KEY-ID: {NAVER_TTS_CLIENT_ID}
  X-NCP-APIGW-API-KEY: {NAVER_TTS_CLIENT_SECRET}
  Content-Type: application/x-www-form-urlencoded
Body: speaker={voice}&speed={speed}&text={encodedText}
Response: audio/mpeg binary
```

- 입력: 문단 텍스트 1개
- 출력: `Buffer` (mp3)
- 에러: HTTP 상태 코드 != 200 → throw

### 6.2 Google Cloud TTS (`src/lib/tts/google.ts`)

```
POST https://texttospeech.googleapis.com/v1/text:synthesize?key={GOOGLE_TTS_API_KEY}
Body: {
  input: { text: "..." },
  voice: { languageCode: "ko-KR", name: "ko-KR-Neural2-C" },
  audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 }
}
Response: { audioContent: base64 }
```

- 입력: 문단 텍스트 1개
- 출력: `Buffer` (base64 decode)
- 에러: response.error 존재 시 throw

### 6.3 ElevenLabs (`src/lib/tts/elevenlabs.ts`)

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}
Headers:
  xi-api-key: {ELEVENLABS_API_KEY}
  Content-Type: application/json
Body: {
  text: "...",
  model_id: "eleven_multilingual_v2",
  voice_settings: { stability: 0.5, similarity_boost: 0.75 }
}
Response: audio/mpeg binary
```

- 입력: 문단 텍스트 1개
- 출력: `Buffer` (mp3)
- 에러: HTTP 상태 코드 != 200 → throw

---

## 7. 메인 파이프라인 (`src/worker/steps/tts.ts`)

```typescript
// 흐름:
// 1. run.script에서 splitScript()로 5개 문단 추출
// 2. TTS_PROVIDER 환경변수로 provider 선택
// 3. 각 문단 순차 API 호출 → Buffer[]
// 4. Buffer.concat()으로 단일 mp3
// 5. output/audio/{run.id}.mp3 저장
// 6. { audio_path } 반환
```

- `TTS_PROVIDER`: `naver` | `google` | `elevenlabs` (기본값: `naver`)
- 출력 경로: `output/audio/{run.id}.mp3`
- 문단별 API 호출 실패 시: 1회 재시도 후 throw → 파이프라인 중단

---

## 8. 비교 스크립트 (`scripts/tts-compare.ts`)

`pnpm tts:compare` 명령으로 실행 (package.json scripts에 추가).

- `pipeline_runs`에서 가장 최근 완료된 `script` 컬럼 읽기
- 3개 provider 동시(Promise.allSettled) 실행
- 결과: `output/compare/{run_id}-{provider}.mp3`
- 한 provider 실패해도 나머지 계속 진행
- 완료 후 결과 요약 출력:
  ```
  ✅ naver: output/compare/xxx-naver.mp3 (1.2MB)
  ✅ google: output/compare/xxx-google.mp3 (0.9MB)
  ❌ elevenlabs: API quota exceeded
  ```

---

## 9. 환경변수

```
TTS_PROVIDER=naver

NAVER_TTS_CLIENT_ID=
NAVER_TTS_CLIENT_SECRET=
NAVER_TTS_VOICE=ntaesan

GOOGLE_TTS_API_KEY=
GOOGLE_TTS_VOICE=ko-KR-Neural2-C

ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=pNInz6obpgDQGcFmaJgB
```

---

## 10. 에러 처리

| 상황 | 처리 |
|---|---|
| `script`에 `[문단N]` 마커 없음 | throw → 파이프라인 중단 |
| 문단별 API 호출 실패 | 1회 재시도 후 실패 시 throw |
| 출력 디렉토리 없음 | `mkdirSync` 자동 생성 |
| 문단 bytes 초과 경고 | 콘솔 경고 후 처리 계속 (LLM이 1,500자 지시 따름에 의존) |
| tts-compare에서 provider 실패 | 해당 provider 건너뜀, 나머지 계속 |

---

## 11. 테스트

`tests/worker/tts.test.ts`

- `splitScript`: 마커 있을 때 5개 반환, 마커 없을 때 throw
- `runTts`: 각 문단별 provider mock 호출 확인, concat 결과 확인
- `runTts`: `TTS_PROVIDER` 환경변수에 따라 올바른 provider 선택 확인

---

## 12. Phase 4 완료 기준

- [ ] `SCRIPT_SYSTEM_PROMPT` 5문단 마커 + 따옴표 금지 추가
- [ ] `src/lib/tts/types.ts` — `splitScript` 구현
- [ ] `src/lib/tts/naver.ts` — Naver Clova 호출
- [ ] `src/lib/tts/google.ts` — Google Cloud TTS 호출
- [ ] `src/lib/tts/elevenlabs.ts` — ElevenLabs 호출
- [ ] `src/worker/steps/tts.ts` stub 교체
- [ ] `scripts/tts-compare.ts` 구현
- [ ] 단위 테스트 통과
- [ ] `pnpm worker` 실행 시 tts 스텝 성공, `pipeline_runs.audio_path` 채워짐

---

## 13. 다음 단계

Phase 4 완료 후 → Phase 5: SRT (음성 파일 → 자막 타임스탬프)
