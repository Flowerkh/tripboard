/**
 * The trip chat stays about trips. The filter itself runs on the AI server with lists the admin edits
 * (supabase/functions/ai/filter.ts, admin page "대화 필터"); the app only caps input length and
 * recognises the marker the AI puts on refusals.
 */
export const OFF_MARK = "[범위밖]";
export const OFF_REPLY = "여행 일정에 관한 것만 도와드릴 수 있어요. 예를 들어 '둘째 날 점심 바꿔줘', '비 오면 실내 위주로 바꿔줘'처럼 말해 주세요.";
export const MAX_INPUT = 300;
