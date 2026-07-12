import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from "react";

export const THEME_STORAGE_KEY = "doc-parser-ui-theme";

export type UiTheme = "light" | "dark";

type ThemeContextValue = {
  theme: UiTheme;
  setTheme: (t: UiTheme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): UiTheme {
  if (typeof window === "undefined") return "light";
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "dark" || raw === "light") return raw;
  } catch {
    /* ignore */
  }
  return "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<UiTheme>(readStoredTheme);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((t: UiTheme) => {
    setThemeState(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
    }),
    [theme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** App light/dark preference (Tailwind `html.dark` + MUI palette). */
export function useUiTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useUiTheme must be used within ThemeProvider");
  }
  return ctx;
}
