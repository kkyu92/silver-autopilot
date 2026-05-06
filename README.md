# Silver Autopilot

노후사연 YouTube 콘텐츠 자동화 워커.

감동적인 노후/인생 사연을 수집·가공하여 YouTube 영상 스크립트 및 업로드를 자동화합니다.

## 허브 연결

이 레포는 [playbook](https://github.com/kkyu92/playbook) 허브의 워커입니다.

- `lesson:` / `policy:` / `feedback:` 커밋 → 허브 자동 dispatch (`.github/workflows/submit-lesson.yml`)
- `shared-rules/` → 허브 sync-rules push로 관리

## 시작하기

```bash
pnpm install
pnpm dev
```

## 환경변수

`.env.local` 파일 생성 후 설정:

```
ANTHROPIC_API_KEY=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
PLAYBOOK_PAT=
```
