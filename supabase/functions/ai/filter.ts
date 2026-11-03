/** Step 1 of the chat filter (no AI call). Config lives in ai_settings.filter and is edited on the admin page. */
export interface FilterConfig {
  stage1: boolean;
  stage2: boolean;
  reply: string;
  topics: { name: string; on: boolean; words: string[] }[];
  allow: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Which topic and word stopped the message, or null when it may go to the AI. */
export function check(text: string, f: FilterConfig): { topic: string; word: string } | null {
  const t = norm(text);
  if (!t) return null;
  if ((f.allow ?? []).some((w) => w && t.includes(norm(w)))) return null;
  for (const topic of f.topics ?? []) {
    if (!topic.on) continue;
    const word = (topic.words ?? []).find((w) => w && t.includes(norm(w)));
    if (word) return { topic: topic.name, word };
  }
  return null;
}

export const OFF_MARK = "[범위밖]";

/** Step 2: a rule the server puts in front of every chat request, whatever the app sends. */
export const GUARD =
  `너는 여행 일정 앱의 AI야. 여행 계획·일정·장소·이동·숙소·식당·날씨·현지 정보와 관련 없는 요청(코딩, 연애 상담, 숙제나 글쓰기, 투자, 잡담 등)에는 도구를 쓰지 말고, 답을 "${OFF_MARK}"으로 시작해서 여행 일정에 관한 것만 도울 수 있다고 한 문장으로만 말해.`;
