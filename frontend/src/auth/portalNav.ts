/**
 * Portal shell: tabs and routes from GET /api/auth/me `permissions`.
 * Includes `portal:*` and legacy keys still used by portal APIs (`customer:read`, `invoice:read`, `file:*`, …).
 */

export type PortalNavKey = "dash" | "inv" | "stmt" | "files";

export type PortalNavItemDef = {
  key: PortalNavKey;
  to: string;
  end?: boolean;
  label: string;
  /** Any of these permissions (from /me) shows the nav item. */
  anyOf: readonly string[];
};

export const PORTAL_NAV_DEFS: PortalNavItemDef[] = [
  {
    key: "dash",
    to: "/portal",
    end: true,
    label: "Dashboard",
    anyOf: [
      "portal:dashboard:read",
      "customer:read",
      "invoice:read",
      "statement:read",
      "portal:invoice:read",
      "portal:invoice:write",
      "portal:statement:read",
      "portal:statement:write",
      "portal:file:read",
      "portal:file:write",
      "portal:file:delete",
      "file:read",
      "file:write",
      "file:delete",
    ],
  },
  {
    key: "inv",
    to: "/portal/invoices",
    label: "Invoices",
    anyOf: ["portal:invoice:read", "portal:invoice:write", "invoice:read"],
  },
  {
    key: "stmt",
    to: "/portal/statements",
    label: "Statements",
    anyOf: ["portal:statement:read", "portal:statement:write", "statement:read"],
  },
  {
    key: "files",
    to: "/portal/files",
    label: "Files",
    anyOf: ["portal:file:read", "portal:file:write", "portal:file:delete", "file:read", "file:write", "file:delete"],
  },
];

type PermCheck = {
  hasAnyPermission: (ids: readonly string[]) => boolean;
};

export function portalNavItemVisible(item: PortalNavItemDef, ctx: PermCheck): boolean {
  return ctx.hasAnyPermission(item.anyOf);
}

export function visiblePortalNavItems(ctx: PermCheck): PortalNavItemDef[] {
  return PORTAL_NAV_DEFS.filter((item) => portalNavItemVisible(item, ctx));
}

/** First path portal users should land on (e.g. after login). */
export function firstAccessiblePortalPath(ctx: PermCheck): string | null {
  const vis = visiblePortalNavItems(ctx);
  if (vis.length === 0) return null;
  const dash = vis.find((v) => v.key === "dash");
  if (dash) return dash.to;
  return vis[0]?.to ?? null;
}

/** Use when redirecting portal users away from staff routes (falls back to `/portal` if nothing matches). */
export function portalHomePath(ctx: PermCheck): string {
  return firstAccessiblePortalPath(ctx) ?? "/portal";
}

export function portalPathAllowed(pathname: string, ctx: PermCheck): boolean {
  const normalized = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  for (const item of PORTAL_NAV_DEFS) {
    if (item.end) {
      if (normalized === item.to || normalized === `${item.to}/`) {
        return portalNavItemVisible(item, ctx);
      }
    } else if (normalized === item.to || normalized.startsWith(`${item.to}/`)) {
      return portalNavItemVisible(item, ctx);
    }
  }
  return false;
}

/** Show "New upload" if the user can upload to at least one library kind. */
export function portalCanAnyUpload(ctx: PermCheck): boolean {
  return ctx.hasAnyPermission([
    "portal:file:write",
    "portal:invoice:write",
    "portal:statement:write",
    "file:write",
  ]);
}

/** GET /customers/:id — used for profile on portal. */
export const PORTAL_PERM_CUSTOMER_READ = ["customer:read"] as const;

/** GET /customers/:id/invoices — overview counts. */
export const PORTAL_PERM_INVOICE_LIST = ["invoice:read", "portal:invoice:read", "portal:invoice:write"] as const;

/** GET /customers/:id/statements — overview counts. */
export const PORTAL_PERM_STATEMENT_LIST = ["statement:read", "portal:statement:read", "portal:statement:write"] as const;

/** GET customer-portal … /library for each section (same as tab visibility). */
export const PORTAL_PERM_LIB_INVOICES = ["portal:invoice:read", "portal:invoice:write", "invoice:read"] as const;
export const PORTAL_PERM_LIB_STATEMENTS = [
  "portal:statement:read",
  "portal:statement:write",
  "statement:read",
] as const;
export const PORTAL_PERM_LIB_FILES = [
  "portal:file:read",
  "portal:file:write",
  "portal:file:delete",
  "file:read",
  "file:write",
  "file:delete",
] as const;
