import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppMuiProvider } from "./components/admin/AppMuiProvider";
import { ThemeProvider } from "./theme/ThemeContext";
import "./index.css";

window.addEventListener("error", (e) => {
  console.error("[app] Uncaught error:", e.message, e.filename, `line ${e.lineno}`, e.error);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[app] Unhandled promise rejection:", e.reason);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AppMuiProvider>
        <App />
      </AppMuiProvider>
    </ThemeProvider>
  </StrictMode>
);
