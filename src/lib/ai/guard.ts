/**
 * Keeps the trip chat about trips, so tokens aren't spent on unrelated requests.
 *
 * A (here, free): obvious off-topic messages are answered by the app without calling the AI.
 *   A message is stopped only when it hits an off-topic topic AND has no travel words,
 *   so "오사카에서 고백하기 좋은 곳" still goes through.
 * B (prompts.ts): the AI refuses anything else that is off-topic in one sentence, starting with OFF_MARK.
 * The lists are defaults; the admin page will be able to edit them later.
 */

export interface Topic { name: string; words: string[] }

export const OFFTOPIC_TOPICS: Topic[] = [
  { name: "개발·코딩", words: ["코딩", "코드 짜", "코드 작성", "코드 만들", "프로그래밍", "파이썬", "자바스크립트", "타입스크립트", "리액트", "알고리즘", "디버깅", "개발해", "앱 만들어", "웹사이트 만들", "sql", "html", "css"] },
  { name: "연애·인간관계", words: ["연애", "썸 타", "썸타", "남친", "여친", "남자친구", "여자친구", "헤어졌", "헤어지", "이별", "소개팅", "짝사랑", "재회"] },
  { name: "숙제·업무 글쓰기", words: ["숙제", "과제", "레포트", "리포트", "논문", "자소서", "자기소개서", "시험 문제", "보고서 써", "이메일 써"] },
  { name: "투자·돈", words: ["주식", "코인", "비트코인", "투자", "부동산", "대출", "청약"] },
];

export const TRAVEL_WORDS = [
  "여행", "일정", "동선", "코스", "맛집", "식당", "카페", "숙소", "호텔", "게스트하우스", "공항", "비행", "항공", "기차", "ktx", "버스", "지하철", "택시", "렌트",
  "지도", "길찾기", "관광", "명소", "구경", "산책", "쇼핑", "시장", "점심", "저녁", "아침", "브런치", "야경", "날씨", "비 와", "눈 와", "도착", "출발",
  "체크인", "체크아웃", "장소", "곳", "어디", "가볼", "가고", "가자", "일차", "첫날", "마지막 날", "오늘", "내일", "미뤄", "당겨", "빼줘", "넣어", "바꿔",
];

export const OFF_MARK = "[범위밖]";
export const OFF_REPLY = "여행 일정에 관한 것만 도와드릴 수 있어요. 예를 들어 '둘째 날 점심 바꿔줘', '비 오면 실내 위주로 바꿔줘'처럼 말해 주세요.";
export const MAX_INPUT = 300;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

/** The off-topic topic a message is clearly about, or null when it may go to the AI. */
export function offTopic(text: string): string | null {
  const t = norm(text);
  if (TRAVEL_WORDS.some((w) => t.includes(w))) return null;
  const hit = OFFTOPIC_TOPICS.find((topic) => topic.words.some((w) => t.includes(norm(w))));
  return hit ? hit.name : null;
}
