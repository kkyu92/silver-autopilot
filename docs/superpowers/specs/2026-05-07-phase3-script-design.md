# Silver Autopilot — Phase 3: 스크립트 생성 설계 스펙

**날짜**: 2026-05-07
**범위**: scraped_posts 원문 → Claude API → 7,500자+ 나레이션 스크립트 + 메타데이터 생성
**제외**: TTS, SRT, 영상 (Phase 4+)

---

## 1. 목표

`pipeline_runs.source_content`(원문)를 입력으로 받아 Claude API를 2단계로 호출해 YouTube 나레이션 스크립트와 메타데이터를 생성한다.

---

## 2. 스크립트 스타일

- **형식**: 1인칭 나레이션 전용, 대사 없음
- **구조**:
  1. **훅 (200~300자)**: 전체 이야기 중 가장 긴장감 있는 클라이막스 장면을 먼저 제시
  2. **전환**: "이야기는 ~부터 시작됩니다" 형태로 본문 시작
  3. **본문**: 처음부터 1인칭으로 사건 전개, 감정 묘사 중심
- **최소 길이**: 7,500자

---

## 3. 파일 구조

```
src/worker/
  prompts/
    script-system.ts     ← 소설가 페르소나 시스템 프롬프트
  steps/
    script.ts            ← 2단계 API 호출 오케스트레이션 (stub 교체)
tests/worker/
  script.test.ts         ← 재시도 로직 단위 테스트
```

---

## 4. 환경변수

```
ANTHROPIC_API_KEY=sk-ant-...
```

Phase 3에서 처음 추가. `.env.local`에 설정.

---

## 5. 1단계: 스크립트 생성

### 5.1 API 설정

- 모델: `claude-sonnet-4-6`
- temperature: 1 (창작 최대)
- max_tokens: 8192

### 5.2 시스템 프롬프트 (`script-system.ts`)

소설가 페르소나. 핵심 지시사항:

- 독자 몰입을 위한 장면 묘사, 감각적 표현, 감정 이입
- 1인칭 나레이션 전용, 대사 금지
- 구조: 클라이막스 훅 → 전환 → 본문 전개
- 최소 7,500자 엄수
- 문어체가 아닌 입말체 (나레이션으로 읽힐 수 있도록)

### 5.3 유저 프롬프트

```
다음 원문을 바탕으로 YouTube 나레이션 스크립트를 작성하세요.

[원문]
{source_content}
```

### 5.4 재시도 로직 (Multi-turn)

응답이 7,500자 미만인 경우:

- 이전 응답을 `assistant` 메시지로 유지한 채 multi-turn 대화 계속
- 재요청 메시지: `"이전 스크립트가 {N}자입니다. 7,500자 이상이 되도록 장면 묘사와 감정을 더 풍부하게 확장해주세요."`
- 최대 2회 재시도 (총 3회 시도)
- 3회 후에도 미달이면 마지막 결과 그대로 사용 (파이프라인 중단 안 함)

---

## 6. 2단계: 메타데이터 생성

스크립트 완성 후 별도 API 호출.

- 모델: `claude-sonnet-4-6`
- temperature: 0 (일관성 우선)
- max_tokens: 512

### 6.1 유저 프롬프트

```
다음 YouTube 나레이션 스크립트를 바탕으로 메타데이터를 JSON으로 작성하세요.

[스크립트]
{script}

반드시 아래 형식의 JSON만 반환하세요:
{
  "title": "YouTube 제목 (50자 이내, 클릭 유도)",
  "description": "YouTube 설명 (200~300자)",
  "tags": "태그1,태그2,태그3,...",
  "image_prompt": "thumbnail image prompt in English (for image generation)"
}
```

### 6.2 JSON 파싱 전략

1. 응답에서 ` ```json ``` ` 코드 블록 추출 시도
2. 실패 시 응답 전체를 JSON 파싱 시도
3. 최종 실패 시: 빈 문자열로 채우고 파이프라인 계속 진행 (메타데이터 누락은 중단 사유 아님)

---

## 7. 반환값

```typescript
return {
  script,            // string
  script_title,      // string (파싱 실패 시 '')
  script_description,// string (파싱 실패 시 '')
  script_tags,       // string, 쉼표 구분 (파싱 실패 시 '')
  image_prompt,      // string (파싱 실패 시 '')
}
```

---

## 8. 에러 처리

- Anthropic API 호출 실패: 예외 throw → 파이프라인 `script` 스텝 실패로 기록
- 메타데이터 JSON 파싱 실패: 로그 기록 후 빈 값으로 계속 진행

---

## 9. 테스트

`tests/worker/script.test.ts`:

- 재시도 로직: 1회차 짧은 응답 → 2회차 충분한 응답 (Anthropic SDK mock)
- 재시도 횟수 초과: 3회 모두 미달 → 마지막 결과 반환
- JSON 파싱 성공 케이스
- JSON 파싱 실패 케이스 → 빈 문자열 fallback

---

## 10. Phase 3 완료 기준

- [ ] `@anthropic-ai/sdk` 설치
- [ ] `ANTHROPIC_API_KEY` 환경변수 설정
- [ ] 소설가 시스템 프롬프트 작성
- [ ] `runScript` 구현 (2단계 호출 + 재시도)
- [ ] 재시도 로직 단위 테스트 통과
- [ ] `pnpm worker` 실행 시 script 스텝 성공, `pipeline_runs.script` 채워짐

---

## 11. 다음 단계

Phase 3 완료 후 → Phase 4: TTS (스크립트 → 음성 파일)
