import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { installHScroll } from "./lib/hscroll";
import { installShareSync } from "./lib/shareSync";
import { installCloud } from "./lib/cloud";

installHScroll();
installShareSync();
installCloud();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
