import type { ReactNode } from "react";
import { Box, Tooltip } from "@mui/material";
import GridViewOutlined from "@mui/icons-material/GridViewOutlined";
import ViewColumnOutlined from "@mui/icons-material/ViewColumnOutlined";

export type FilesViewMode = "folder" | "list";

const VIEWS: { key: FilesViewMode; icon: ReactNode; label: string }[] = [
  { key: "folder", icon: <ViewColumnOutlined sx={{ fontSize: 17 }} />, label: "Folder view" },
  { key: "list", icon: <GridViewOutlined sx={{ fontSize: 17 }} />, label: "List view" },
];

type FilesViewSwitcherProps = {
  view: FilesViewMode;
  onChange: (view: FilesViewMode) => void;
};

export function FilesViewSwitcher({ view, onChange }: FilesViewSwitcherProps) {
  return (
    <Box
      role="group"
      aria-label="Browse mode"
      sx={{
        display: "flex",
        alignItems: "center",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1.5,
        overflow: "hidden",
        height: 36,
        flexShrink: 0,
      }}
    >
      {VIEWS.map(({ key, icon, label }, index) => {
        const active = view === key;
        const isLast = index === VIEWS.length - 1;
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
              aria-pressed={active}
              sx={{
                width: 36,
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                bgcolor: active ? "primary.main" : "transparent",
                color: active ? "primary.contrastText" : "text.secondary",
                borderRight: isLast ? "none" : "1px solid",
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
