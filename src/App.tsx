import { lazy, Suspense, useEffect } from "react";
import { useRoute } from "./components/ui";
import { useApp } from "./lib/store";
import { Home } from "./screens/Home";
import { NewTrip } from "./screens/NewTrip";
import { Settings } from "./screens/Settings";
import { SharedView } from "./screens/SharedView";

// admin pages download only when an admin opens them
const AdminApp = lazy(() => import("./admin/AdminApp"));
import { TripNow } from "./screens/TripNow";
import { TripView } from "./screens/TripView";

function useTheme(pref: "system" | "light" | "dark") {
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = pref === "dark" || (pref === "system" && mq.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0e1420" : "#f3f5f9");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [pref]);
}

export function App() {
  const s = useApp();
  const route = useRoute();
  useTheme(s.settings.theme);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.join("/")]);

  const [a, b, c] = route;
  if (a === "admin") {
    return (
      <>
        <Suspense fallback={<div className="adm-gate"><p className="muted">관리자 화면을 여는 중…</p></div>}><AdminApp sub={b} arg={c} /></Suspense>
        {s.toast && <div className="toast" role="status">{s.toast}</div>}
      </>
    );
  }
  let screen;
  if (a === "trip" && b && c === "now") screen = <TripNow key={b + "now"} id={b} />;
  else if (a === "trip" && b) screen = <TripView key={b} id={b} />;
  else if (a === "new") screen = <NewTrip key={"new" + (b ?? "")} kind={b} />;
  else if (a === "edit" && b) screen = <NewTrip key={"edit" + b} editId={b} />;
  else if (a === "settings") screen = <Settings />;
  else if (a === "t" && b) screen = <SharedView key={"t" + b} id={b} />;
  else screen = <Home />;

  return (
    <div className="app">
      {screen}
      {s.toast && <div className="toast" role="status">{s.toast}</div>}
    </div>
  );
}
