const WD = ["일", "월", "화", "수", "목", "금", "토"];
export const pad = (n: number) => String(n).padStart(2, "0");

export function parseDay(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function dayStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function addDays(s: string, n: number): string {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return dayStr(d);
}
export function today(): string {
  return dayStr(new Date());
}
export function weekday(s: string): string {
  return WD[parseDay(s).getDay()];
}
/** "10.30 (금)" */
export function fmtDay(s: string): string {
  const d = parseDay(s);
  return `${d.getMonth() + 1}.${d.getDate()} (${WD[d.getDay()]})`;
}
/** "10.30" */
export function fmtShort(s: string): string {
  const d = parseDay(s);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}
export function durLabel(n: number): string {
  return n === 0 ? "당일치기" : `${n}박 ${n + 1}일`;
}
export function toMin(t: string | undefined | null): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "").trim());
  return m ? +m[1] * 60 + +m[2] : null;
}
export function fromMin(x: number): string {
  const v = Math.max(0, Math.min(24 * 60 - 1, Math.round(x)));
  return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;
}
export function normTime(t: unknown): string | null {
  const m = toMin(String(t ?? ""));
  return m == null ? null : fromMin(m);
}
export function nowMin(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}
export function untilLabel(mins: number): string {
  if (mins < 60) return `${mins}분`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}
/** Korea-centric default; AI replaces it with the destination's real season. */
export function seasonOf(s: string): string {
  const m = parseDay(s).getMonth() + 1;
  return ["", "한겨울", "늦겨울", "초봄", "봄", "늦봄", "초여름", "한여름", "늦여름", "초가을", "가을", "늦가을", "초겨울"][m];
}
export function uid(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
