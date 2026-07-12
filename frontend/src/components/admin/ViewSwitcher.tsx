import type { ReactNode } from "react";
import { Box, Tooltip } from "@mui/material";
import GridViewOutlined from "@mui/icons-material/GridViewOutlined";
import ViewColumnOutlined from "@mui/icons-material/ViewColumnOutlined";
import ViewKanbanOutlined from "@mui/icons-material/ViewKanbanOutlined";

export type JobsViewMode = "grid" | "board" | "column";

const VIEWS: { key: JobsViewMode; icon: ReactNode; label: string }[] = [
  { key: "grid", icon: <GridViewOutlined sx={{ fontSize: 17 }} />, label: "Grid view" },
  { key: "board", icon: <ViewKanbanOutlined sx={{ fontSize: 17 }} />, label: "Board view" },
  { key: "column", icon: <ViewColumnOutlined sx={{ fontSize: 17 }} />, label: "Column view" },
];

type ViewSwitcherProps = {
  view: JobsViewMode;
  onChange: (view: JobsViewMode) => void;
};

export function ViewSwitcher({ view, onChange }: ViewSwitcherProps) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1.5,
        overflow: "hidden",
        height: 36,
      }}
    >
      {VIEWS.map(({ key, icon, label }) => {
        const active = view === key;
        return (
          <Tooltip key={key} title={label}>
            <Box
              onClick={() => onChange(key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onChange(key);
                }
              }}
              role="button"
              tabIndex={0}
              sx={{
                width: 36,
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                bgcolor: active ? "primary.main" : "transparent",
                color: active ? "primary.contrastText" : "text.secondary",
                borderRight: key !== "column" ? "1px solid" : "none",
                borderColor: "divider",
                transition: "all 0.12s ease",
                "&:hover": {
                  bgcolor: active ? "primary.dark" : "action.hover",
                  color: active ? "primary.contrastText" : "text.primary",
                },
              }}
            >
              {icon}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
