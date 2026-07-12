export const ROLE_TYPES = ["staff", "portal"] as const;

export type RoleType = (typeof ROLE_TYPES)[number];

export const SYSTEM_ROLE_NAMES = new Set([
  "manager",
  "accountant",
  "customer_admin",
  "customer_user",
]);

export function isRoleType(value: unknown): value is RoleType {
  return typeof value === "string" && (ROLE_TYPES as readonly string[]).includes(value);
}

export function parseRoleType(raw: unknown, fallback: RoleType = "staff"): RoleType {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  return isRoleType(t) ? t : fallback;
}
