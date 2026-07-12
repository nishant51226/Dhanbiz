import { alpha, createTheme, type PaletteMode, type Theme, type ThemeOptions } from "@mui/material/styles";

/**
 * MUI theme aligned with `index.css` / Tailwind tokens (`surface`, `ink`, `brand`, borders).
 * Must stay in sync with `html.dark` toggled by `ThemeContext`.
 *
 * `MuiDataGrid` cannot sit on the same object literal as core `components` under strict tsc:
 * `createTheme` expects `Components<... & CssVarsTheme>`, which does not include X Data Grid keys
 * (module augmentation is unreliable here). Merge via `Record<string, unknown>` + assertion instead.
 */
export function createAdminMuiTheme(mode: PaletteMode) {
  const isDark = mode === "dark";

  const palette: ThemeOptions["palette"] = {
    mode,
    /** Matches `--color-brand-rgb` / Tailwind `bg-brand` (primary CTAs). */
    primary: {
      main: "#e8b800",
      light: isDark ? "#ffd700" : "#ffcc00",
      dark: isDark ? "#c9a000" : "#b8940a",
      contrastText: isDark ? "#0f1a1f" : "#0f172a",
    },
    /** Teal accent for secondary actions — same hues as legacy MUI primary. */
    secondary: {
      main: isDark ? "#5a8fa8" : "#1b4353",
      light: isDark ? "#7aa7bc" : "#2a5a6f",
      dark: isDark ? "#3d6b82" : "#0f2832",
      contrastText: "#ffffff",
    },
    background: {
      default: isDark ? "rgb(15, 26, 31)" : "rgb(244, 247, 249)",
      paper: isDark ? "rgb(21, 36, 45)" : "#ffffff",
    },
    text: {
      primary: isDark ? "rgb(232, 238, 242)" : "rgb(15, 23, 42)",
      secondary: isDark ? "rgb(159, 176, 187)" : "rgb(100, 116, 139)",
      disabled: isDark ? "rgb(107, 125, 136)" : "rgb(148, 163, 184)",
    },
    divider: isDark ? alpha("#e8eef2", 0.12) : alpha("#0f172a", 0.1),
    action: {
      active: isDark ? alpha("#fff", 0.65) : alpha("#0f172a", 0.65),
      hover: isDark ? alpha("#fff", 0.06) : alpha("#0f172a", 0.04),
      selected: alpha("#e8b800", isDark ? 0.14 : 0.1),
      disabled: isDark ? alpha("#fff", 0.28) : alpha("#0f172a", 0.28),
      disabledBackground: isDark ? alpha("#fff", 0.08) : alpha("#0f172a", 0.06),
    },
    error: {
      main: isDark ? "#f87171" : "#b91c1c",
      light: isDark ? "#fca5a5" : "#dc2626",
      dark: isDark ? "#ef4444" : "#991b1b",
    },
    warning: {
      main: isDark ? "#fbbf24" : "#b45309",
      light: isDark ? "#fcd34d" : "#d97706",
      dark: isDark ? "#f59e0b" : "#92400e",
    },
    success: {
      main: isDark ? "#4ade80" : "#15803d",
      light: isDark ? "#86efac" : "#22c55e",
      dark: isDark ? "#22c55e" : "#166534",
    },
    info: {
      main: isDark ? "#38bdf8" : "#0369a1",
      light: isDark ? "#7dd3fc" : "#0ea5e9",
      dark: isDark ? "#0ea5e9" : "#075985",
    },
  };

  const coreComponents: ThemeOptions["components"] = {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          colorScheme: mode,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          borderRadius: 10,
        },
      },
      variants: [
        {
          props: { variant: "contained", color: "primary" },
          style: ({ theme }: { theme: Theme }) => ({
            color: theme.palette.primary.contrastText,
            "&:hover": {
              backgroundColor: theme.palette.primary.light,
            },
            "&:active": {
              backgroundColor: theme.palette.primary.dark,
            },
          }),
        },
        {
          props: { variant: "contained", color: "secondary" },
          style: ({ theme }: { theme: Theme }) => ({
            "&:hover": {
              backgroundColor: theme.palette.secondary.light,
            },
          }),
        },
        {
          props: { variant: "outlined", color: "primary" },
          style: ({ theme }: { theme: Theme }) => ({
            borderColor: alpha(theme.palette.primary.main, 0.45),
            color: theme.palette.primary.main,
            "&:hover": {
              borderColor: theme.palette.primary.main,
              backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.12 : 0.08),
            },
          }),
        },
        {
          props: { variant: "outlined", color: "secondary" },
          style: ({ theme }: { theme: Theme }) => ({
            borderColor: alpha(theme.palette.secondary.main, 0.45),
            color: theme.palette.secondary.main,
            "&:hover": {
              borderColor: theme.palette.secondary.main,
              backgroundColor: alpha(theme.palette.secondary.main, theme.palette.mode === "dark" ? 0.12 : 0.08),
            },
          }),
        },
        {
          props: { variant: "text", color: "primary" },
          style: ({ theme }: { theme: Theme }) => ({
            color: theme.palette.primary.main,
            "&:hover": {
              backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.12 : 0.08),
            },
          }),
        },
      ],
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: "6px",
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          backgroundColor: "transparent",
          "&:before": { display: "none" },
        },
      },
    },
  };

  const dataGridSlot: Record<string, unknown> = {
    MuiDataGrid: {
      styleOverrides: {
        root: ({ theme }: { theme: Theme }) => ({
          borderColor: theme.palette.divider,
          "--DataGrid-containerBackground": theme.palette.background.paper,
          "--DataGrid-t-header-background-base": theme.palette.background.default,
          "& .MuiDataGrid-withBorderColor": {
            borderColor: theme.palette.divider,
          },
          "& .MuiDataGrid-columnHeaders": {
            backgroundColor:
              theme.palette.mode === "dark" ? alpha(theme.palette.common.white, 0.04) : alpha(theme.palette.common.black, 0.03),
            borderBottomColor: theme.palette.divider,
          },
          "& .MuiDataGrid-columnHeaders .MuiDataGrid-scrollbarFiller": {
            backgroundColor:
              theme.palette.mode === "dark" ? alpha(theme.palette.common.white, 0.04) : alpha(theme.palette.common.black, 0.03),
          },
          "& .MuiDataGrid-columnHeader--filler": {
            backgroundColor:
              theme.palette.mode === "dark" ? alpha(theme.palette.common.white, 0.04) : alpha(theme.palette.common.black, 0.03),
          },
          "& .MuiDataGrid-columnHeaderTitle": {
            color: theme.palette.text.secondary,
          },
          "& .MuiDataGrid-cell": {
            borderColor: theme.palette.divider,
          },
          "& .MuiDataGrid-footerContainer": {
            borderTopColor: theme.palette.divider,
          },
          "& .MuiTablePagination-root": {
            color: theme.palette.text.secondary,
          },
        }),
      },
    },
  };

  const components = { ...coreComponents, ...dataGridSlot } as unknown as ThemeOptions["components"];

  return createTheme({
    palette,
    typography: {
      fontFamily: '"Plus Jakarta Sans", "Segoe UI", Helvetica, Arial, sans-serif',
    },
    shape: { borderRadius: 10 },
    components,
  });
}
