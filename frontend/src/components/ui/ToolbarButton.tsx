import { AppButton, type AppButtonProps } from "./AppButton";

export type ToolbarButtonProps = Omit<AppButtonProps, "size"> & {
  variant?: "secondary" | "ghost" | "accent" | "danger";
};

/** Compact toolbar control — Refresh, Download, Clear, etc. */
export function ToolbarButton({ variant = "secondary", className = "", ...props }: ToolbarButtonProps) {
  return <AppButton variant={variant} size="sm" className={`shrink-0 ${className}`.trim()} {...props} />;
}
