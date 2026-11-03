import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Pretendard (SIL OFL): plain Korean gothic that stays crisp on Windows, Mac and phones; only the glyph sets a page uses are downloaded
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./styles.css";
import { installHScroll } from "./lib/hscroll";
import { installShareSync } from "./lib/shareSync";
import { installCloud } from "./lib/cloud";
import { installSplash } from "./lib/splash";

installHScroll();
installShareSync();
installCloud();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

installSplash();
