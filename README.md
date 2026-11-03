# 트립보드

대화로 짜고, 여행 중에도 바로 고치는 여행 일정 앱의 웹 버전이에요.
안드로이드 앱으로 옮기기 전에 브라우저에서 테스트하려고 만들었어요.

## 들어 있는 것

- **홈**: 여행 중인 여행(지금 · 다음 일정 · 길찾기), 다가오는 여행, 다녀온 여행. 비어 있는 칸은 점선으로 표시돼요.
- **새 여행 만들기 (4단계)**: 해외/국내 → 달력에서 날짜·기간 → 해외는 나라·항공편, 국내는 도시·교통수단 → 취향 → AI로 일정 짜기
- **여행 보기**: 날짜 탭, 지도 동선(OpenStreetMap), 계절 추천, 시간표, 길찾기 링크(해외 구글맵 / 국내 카카오맵·네이버지도)
- **여행 중 화면**: 지도 중심 화면에 지금 · 다음 일정, 걸어서 걸리는 시간(직선 기준 추정), 30분 미루기, 내 위치
- **AI 대화**: "점심 30분 미뤄줘", "비 와요, 실내로 바꿔줘"처럼 말하면 일정과 지도가 바로 바뀌어요. 바뀐 내용은 되돌릴 수 있어요. 입력창 왼쪽 말풍선 버튼으로 이전 대화를 다시 볼 수 있어요.
- **설정**: 화면 모드(시스템/밝게/어둡게), 국내 지도 앱, 쓸 AI 고르기(Claude · Gemini · OpenAI 중 관리자가 켜 둔 것), 이번 달 AI 사용량, "AI가 바꾸기 전에 확인 받기"
- **관리자 페이지** (`#/admin`, 관리자 계정에만 버튼이 보여요): 사용량 보드, 회원 · 사용 한도, AI 키 · 모델, 대화 필터

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

AI는 **카카오로 로그인한 회원만** 써요. 로그인하지 않으면 대화창 자리에 로그인 버튼이 보여요.

- 앱에는 API 키가 없어요. 앱은 로그인 정보를 붙여 Supabase 서버 함수 `ai`로 요청하고, 서버가 관리자 페이지에 등록된 키로 Claude · Gemini · OpenAI를 불러요.
- 회원은 설정 → AI에서 관리자가 켜 둔 AI 중 하나를 골라요. 안 고르면 관리자가 정한 기본 AI를 써요. 고른 AI가 실패하면 기본 AI가 한 번 대신 답해요.
- 사용 한도: 기본 **하루 30회 · 한 달 300회**(한 번 요청한 것 = 1회, 필터에 걸린 건 안 셈). 관리자 페이지에서 전체 기본값과 회원별 한도를 바꾸고, 회원의 AI만 멈출 수도 있어요.
- 여행과 무관한 대화 걸러내기: 1단계는 서버가 단어로 먼저 걸러서 AI를 아예 부르지 않고(토큰 0), 2단계는 AI가 한 문장으로만 거절해요. 걸린 대화는 다음 요청에 다시 보내지 않아요. 입력은 300자까지.
- 모든 요청은 `ai_usage` 테이블에 토큰 · 예상 비용과 함께 남아요(비용은 관리자 페이지에 넣은 모델별 단가로 계산).

### 관리자 페이지

관리자 계정으로 로그인하면 홈 오른쪽 위 방패 버튼과 설정 → 계정의 **관리자 페이지** 버튼이 보여요. 다른 계정에는 버튼도 안 보이고, 주소로 들어와도 "관리자만 볼 수 있어요"가 나와요.

| 메뉴 | 하는 일 |
|---|---|
| 사용량 | 기간별 비용 · 요청 · 토큰 · 걸린 요청, AI별 하루 비용 그래프, 모델별 · 기능별 · 회원별 사용량 |
| 회원 | 회원 목록과 이번 달 사용량, 기본 한도 바꾸기, 회원별 한도 · AI 멈추기 · 이번 달 횟수 초기화, 닉네임 바꾸기 · 관리자 메모, 모든 기기에서 로그아웃, 이용 정지(7일 · 30일 · 무기한, 사유), 회원 삭제(이름을 입력해야 지워짐) |
| AI 키 · 모델 | Claude · Gemini · OpenAI 키 등록 · 확인 · 교체 · 삭제, 회원에게 보이기, 기본 AI, 기능별 모델과 단가 |
| 대화 필터 | 막을 주제와 단어, 통과시키는 여행 단어, 걸렸을 때 안내 문구, 시험해 보기, 최근 걸린 대화 |

- 키는 서버 DB(`ai_providers.api_key`)에만 저장되고, 앱이나 관리자 화면으로는 다시 읽을 수 없어요(끝 4자리만 보여요).
- 키 발급: [Claude](https://platform.claude.com) · [Gemini](https://aistudio.google.com) · [OpenAI](https://platform.openai.com). **키를 코드나 저장소에 절대 넣지 마세요.**
- 관리자 추가는 SQL로만: `insert into public.admins (user_id) values ('<auth.users의 id>');`
- 관리자 계정은 정지 · 로그아웃 · 삭제 · 탈퇴가 안 돼요.
- 정지 · 로그아웃 · 삭제는 서버 함수 `account`가 Supabase Auth 관리 API로 처리해요. 정지하면 바로 로그아웃되고, 앱을 다시 열거나 앞으로 가져오면 그 기기에서도 로그아웃되며 여행이 기기에서 지워져요(열어 둔 화면은 늦어도 1시간 안).
- 회원을 지우면(관리자 삭제 · 본인 탈퇴 같음): 계정, 계정의 여행, 회원별 한도 · 메모, 그 회원이 만든 공유 링크, 필터에 걸린 대화 내용이 지워지고, AI 사용 기록은 이름 없이 남아요.
- 카카오 연결 끊기(선택): 카카오 개발자 사이트 → 앱 키의 **Admin 키**를 Supabase → Edge Functions → Secrets에 `KAKAO_ADMIN_KEY`로 넣으면, 삭제할 때 카카오 쪽 연결도 끊어요. 없으면 이 단계만 건너뛰어요. Admin 키는 저장소나 대화에 붙여 넣지 마세요.

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
- AI 대화 기록은 기기마다 따로예요.
- 로그아웃하면 이 기기에서 여행이 지워지고, 다시 로그인하면 돌아와요.
- **탈퇴**: 설정 → 계정 → 탈퇴하기. 무엇이 지워지는지 보여 주고, 두 번 눌러야 탈퇴돼요. 웹에서도 똑같이 할 수 있어서 구글 플레이의 계정 삭제 요구(앱 안 + 웹)에 쓸 수 있어요.
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
- 올라가지 않는 것: AI 대화, 요청 메모, 동행 정보, 설정.
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

1. **로그인 돌아오는 주소**: 앱에서는 카카오 로그인 뒤 앱으로 돌아오는 딥링크를 Supabase Redirect URLs에 추가해요. AI는 이미 서버(`ai` 함수)를 거치니 그대로 써요.
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
  lib/ai/              AI 서버 호출, 일정 고치는 도구, 프롬프트
  lib/links.ts         구글맵 · 카카오맵 · 네이버지도 링크
  lib/cloud.ts         카카오 로그인 · 계정에 여행 저장/동기화
  lib/share.ts         공유 링크(Supabase) · 글로 보내기
  lib/shareSync.ts     공유 중인 여행 자동 반영
  lib/hscroll.ts       PC에서 가로 줄 마우스 스크롤
  admin/               관리자 페이지 (사용량 · 회원 · AI 키 · 대화 필터)
supabase/migrations/   DB 테이블·함수 SQL (공유 링크, 계정별 여행, 관리자 · AI 사용량)
supabase/functions/ai/ AI 서버 함수: 로그인 확인 → 한도 → 1단계 필터 → Claude/Gemini/OpenAI 호출 → 사용량 기록
supabase/functions/account/ 계정 서버 함수: 닉네임 · 로그아웃 · 정지 · 삭제(관리자), 탈퇴(회원)
.github/workflows/     GitHub Pages 자동 배포
```
