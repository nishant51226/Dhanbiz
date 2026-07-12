export type CustomerWorkspaceTab =
  | "dashboard"
  | "details"
  | "subscription"
  | "users"
  | "forms"
  | "library-documents"
  | "jobs"
  | "settings";

type Ctx = {
  isAdmin: boolean;
  hasPermission: (p: string) => boolean;
  hasAnyPermission: (ids: readonly string[]) => boolean;
  /**
   * Portal login may open **only** `/customers/:id/dashboard`: they have `portal:settings:read` or
   * `portal:settings:write` but not `portal:customer:read` and no files/jobs permissions.
   */
  portalSettingsDashboardOnly?: boolean;
  /** Portal login with only `portal:dashboard:read` (home overview, no other workspace tabs). */
  portalDashboardOnly?: boolean;
};

/**
 * True when this portal role should see only the workspace dashboard (no Files/Jobs/Details).
 * Typical role: `portal:dashboard:read` without `portal:customer:read` or library access.
 */
export function portalDashboardOnlyFromMe(
  permissions: readonly string[],
  hasPermission: (p: string) => boolean,
  hasAnyPermission: (ids: readonly string[]) => boolean,
): boolean {
  const set = new Set(permissions);
  const hasDashboard =
    set.has("portal:dashboard:read") || hasPermission("customer:read") || set.has("portal:customer:read");
  if (!hasDashboard) return false;
  if (hasPermission("customer:read")) return false;
  if (set.has("portal:customer:read")) return false;
  if (hasPermission("portal:user:read") || hasPermission("portal:user:write")) return false;
  if (hasPermission("job:read")) return false;
  if (
    hasAnyPermission([
      "file:read",
      "file:write",
      "file:delete",
      "portal:file:read",
      "portal:file:write",
      "portal:file:delete",
    ])
  ) {
    return false;
  }
  if (hasAnyPermission(["portal:settings:read", "portal:settings:write"])) return false;
  return set.has("portal:dashboard:read");
}

/**
 * True when this portal role should be limited to the customer workspace dashboard only.
 * Requires settings read or write on the portal; excludes broader `portal:customer:read` and file/job access.
 */
export function portalSettingsDashboardOnlyFromMe(
  permissions: readonly string[],
  hasPermission: (p: string) => boolean,
  hasAnyPermission: (ids: readonly string[]) => boolean,
): boolean {
  const set = new Set(permissions);
  if (!set.has("portal:settings:read") && !set.has("portal:settings:write")) return false;
  if (set.has("portal:customer:read")) return false;
  if (hasPermission("job:read")) return false;
  if (
    hasAnyPermission([
      "file:read",
      "file:write",
      "file:delete",
      "portal:file:read",
      "portal:file:write",
      "portal:file:delete",
    ])
  ) {
    return false;
  }
  return true;
}

/** Whether the customer-page top navigation should show a tab. */
export function workspaceTabVisible(tab: CustomerWorkspaceTab, ctx: Ctx): boolean {
  if (ctx.isAdmin) {
    return true;
  }
  if (ctx.portalSettingsDashboardOnly) {
    return tab === "dashboard";
  }
  if (ctx.portalDashboardOnly) {
    return tab === "dashboard";
  }
  switch (tab) {
    case "dashboard":
      return (
        ctx.hasPermission("portal:dashboard:read") ||
        ctx.hasPermission("customer:read") ||
        ctx.hasPermission("portal:user:read")
      );
    case "details":
    case "users":
      return ctx.hasPermission("customer:read") || ctx.hasPermission("portal:user:read");
    case "forms":
      return ctx.hasPermission("customer:read");
    case "settings":
      return ctx.hasPermission("customer:read") || ctx.hasAnyPermission(["portal:settings:read", "portal:settings:write"]);
    case "subscription":
      return (
        ctx.hasPermission("customer:read") ||
        ctx.hasPermission("subscription_plan:read") ||
        ctx.hasPermission("subscription_plan:write")
      );
    case "library-documents":
      return ctx.hasAnyPermission([
        "file:read",
        "file:write",
        "file:delete",
        "portal:file:read",
        "portal:file:write",
        "portal:file:delete",
      ]);
    case "jobs":
      return ctx.hasPermission("job:read");
    default:
      return false;
  }
}

const WORKSPACE_TAB_FALLBACK_ORDER: CustomerWorkspaceTab[] = [
  "dashboard",
  "subscription",
  "details",
  "library-documents",
  "jobs",
  "users",
  "forms",
  "settings",
];

export function buildWorkspaceTabCtx(
  isAdmin: boolean,
  permissions: readonly string[],
  hasPermission: (p: string) => boolean,
  hasAnyPermission: (ids: readonly string[]) => boolean,
  isPortalScopedUser: boolean,
): Ctx {
  return {
    isAdmin,
    hasPermission,
    hasAnyPermission,
    portalSettingsDashboardOnly:
      isPortalScopedUser &&
      portalSettingsDashboardOnlyFromMe(permissions, hasPermission, hasAnyPermission),
    portalDashboardOnly:
      isPortalScopedUser && portalDashboardOnlyFromMe(permissions, hasPermission, hasAnyPermission),
  };
}

export function firstAccessibleWorkspaceTab(ctx: Ctx): CustomerWorkspaceTab | null {
  return WORKSPACE_TAB_FALLBACK_ORDER.find((tab) => workspaceTabVisible(tab, ctx)) ?? null;
}

/** First customer workspace path for portal logins (e.g. after login or when a section is forbidden). */
export function portalWorkspaceHomePath(
  customerId: string,
  permissions: readonly string[],
  hasPermission: (p: string) => boolean,
  hasAnyPermission: (ids: readonly string[]) => boolean,
  isAdmin: boolean,
): string {
  const ctx = buildWorkspaceTabCtx(isAdmin, permissions, hasPermission, hasAnyPermission, !isAdmin);
  const tab = firstAccessibleWorkspaceTab(ctx);
  return tab ? `/customers/${customerId}/${tab}` : `/customers/${customerId}/dashboard`;
}