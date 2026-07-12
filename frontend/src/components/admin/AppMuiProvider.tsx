import type { ReactNode } from "react";
import { useMemo } from "react";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { useUiTheme } from "../../theme/ThemeContext";
import { createAdminMuiTheme } from "../../theme/muiAdminTheme";

export function AppMuiProvider({ children }: { children: ReactNode }) {
  const { theme: uiTheme } = useUiTheme();
  const muiTheme = useMemo(() => createAdminMuiTheme(uiTheme === "dark" ? "dark" : "light"), [uiTheme]);

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}
