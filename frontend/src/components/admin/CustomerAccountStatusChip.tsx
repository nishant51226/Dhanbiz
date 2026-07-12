import { Chip } from "@mui/material";
import type { ChipProps } from "@mui/material/Chip";
import type { CustomerAccountStatus } from "../../types/api";

const STATUS_CHIP: Record<
  CustomerAccountStatus,
  { label: string; color: ChipProps["color"]; variant?: ChipProps["variant"] }
> = {
  active: { label: "Active", color: "success", variant: "filled" },
  inactive: { label: "Inactive", color: "default", variant: "outlined" },
  proposed: { label: "Proposed", color: "secondary", variant: "filled" },
  draft: { label: "Draft", color: "warning", variant: "filled" },
};

type CustomerAccountStatusChipProps = {
  status: CustomerAccountStatus;
};

export function CustomerAccountStatusChip({ status }: CustomerAccountStatusChipProps) {
  const cfg = STATUS_CHIP[status] ?? { label: status, color: "default" as const, variant: "outlined" as const };
  return (
    <Chip
      label={cfg.label}
      color={cfg.color}
      variant={cfg.variant ?? "filled"}
      size="small"
      sx={{ fontWeight: 600, fontSize: 12, height: 22, borderRadius: "6px" }}
    />
  );
}
