import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { go } from "../components/ui";
import { clearRunError, runAi, stopAi } from "../lib/ai/run";
import { durLabel, fmtDay, seasonOf } from "../lib/dates";
import type { Run } from "../lib/store";
import { routeLabel, tripDays, tripEnd } from "../lib/trip";
import type { Trip } from "../lib/types";

export function Generating({ trip, run }: { trip: Trip; run: Run }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.floor((Date.now() - run.startedAt) / 1000);
  const days = tripDays(trip);
  const arrive = trip.legs.out?.arr?.slice(11, 16);
  const leave = trip.legs.back?.dep?.slice(11, 16);
  type St = "done" | "active" | "todo";
  const raw: [boolean, string, string][] = [
    [run.stage >= 1, "계절 확인", `${fmtDay(trip.start)}부터 · ${trip.season || seasonOf(trip.start)}`],
    [run.stage >= 1, "이동 시간 반영", arrive ? `첫날 ${arrive} 도착 기준${leave ? ` · 마지막 날 ${leave} 출발 전까지` : ""}` : "보통 시간 기준으로 잡아요"],
    [run.stage >= 1, "계절 추천 고르기", `${trip.styles.slice(0, 3).join(" · ") || "취향"}에 맞춰`],
    ...days.map((d, i): [boolean, string, string] => [run.stage >= 2, `${i + 1}일차 일정`, fmtDay(d)]),
  ];
  const firstTodo = raw.findIndex((r) => !r[0]);
  const steps = raw.map(([done, a, b], i): [St, string, string] => [done ? "done" : i === firstTodo && !run.error ? "active" : "todo", a, b]);
  return (
    <main className="screen" aria-busy={!run.error}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: run.error ? "var(--bad)" : "var(--accent-text)" }}>
          <Icon name="sparkle" size={16} />{run.error ? "일정을 짜지 못했어요" : "AI가 일정을 짜고 있어요"}
        </span>
        <h1 style={{ fontSize: 26, letterSpacing: "-0.02em" }}>{trip.title}</h1>
        <span className="muted" style={{ fontSize: 14 }}>
          <span className="mono">{fmtDay(trip.start)} – {fmtDay(tripEnd(trip))}</span> · {durLabel(trip.nights)}{routeLabel(trip) ? ` · ${routeLabel(trip)}` : ""}
        </span>
      </div>

      <ol className="steps card">
        {steps.map(([state, t1, t2]) => (
          <li key={t1} className={state}>
            <span className="dot">{state === "done" && <Icon name="check" size={14} stroke={3} />}</span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <b className="t1" style={{ fontSize: 15 }}>{t1}</b>
              <span className="muted" style={{ fontSize: 13 }}>{t2}</span>
            </span>
          </li>
        ))}
      </ol>

      {run.error ? (
        <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ color: "var(--bad)" }}>{run.error}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button type="button" className="btn" onClick={() => { clearRunError(); go("/settings"); }}>설정 열기</button>
            <button type="button" className="btn primary" onClick={() => { clearRunError(); runAi(trip.id, { kind: "plan" }); }}>다시 시도</button>
          </div>
          <button type="button" className="link-btn" onClick={clearRunError}>빈 일정으로 보기</button>
        </div>
      ) : (
        <div className="dock-bottom" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p className="muted" style={{ textAlign: "center", fontSize: 13 }}>
            <span className="mono">{secs}초</span> 지났어요. 보통 1~3분 걸려요.
          </p>
          <button type="button" className="btn big" onClick={stopAi}><Icon name="stop" size={16} fill />멈추기</button>
        </div>
      )}
    </main>
  );
}
