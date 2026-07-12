import type { SxProps, Theme } from "@mui/material/styles";

/**
 * Shared DataGrid chrome for staff list pages.
 * Sets `--DataGrid-t-header-background-base` so header cells, filler, and
 * scrollbar gutter share one background (avoids the white patch at 50 rows).
 */
export const ADMIN_DATA_GRID_SX: SxProps<Theme> = (theme) => ({
  border: "none",
  bgcolor: "background.paper",
  "--DataGrid-t-header-background-base": theme.palette.background.default,
  "& .MuiDataGrid-columnHeaders": {
    bgcolor: "background.default",
  },
  "& .MuiDataGrid-columnHeader": {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "text.secondary",
  },
  "& .MuiDataGrid-columnHeaders .MuiDataGrid-scrollbarFiller, & .MuiDataGrid-scrollbarFiller": {
    backgroundColor: theme.palette.background.default,
  },
  "& .MuiDataGrid-columnHeaders .MuiDataGrid-filler": {
    backgroundColor: theme.palette.background.default,
  },
  "& .MuiDataGrid-virtualScroller .MuiDataGrid-filler": {
    bgcolor: "background.paper",
  },
  "& .MuiDataGrid-cell": {
    fontSize: "0.8125rem",
    display: "flex",
    alignItems: "center",
  },
  "& .MuiDataGrid-cellContent": {
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  "& .MuiDataGrid-row": { cursor: "pointer" },
  "& .MuiDataGrid-row:hover": { bgcolor: "action.hover" },
  "& .MuiDataGrid-footerContainer": { borderTop: "1px solid", borderColor: "divider" },
});
