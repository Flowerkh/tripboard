/**
 * Copy for the 화면 설명 layers (components/Help.tsx). Each mark points at an element with
 * data-help="<id>"; marks whose element isn't on screen are skipped. Keep each text to one short
 * line (about 22 characters) so the card stays small enough to fit between the lit controls.
 */
export type HelpMark = { id: string; title: string; text: string };
/** drop: when the card can't fit between the lit controls, these marks go first (in this order). */
export type HelpScreen = { id: string; title: string; marks: HelpMark[]; drop: string[] };

const S = (id: string, title: string, marks: [string, string, string][], drop: string[] = []): HelpScreen =>
  ({ id, title, marks: marks.map(([m, t, x]) => ({ id: m, title: t, text: x })), drop });

export const HELP = {
  home: S("home", "홈 화면 쓰는 법", [
    ["login", "카카오로 로그인", "로그인하면 AI로 일정을 짜고 고쳐요"],
    ["account", "계정 · 설정", "지도 앱, 화면 모드, 계정을 관리해요"],
    ["now", "지금 여행 중", "여행 날엔 지금 일정과 길찾기가 여기 떠요"],
    ["card", "여행 카드", "누르면 하루하루 일정과 지도가 열려요"],
    ["samples", "샘플 여행", "예시 여행 2개를 넣어서 먼저 둘러봐요"],
    ["new", "새 여행 만들기", "날짜 · 장소 · 취향만 고르면 AI가 짜요"],
  ], ["login", "now", "samples", "account"]),
  kind: S("new-1", "새 여행 · 어디로", [
    ["kind-overseas", "해외여행", "공항과 항공편 시간까지 맞춰 짜요"],
    ["kind-domestic", "국내여행", "출발지와 교통수단에 맞춰 짜요"],
  ]),
  dates: S("new-2", "날짜 고르기 쓰는 법", [
    ["dates", "가는 날 · 오는 날", "누르면 달력이 열려요. 두 번 누르면 끝"],
    ["presets", "비행기에서 1박", "밤 비행기면 눌러서 기내박으로 바꿔요"],
    ["nights", "밤 칸", "칸을 누르면 숙소 · 기내 · 이동을 골라요"],
  ], ["presets"]),
  overseas: S("new-3o", "나라 · 항공편 쓰는 법", [
    ["ov-place", "나라 · 도시", "도시는 비워 두면 AI가 골라요"],
    ["ov-ticket", "e-티켓 캡처로 채우기", "캡처를 올리면 항공편을 읽어 채워요"],
    ["ov-noflight", "항공편 미정", "켜 두면 보통 시간으로 잡아 둬요"],
  ], ["ov-noflight", "ov-place"]),
  domestic: S("new-3d", "도시 · 교통 쓰는 법", [
    ["dm-city", "도시", "가고 싶은 도시를 쓰거나 골라요"],
    ["dm-transport", "교통수단", "고른 수단에 맞춰 길찾기도 바뀌어요"],
    ["dm-times", "도착 · 출발 시간", "모르면 비워 두세요. 보통 시간으로 잡아요"],
  ], ["dm-times"]),
  style: S("new-4", "취향 고르기 쓰는 법", [
    ["st-who", "누구와", "같이 가는 사람에 맞춰 장소를 골라요"],
    ["st-likes", "좋아하는 것", "여러 개 골라도 돼요"],
    ["st-pace", "하루 페이스", "하루에 몇 곳을 넣을지 정해요"],
    ["st-finish", "일정 만들기", "AI로 짜거나, 빈 일정에서 직접 채워요"],
  ], ["st-likes", "st-who"]),
  trip: S("trip", "여행 보기 쓰는 법", [
    ["share", "공유", "링크를 보내면 일정을 같이 봐요"],
    ["days", "일차 탭", "누르면 그날 일정과 지도로 바뀌어요"],
    ["route", "동선 보기", "그날 동선을 지도 앱에서 열어요"],
    ["item", "일정 한 줄", "누르면 시간 · 장소를 고치거나 지워요"],
    ["trip-ask", "말로 고치기 · 대화 기록", "“점심 30분 미뤄줘”처럼 말하면 바뀌어요"],
  ], ["route", "share", "item"]),
  now: S("now", "여행 중 화면 쓰는 법", [
    ["now-locate", "내 위치", "지도에 지금 내 위치를 보여 줘요"],
    ["now-nav", "길찾기", "다음 장소까지 지도 앱으로 길을 찾아요"],
    ["now-shift", "30분 미루기", "늦어지면 남은 일정을 한 번에 미뤄요"],
    ["now-chips", "빠른 부탁", "비 올 때, 지칠 때 눌러서 AI에게 맡겨요"],
    ["now-ask", "말로 고치기", "“30분 늦어질 것 같아”처럼 말해요"],
  ], ["now-locate", "now-chips"]),
  chat: S("chat", "AI 대화 쓰는 법", [
    ["chat-examples", "예시 문장", "눌러서 바로 보내 볼 수 있어요"],
    ["chat-undo", "되돌리기", "바뀐 게 마음에 안 들면 되돌려요"],
    ["chat-ask", "말하기 칸", "하루씩 나눠 말하면 더 잘 알아들어요"],
    ["chat-ask-toggle", "대화 닫기", "닫아도 기록은 남아요. 말풍선으로 다시 열어요"],
  ], ["chat-examples", "chat-undo"]),
} satisfies Record<string, HelpScreen>;
