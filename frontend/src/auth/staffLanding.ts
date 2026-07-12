/** Permissions that unlock the staff Settings shell (tabs may be narrower). */
export const STAFF_SETTINGS_ACCESS: readonly string[] = [
  "settings:read",
  "settings:write",
  "subscription_plan:read",
  "subscription_plan:write",
];

export type StaffLandingInput = {
  authRequired: boolean;
  customerId: string | null;
  isAdmin: boolean;
  hasPermission: (p: string) => boolean;
  hasAnyPermission: (ids: readonly string[]) => boolean;
};

type RouteKey = "dashboard" | "jobs" | "reports" | "customers" | "settings";

const ROUTE_ORDER: { key: RouteKey; path: string; can: (i: StaffLandingInput) => boolean }[] = [
  { key: "dashboard", path: "/dashboard", can: (i) => i.isAdmin || i.hasPermission("dashboard:read") },
  { key: "jobs", path: "/jobs", can: (i) => i.isAdmin || i.hasPermission("job:read") },
  { key: "reports", path: "/reports", can: (i) => i.isAdmin || i.hasPermission("report:read") },
  { key: "customers", path: "/customers", can: (i) => i.isAdmin || i.hasPermission("customer:read") },
  {
    key: "settings",
    path: "/settings",
    can: (i) => i.isAdmin || i.hasAnyPermission(STAFF_SETTINGS_ACCESS),
  },
];

/**
 * First staff route to show after login or when a section is forbidden.
 * Portal users should be handled before calling this.
 */
export function firstAccessibleStaffPath(input: StaffLandingInput): string | null {
  const { authRequired, customerId, isAdmin } = input;
  if (!authRequired) {
    return "/jobs";
  }
  if (customerId && !isAdmin) {
    return "/portal";
  }
  for (const { can, path } of ROUTE_ORDER) {
    if (can(input)) {
      return path;
    }
  }
  return isAdmin ? "/dashboard" : null;
}

/** Next staff route when `denyKey` is not allowed (avoid redirect loops). */
export function nextStaffPathAfterDeny(input: StaffLandingInput, denyKey: RouteKey): string | null {
  for (const { key, path, can } of ROUTE_ORDER) {
    if (key === denyKey) {
      continue;
    }
    if (can(input)) {
      return path;
    }
  }
  return input.isAdmin ? "/dashboard" : null;
}
