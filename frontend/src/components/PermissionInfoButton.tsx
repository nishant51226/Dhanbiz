import type { ReactNode } from "react";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Tooltip } from "@mui/material";

type PermissionInfoButtonProps = {
  title: ReactNode;
  /** Prevents parent row toggles from firing when opening the tooltip. */
  stopPropagation?: boolean;
  size?: "xs" | "sm";
};

export function PermissionInfoButton({ title, stopPropagation = true, size = "sm" }: PermissionInfoButtonProps) {
  const iconSize = size === "xs" ? 14 : 16;
  return (
    <Tooltip title={title} arrow placement="top" enterTouchDelay={0}>
      <button
        type="button"
        className={`inline-flex shrink-0 items-center justify-center rounded-full text-muted-soft transition-colors hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand/30 ${
          size === "xs" ? "h-4 w-4" : "h-5 w-5"
        }`}
        aria-label="Permission details"
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
        }}
      >
        <InfoOutlinedIcon sx={{ fontSize: iconSize }} />
      </button>
    </Tooltip>
  );
}
