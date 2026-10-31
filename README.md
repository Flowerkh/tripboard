# 트립보드

대화로 짜고, 여행 중에도 바로 고치는 여행 일정 앱의 웹 버전이에요.
안드로이드 앱으로 옮기기 전에 브라우저에서 테스트하려고 만들었어요.

## 들어 있는 것

- **홈**: 여행 중인 여행(지금 · 다음 일정 · 길찾기), 다가오는 여행, 다녀온 여행. 비어 있는 칸은 점선으로 표시돼요.
- **새 여행 만들기 (4단계)**: 해외/국내 → 달력에서 날짜·기간 → 해외는 나라·항공편, 국내는 도시·교통수단 → 취향 → AI로 일정 짜기
- **여행 보기**: 날짜 탭, 지도 동선(OpenStreetMap), 계절 추천, 시간표, 길찾기 링크(해외 구글맵 / 국내 카카오맵·네이버지도)
- **여행 중 화면**: 지도 중심 화면에 지금 · 다음 일정, 걸어서 걸리는 시간(직선 기준 추정), 30분 미루기, 내 위치
- **AI 대화**: "점심 30분 미뤄줘", "비 와요, 실내로 바꿔줘"처럼 말하면 일정과 지도가 바로 바뀌어요. 바뀐 내용은 되돌릴 수 있어요.
- **설정**: 화면 모드(시스템/밝게/어둡게), 국내 지도 앱, API 키, AI 모델, "AI가 바꾸기 전에 확인 받기"

## 실행하기

Node.js 20 이상이 필요해요.

```bash
npm install
npm run dev      # http://localhost:5173 에서 열려요
npm run build    # dist 폴더에 배포용 파일이 만들어져요
```

처음 열면 여행이 비어 있어요. 홈의 "샘플 여행 2개 넣어서 둘러보기"를 누르면 오사카(어제 출발, 지금 여행 중)와 부산(6주 뒤) 샘플이 들어가요.

## GitHub에 올려서 웹으로 띄우기

1. GitHub에서 새 저장소를 만들어요 (예: `tripboard`).
2. 이 폴더에서:
   ```bash
   git init
   git add .
   git commit -m "트립보드 웹 버전"
   git branch -M main
   git remote add origin https://github.com/<내아이디>/tripboard.git
   git push -u origin main
   ```
3. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿔요.
4. Actions 탭에서 배포가 끝나면 `https://<내아이디>.github.io/tripboard/` 에서 열려요. 이후엔 main에 push할 때마다 자동으로 다시 배포돼요.

## AI 쓰는 방법

| 방식 | 언제 | 설정 |
|---|---|---|
| 데모 모드 | 키 없이 화면만 둘러볼 때 | 아무것도 안 넣으면 돼요. "30분 미뤄줘", "(일정 이름) 빼줘" 정도만 알아듣고, 일정 짜기는 장소 없는 틀만 만들어요. |
| 내 API 키 | 혼자 테스트할 때 | 설정 → Claude API 키. 키는 이 브라우저(localStorage)에만 저장되고 Claude API로만 보내져요. |
| AI 서버 주소 | 안드로이드 앱 · 다른 사람에게 배포할 때 | 설정 → AI 서버 주소. 키는 서버에만 둬요. 아래 참고. |

- API 키는 [Claude 콘솔](https://platform.claude.com)에서 만들어요.
- **키를 코드나 저장소에 절대 넣지 마세요.** 공개 저장소에 올라간 키는 바로 도용될 수 있어요. 이 앱은 키를 코드에 넣지 않고 설정 화면에서만 받아요.
- 기본 모델은 Sonnet 5.5예요. 설정에서 "대화 수정 모델"을 Haiku 5.5로 바꾸면 비용이 크게 줄어요. 요금은 [Claude API 요금](https://platform.claude.com/docs/en/about-claude/pricing)을 보세요.

## 알아둘 점

- **저장**: 여행은 이 기기 브라우저에만 저장돼요. 공유한 여행만 Supabase에 복사본이 올라가요(아래 '일정 공유'). 저장 코드는 `src/lib/store.ts` 한 곳에 모여 있어요.
- **지도**: OpenStreetMap 공개 타일을 써요. 테스트엔 괜찮지만 사용자가 많아지면 쓸 수 없어요(OSM 타일 사용 정책). 정식 앱에선 지도 SDK(구글 · 카카오 · 네이버)나 유료 타일 서비스로 바꿔요. `src/components/MapView.tsx`만 바꾸면 돼요.
- **위치 정보**: 장소 좌표는 AI가 아는 범위에서 넣어요. 틀릴 수 있으니 길찾기 링크는 장소 이름으로 검색해요.
- **음성 입력**: 크롬 · 안드로이드 크롬에서만 마이크 버튼이 보여요.

## 카카오 로그인 · 여러 기기에서 같은 여행 (Supabase Auth)

로그인은 선택이에요. 안 해도 이 기기에서는 다 써요.

- 홈 오른쪽 위 **로그인** 또는 설정 → 계정 → **카카오로 로그인**.
- 로그인하면 여행이 계정(`user_trips` 테이블)에 저장되고, 같은 카카오 계정으로 로그인한 폰·PC에 같은 여행이 보여요. 이 기기에 있던 여행도 계정으로 옮겨져요.
- 고치면 1~2초 뒤 올라가고, 다른 기기는 앱으로 돌아올 때·1분마다 받아와요. 두 곳에서 같은 여행을 고쳤으면 나중에 고친 쪽이 남아요.
- 공유 링크도 계정에 같이 저장돼서, 어느 기기에서 고쳐도 받은 사람에게 반영돼요.
- AI 대화 기록과 API 키는 기기마다 따로예요.
- 로그아웃하면 이 기기에서 여행이 지워지고, 다시 로그인하면 돌아와요.
- 각자 자기 여행만 읽고 쓸 수 있게 RLS로 막혀 있어요.

설정 (한 번만)

1. 카카오 개발자 사이트: 앱 만들기 → REST API 키에 리다이렉트 URI `https://ubmovsguvpqpdguwivst.supabase.co/auth/v1/callback`, 클라이언트 시크릿 켜기 → 카카오 로그인 ON → 동의항목 닉네임·프로필 사진.
2. Supabase → Authentication → Sign In / Providers → Kakao: REST API 키, 클라이언트 시크릿, Allow users without an email ON.
3. Supabase → Authentication → URL Configuration: Site URL `https://flowerkh.github.io/tripboard/`, Redirect URLs `https://flowerkh.github.io/tripboard/**` (로컬 테스트면 `http://localhost:5173/**`도).

## 일정 공유 (Supabase)

여행 화면 위쪽 공유 버튼 → **공유 링크 만들기**.

- 링크(`…/#/t/<id>`)를 받은 사람은 로그인 없이 지도와 일정을 보고, **내 여행에 저장하기**로 복사본을 가져갈 수 있어요.
- 공유 중에 일정을 고치면(직접 · AI · 되돌리기 모두) 1~2초 뒤 자동으로 올라가고, 받은 사람 화면은 30초마다·앱으로 돌아올 때 새로고침돼요.
- **공유 멈추기**를 누르거나 여행을 지우면 DB에서 지워지고 링크가 더 이상 열리지 않아요.
- 올라가지 않는 것: AI 대화, 요청 메모, 동행 정보, 설정, API 키.
- **글로 보내기**: 카톡에 붙여 넣는 일정표 글. DB 없이도 돼요.

구조

- Supabase 프로젝트 `tripboard`(서울 리전, 무료). 설정은 `src/lib/config.ts`의 URL과 publishable 키(공개용 키라 코드에 있어도 돼요).
- 테이블 `shared_trips`는 직접 읽기·쓰기가 막혀 있고, 함수 네 개로만 접근해요: `share_get`(링크 id로 한 개 읽기), `share_create`, `share_update`·`share_delete`(만든 브라우저에만 있는 비밀 토큰이 있어야 함). SQL은 `supabase/migrations/`에 있어요.
- 링크를 아는 사람은 누구나 볼 수 있으니, 민감한 정보는 일정에 넣지 마세요.
- 공유 링크를 만든 기기(브라우저)에서만 고칠 수 있어요. 여러 사람이 같이 고치려면 로그인(Supabase Auth)을 붙이는 다음 단계가 필요해요.

## 안드로이드 앱으로 만들기 (Capacitor)

이 웹 코드를 그대로 안드로이드 앱으로 감쌀 수 있어요. Android Studio가 필요해요.

```bash
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli
npx cap init 트립보드 com.example.tripboard --web-dir dist
npx cap add android
npm run build && npx cap sync android
npx cap open android      # Android Studio에서 실행
```

앱으로 옮길 때 바꿀 것:

1. **AI는 서버를 거치게**: `server/cloudflare-worker.js` 예시를 Cloudflare Workers에 배포하고, 그 주소를 설정의 "AI 서버 주소"에 넣어요(또는 코드 기본값으로). 공개 전에는 로그인과 사용자별 요청 제한을 꼭 붙여요.
2. **위치 · 음성**: 앱 안 WebView에서는 `@capacitor/geolocation`, 음성 인식 플러그인을 써야 해요.
3. **알림**: 다음 일정 알림은 `@capacitor/local-notifications`로 붙이면 돼요.
4. **같이 보기**: DB를 붙이면 같이 가는 사람 화면에도 실시간으로 반영돼요.

## 폴더 구조

```
src/
  App.tsx              화면 이동(해시 주소)과 다크 모드
  screens/             홈 · 새 여행 · 생성 중 · 여행 보기 · 여행 중 · 시트들 · 설정
  components/          지도, 아이콘, 시간표 한 줄, 공통 UI
  lib/store.ts         저장(localStorage)과 되돌리기
  lib/ai/              Claude 호출, 일정 고치는 도구, 프롬프트, 데모 모드
  lib/links.ts         구글맵 · 카카오맵 · 네이버지도 링크
  lib/cloud.ts         카카오 로그인 · 계정에 여행 저장/동기화
  lib/share.ts         공유 링크(Supabase) · 글로 보내기
  lib/shareSync.ts     공유 중인 여행 자동 반영
  lib/hscroll.ts       PC에서 가로 줄 마우스 스크롤
server/                AI 프록시 예시 (앱 배포용)
supabase/migrations/   DB 테이블·함수 SQL (공유 링크, 계정별 여행)
.github/workflows/     GitHub Pages 자동 배포
```
