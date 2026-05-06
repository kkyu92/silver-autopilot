# Silver Autopilot - Claude Code 설정

## 프로젝트 개요
노후사연 YouTube 콘텐츠 자동화 워커 (단일 사용자 전용)
- 감동적인 노후/인생 사연을 수집·가공하여 YouTube 영상 제작 파이프라인 자동화

## 기술 스택
- Next.js (App Router + API Routes) - 풀스택
- SQLite (better-sqlite3 / Drizzle ORM)
- Claude API (콘텐츠 생성 및 스크립트 작성)
- YouTube Data API v3 (업로드/발행)

## 허브 연결
- **허브 레포**: `kkyu92/playbook`
- **워커 역할**: Push 축 (lesson:/policy:/feedback: → 허브 dispatch) + Pull 축 (shared-rules/ 동기화)
- **채널**: `worker-lesson` dispatch (submit-lesson.yml)

## 환경별 역할
- **home**: 메인 실행 환경 (코드 작성, 테스트, 배포)
- **office**: 검토 & 지시 환경 (GitHub Issues, STATUS.md)

## 자동 승인 규칙
- 파일 생성/수정/삭제 → 자동 승인
- git commit & push → 자동 승인
- 패키지 설치 → 자동 승인
- 외부 API 호출 → 자동 승인

## 컨텍스트 공유
- STATUS.md: 작업 상태 추적 (autoplan 전용)
- GitHub Issues: 작업 단위 히스토리
- PLAN.md: 구현 플랜 (리뷰 결과 포함)

## shared-rules/
허브(playbook)가 sync-rules push로 채우는 공유 규칙 디렉토리.
직접 편집하지 말 것 — 허브에서 관리됨.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
