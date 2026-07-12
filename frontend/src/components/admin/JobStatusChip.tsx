import { Chip } from "@mui/material";
import type { ChipProps } from "@mui/material/Chip";
import type { JobStatus } from "../../types/api";

const STATUS_CHIP: Record<
  JobStatus,
  {
    label: string;
    color: ChipProps["color"];
    variant?: ChipProps["variant"];
  }
> = {
  queued: { label: "Queued", color: "default", variant: "outlined" },
  processing: { label: "Processing", color: "info", variant: "filled" },
  completed: { label: "Completed", color: "success", variant: "filled" },
  failed: { label: "Failed", color: "error", variant: "filled" },
  cancelled: { label: "Cancelled", color: "warning", variant: "filled" },
};

type JobStatusChipProps = {
  status: JobStatus;
};

export function JobStatusChip({ status }: JobStatusChipProps) {
  const cfg = STATUS_CHIP[status] ?? { label: status, color: "default" as const, variant: "outlined" as const };
  return (
    <Chip
      label={cfg.label}
      color={cfg.color}
      variant={cfg.variant ?? "filled"}
      size="small"
      sx={{
        fontWeight: 600,
        fontSize: 12,
        height: 22,
        borderRadius: "6px",
        ...(status === "processing" && {
          "@keyframes jobPulse": {
            "0%,100%": { opacity: 1 },
            "50%": { opacity: 0.55 },
          },
          animation: "jobPulse 2s ease-in-out infinite",
        }),
      }}
    />
  );
}
