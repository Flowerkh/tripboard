# 트립보드 · Claude 작업 지침

## 언어: 사용자에게 보이는 건 전부 한국어

- 답변, 질문, 안내는 한국어 해요체로, 짧게 써요.
- 작업 목록(할 일 제목, 진행 중 문구)도 한국어로 써요.
- 명령이나 도구를 실행할 때 붙이는 설명도 한국어로 써요. 예: "앱 빌드하고 테스트 돌리기"
- 커밋 메시지, PR 제목과 본문도 한국어로 써요.
- 앱 화면 문구, 오류 메시지, 토스트, 도움말 문구는 한국어로 써요.
- 코드의 변수 이름과 주석은 지금처럼 영어로 둬도 돼요.

## 일하는 순서

1. 새 화면이나 큰 화면 변경은 먼저 디자인 캔버스에 시안을 그려 보여 줘요. 디자인 캔버스는 "트립보드 앱 화면 설계"예요 (https://claude.ai/artifact/Dd5KrWJgnNLCAzqRbbMyw8). 확인을 받은 뒤에 만들어요. 바로 고쳐 달라는 작은 수정은 바로 고쳐요.
2. 고친 뒤에는 `npm run build`로 빌드해요. 그다음 Playwright 테스트를 돌려 확인해요. 테스트는 저장소 밖 `tripboard-tests` 폴더에 있고, `vite preview --port 4173`으로 띄워서 돌려요.
3. `main`에 push하면 GitHub Actions가 GitHub Pages에 배포해요 (https://flowerkh.github.io/tripboard/). 배포가 성공했는지 꼭 확인해요.

## 보안

- API 키는 절대 커밋하지 않아요.
- AI 키는 서버(`ai_providers.api_key`)에만 있어요. 화면에는 끝 4자리만 보여요.
- 카카오 시크릿과 어드민 키는 Supabase 대시보드나 시크릿에만 넣어요. 채팅으로 받지 않아요.
- Supabase 공개(publishable) 키는 코드에 있어도 괜찮아요.

## 프로젝트

- Vite + React + TypeScript 앱이에요.
- Supabase를 써요: 카카오 로그인, 일정 공유, AI 서버 함수 `ai`, 계정 함수 `account`가 있어요. 프로젝트 ref는 `ubmovsguvpqpdguwivst`(서울)예요.
- 화면 설명(? 버튼 투어)을 추가하는 법은 이래요.
  - 설명할 버튼에 `data-help="이름"`을 달아요.
  - 문구와 순서는 `src/lib/help.ts`에 적어요.
- 더 자세한 내용은 `README.md`에 있어요.
