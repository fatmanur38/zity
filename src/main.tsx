import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { I18nProvider } from "./i18n/I18nProvider";
// Ship the typeface rather than hoping the OS has one like it. Without this
// the UI fell back to SF Pro on macOS and Segoe UI on Windows — and because
// Segoe UI is not a variable font, every intermediate weight (650, 750)
// collapsed to 600/700 there. Subsets are unicode-range gated, so an English
// page fetches ~48 KB and a Turkish one ~133 KB.
import "@fontsource-variable/inter/wght.css";
import "./styles.css";
import "./styles-redesign.css";
import "./experience-redesign.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <App />
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
