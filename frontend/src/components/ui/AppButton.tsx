import type { ButtonHTMLAttributes } from "react";

type AppButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type AppButtonSize = "sm" | "md" | "md-fixed" | "lg";

export type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
};

const variantClass: Record<AppButtonVariant, string> = {
  primary: "btn-primary",
  accent: "btn-accent",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

const sizeClass: Record<AppButtonSize, string> = {
  sm: "btn-sm",
  md: "btn-md",
  "md-fixed": "btn-md-fixed",
  lg: "btn-lg",
};

/** Theme-aligned native button — uses `index.css` token classes. */
export function AppButton({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: AppButtonProps) {
  const classes = [variantClass[variant], sizeClass[size], className].filter(Boolean).join(" ");
  return <button type={type} className={classes} {...props} />;
}
