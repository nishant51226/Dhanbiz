import Box from "@mui/material/Box";
import type { GridFilterInputValueProps } from "@mui/x-data-grid";
import { useMemo } from "react";
import { DatePickerField } from "../DatePickerField";
import { formatYmd, parseYmd } from "../../utils/datePickerShared";

function filterValueToYmd(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatYmd(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const parsed = parseYmd(trimmed);
    if (parsed) return formatYmd(parsed);
  }
  return "";
}

/** MUI DataGrid date filter input — DD/MM/YYYY display, stores `Date` for operators. */
export function GridFilterDateInput(props: GridFilterInputValueProps) {
  const { item, applyValue } = props;
  const ymd = useMemo(() => filterValueToYmd(item.value), [item.value]);

  return (
    <Box sx={{ px: 0.5, py: 0.5, width: "100%", minWidth: 160 }}>
      <DatePickerField
        value={ymd}
        onChange={(next) => {
          if (!next.trim()) {
            applyValue({ ...item, value: undefined });
            return;
          }
          const d = parseYmd(next);
          applyValue({ ...item, value: d ?? undefined });
        }}
        aria-label="Filter date"
      />
    </Box>
  );
}
