/**
 * Maps API permission strings (`resource:action`) onto a CRUD matrix for the roles UI.
 * Cells with `null` are disabled (em dash in the table).
 *
 * - `bundleWrite`: create, update, and delete share one permission (e.g. `*_write`).
 * - `bundleCreateUpdate`: create and update share one permission (e.g. `file:write`).
 */

import type { RoleType } from "../types/api";

export type CrudCol = "create" | "read" | "update" | "delete";

export type MatrixRowDef = {
  id: string;
  label: string;
  /** API permission per column; null = not applicable */
  permissions: Record<CrudCol, string | null>;
  /**
   * When true, create/update/delete all reflect the same underlying permission
   * (e.g. `subscription_plan:write`) and stay visually in sync.
   */
  bundleWrite?: boolean;
  /**
   * When true, create and update both reflect `permissions.create` (must equal `permissions.update`).
   */
  bundleCreateUpdate?: boolean;
  /**
   * When Read is turned on for this row, also turn on Read for these other matrix rows.
   * Used by Portal — Dashboard to grant a complete portal home in one click.
   */
  bundleReadWithRowIds?: readonly string[];
};

export const ROLES_MATRIX_ROWS: MatrixRowDef[] = [
  {
    id: "customers",
    label: "Customers",
    bundleWrite: true,
    permissions: {
      create: "customer:write",
      read: "customer:read",
      update: "customer:write",
      delete: "customer:write",
    },
  },
  {
    id: "invoices",
    label: "Invoices",
    permissions: {
      create: null,
      read: "invoice:read",
      update: null,
      delete: null,
    },
  },
  {
    id: "statements",
    label: "Statements",
    permissions: {
      create: null,
      read: "statement:read",
      update: null,
      delete: null,
    },
  },
  {
    id: "files",
    label: "Files & drive",
    bundleCreateUpdate: true,
    permissions: {
      create: "file:write",
      read: "file:read",
      update: "file:write",
      delete: "file:delete",
    },
  },
  {
    id: "jobs",
    label: "Jobs",
    permissions: {
      create: "job:create",
      read: "job:read",
      update: "job:update",
      delete: null,
    },
  },
  {
    id: "library_assignees",
    label: "Assign library documents (staff)",
    permissions: {
      create: null,
      read: "job:read",
      update: "document:assign",
      delete: null,
    },
  },
  {
    id: "library_document_assignee",
    label: "Library document assignee",
    permissions: {
      create: null,
      read: "document:assignee",
      update: null,
      delete: null,
    },
  },
  {
    id: "subscription_plans",
    label: "Subscription plans",
    bundleWrite: true,
    permissions: {
      create: "subscription_plan:write",
      read: "subscription_plan:read",
      update: "subscription_plan:write",
      delete: "subscription_plan:write",
    },
  },
  {
    id: "dashboard",
    label: "Dashboard",
    bundleReadWithRowIds: ["customers", "jobs", "files", "subscription_plans"],
    permissions: {
      create: null,
      read: "dashboard:read",
      update: null,
      delete: null,
    },
  },
  {
    id: "reports",
    label: "Reports",
    permissions: {
      create: null,
      read: "report:read",
      update: null,
      delete: null,
    },
  },
  {
    id: "settings_staff",
    label: "Settings (staff)",
    permissions: {
      create: null,
      read: "settings:read",
      update: "settings:write",
      delete: null,
    },
  },
  {
    id: "config",
    label: "Configuration",
    permissions: {
      create: null,
      read: "config:read",
      update: null,
      delete: null,
    },
  },
  {
    id: "administration",
    label: "Administration",
    bundleWrite: true,
    permissions: {
      create: "admin_role:write",
      read: "admin_role:read",
      update: "admin_role:write",
      delete: "admin_role:write",
    },
  },
  {
    id: "portal_dashboard",
    label: "Portal — Dashboard",
    bundleReadWithRowIds: [
      "portal_customers",
      "portal_files",
      "portal_settings",
      "portal_users",
      "portal_subscription_plans",
    ],
    permissions: {
      create: null,
      read: "portal:dashboard:read",
      update: null,
      delete: null,
    },
  },
  {
    id: "portal_customers",
    label: "Portal — Customers",
    bundleWrite: true,
    permissions: {
      create: "portal:customer:write",
      read: "portal:customer:read",
      update: "portal:customer:write",
      delete: "portal:customer:write",
    },
  },
  {
    id: "portal_subscription_plans",
    label: "Portal — Subscription plans",
    bundleWrite: true,
    permissions: {
      create: "portal:subscription_plan:write",
      read: "portal:subscription_plan:read",
      update: "portal:subscription_plan:write",
      delete: "portal:subscription_plan:write",
    },
  },
  {
    id: "portal_files",
    label: "Portal — Files",
    bundleCreateUpdate: true,
    permissions: {
      create: "portal:file:write",
      read: "portal:file:read",
      update: "portal:file:write",
      delete: "portal:file:delete",
    },
  },
  {
    id: "portal_invoices",
    label: "Portal — Invoices",
    bundleWrite: true,
    permissions: {
      create: "portal:invoice:write",
      read: "portal:invoice:read",
      update: "portal:invoice:write",
      delete: "portal:invoice:write",
    },
  },
  {
    id: "portal_statements",
    label: "Portal — Statements",
    bundleWrite: true,
    permissions: {
      create: "portal:statement:write",
      read: "portal:statement:read",
      update: "portal:statement:write",
      delete: "portal:statement:write",
    },
  },
  {
    id: "portal_users",
    label: "Portal — User management",
    bundleWrite: true,
    permissions: {
      create: "portal:user:write",
      read: "portal:user:read",
      update: "portal:user:write",
      delete: "portal:user:write",
    },
  },
  {
    id: "portal_settings",
    label: "Portal — Settings",
    permissions: {
      create: null,
      read: "portal:settings:read",
      update: "portal:settings:write",
      delete: null,
    },
  },
];

/** Staff-facing explanation for each permission matrix row (shown in Settings → Roles). */
export const MATRIX_ROW_DESCRIPTIONS: Readonly<Record<string, string>> = {
  customers: "Customer list, workspaces, onboarding forms, and portal user invites.",
  invoices: "View invoice library and financial document details.",
  statements: "View bank statement library and financial document details.",
  files: "Staff drive: browse, upload, create folders, and delete files.",
  jobs: "File tasks / extraction jobs: list, create, update, and requeue. Does not grant drive library access — use Files & drive.",
  library_assignees: "Assign staff to library documents in the jobs queue.",
  library_document_assignee:
    "Appear in the assignee picker, receive library document assignments, and use the Assigned to me filter on Files.",
  subscription_plans: "Subscription catalogue and assigning plans to customers.",
  dashboard:
    "Staff home: summary widgets. Read also enables Customers, Jobs, Files, and Subscription plans read (data for the dashboard).",
  reports: "Operational reports (job cost / token usage). Separate from Jobs access.",
  settings_staff: "Practice settings: profile and preferences (not subscription catalogue).",
  config: "AI extraction defaults (models, prompts, providers). Reserved — not enforced in the UI yet.",
  administration:
    "Role and permission APIs. Settings → Roles / Users remains superadmin-only today.",
  portal_dashboard:
    "Portal home: organisation overview. Read also enables Customers, Files, Settings, Users, and Subscription read.",
  portal_customers: "Portal customer profile, details, forms, and subscription view.",
  portal_subscription_plans: "View or change the customer's subscription assignment.",
  portal_files: "Customer portal document library (browse, upload, delete).",
  portal_invoices: "Customer portal invoice library.",
  portal_statements: "Customer portal statement library.",
  portal_users: "Invite and manage customer portal logins.",
  portal_settings: "Portal account settings and organisation profile fields.",
};

export function matrixRowDescription(row: MatrixRowDef): string | undefined {
  return MATRIX_ROW_DESCRIPTIONS[row.id];
}

export function isPortalMatrixRow(row: MatrixRowDef): boolean {
  return row.id.startsWith("portal_");
}

/** Matrix rows shown when editing a staff or portal role. */
export function matrixRowsForRoleType(roleType: RoleType): MatrixRowDef[] {
  const wantPortal = roleType === "portal";
  return ROLES_MATRIX_ROWS.filter((row) => isPortalMatrixRow(row) === wantPortal);
}

/** Staff roles use unprefixed keys; portal roles use `portal:*`. */
export function permissionMatchesRoleType(permissionId: string, roleType: RoleType): boolean {
  const isPortalPerm = permissionId.trim().toLowerCase().startsWith("portal:");
  return roleType === "portal" ? isPortalPerm : !isPortalPerm;
}

export function filterPermissionsForRoleType(perms: Iterable<string>, roleType: RoleType): string[] {
  return [...perms].filter((p) => permissionMatchesRoleType(p, roleType));
}

export function matrixPermissionIdsForRoleType(roleType: RoleType): Set<string> {
  const s = new Set<string>();
  for (const row of matrixRowsForRoleType(roleType)) {
    for (const c of COLS) {
      const p = row.permissions[c];
      if (p) s.add(p);
    }
  }
  return s;
}

const COLS: CrudCol[] = ["create", "read", "update", "delete"];

function isBundleWriteCol(col: CrudCol): boolean {
  return col === "create" || col === "update" || col === "delete";
}

/** API permission key controlled by a matrix cell (accounts for bundled columns). */
export function matrixCellPermissionKey(row: MatrixRowDef, col: CrudCol): string | null {
  if (!isMatrixColumnApplicable(row, col)) return null;
  if (row.bundleCreateUpdate && (col === "create" || col === "update")) {
    return row.permissions.create;
  }
  if (row.bundleWrite && isBundleWriteCol(col)) {
    return row.permissions.create ?? row.permissions.update ?? row.permissions.delete;
  }
  return row.permissions[col];
}

/** Every permission id controlled by the matrix (for "extra permissions" section). */
export function matrixPermissionIds(): Set<string> {
  const s = new Set<string>();
  for (const row of ROLES_MATRIX_ROWS) {
    for (const c of COLS) {
      const p = row.permissions[c];
      if (p) s.add(p);
    }
  }
  return s;
}

export function isMatrixCellChecked(perms: Set<string>, row: MatrixRowDef, col: CrudCol): boolean {
  if (row.bundleCreateUpdate && (col === "create" || col === "update")) {
    const key = row.permissions.create;
    return key !== null && perms.has(key);
  }
  const key = row.permissions[col];
  if (key === null) return false;
  if (row.bundleWrite && isBundleWriteCol(col)) {
    const w = row.permissions.create ?? row.permissions.update ?? row.permissions.delete;
    return w !== null && perms.has(w);
  }
  return perms.has(key);
}

export function isMatrixColumnApplicable(row: MatrixRowDef, col: CrudCol): boolean {
  if (row.permissions[col] !== null) return true;
  if (row.bundleWrite && isBundleWriteCol(col)) return true;
  if (row.bundleCreateUpdate && (col === "create" || col === "update")) return true;
  return false;
}

export function setMatrixCell(perms: Set<string>, row: MatrixRowDef, col: CrudCol, on: boolean): Set<string> {
  let next = new Set(perms);
  if (row.bundleCreateUpdate && (col === "create" || col === "update")) {
    const key = row.permissions.create;
    if (key === null || row.permissions.update !== key) return next;
    if (on) next.add(key);
    else next.delete(key);
    return applyPortalDashboardReadBundle(next, row, col, on);
  }
  if (row.bundleWrite && isBundleWriteCol(col)) {
    const w = row.permissions.create ?? row.permissions.update ?? row.permissions.delete;
    if (!w) return next;
    if (on) next.add(w);
    else next.delete(w);
    return applyPortalDashboardReadBundle(next, row, col, on);
  }
  const key = row.permissions[col];
  if (key === null) return next;
  if (on) next.add(key);
  else next.delete(key);
  return applyPortalDashboardReadBundle(next, row, col, on);
}

function applyPortalDashboardReadBundle(
  perms: Set<string>,
  row: MatrixRowDef,
  col: CrudCol,
  on: boolean,
): Set<string> {
  if (col !== "read" || !on || !row.bundleReadWithRowIds?.length) {
    return perms;
  }
  let next = perms;
  for (const rowId of row.bundleReadWithRowIds) {
    const bundled = ROLES_MATRIX_ROWS.find((r) => r.id === rowId);
    if (!bundled || !isMatrixColumnApplicable(bundled, "read")) continue;
    next = setMatrixCell(next, bundled, "read", true);
  }
  return next;
}

export function columnMasterState(perms: Set<string>, col: CrudCol): "all" | "some" | "none" | "na" {
  const rows = ROLES_MATRIX_ROWS.filter((r) => isMatrixColumnApplicable(r, col));
  if (rows.length === 0) return "na";
  let on = 0;
  for (const r of rows) {
    if (isMatrixCellChecked(perms, r, col)) on += 1;
  }
  if (on === 0) return "none";
  if (on === rows.length) return "all";
  return "some";
}

export function applyColumnToggle(perms: Set<string>, col: CrudCol, on: boolean): Set<string> {
  let next = new Set(perms);
  for (const row of ROLES_MATRIX_ROWS) {
    if (!isMatrixColumnApplicable(row, col)) continue;
    next = setMatrixCell(next, row, col, on);
  }
  return next;
}

export function rowMasterState(perms: Set<string>, row: MatrixRowDef): "all" | "some" | "none" | "na" {
  const cols = COLS.filter((c) => isMatrixColumnApplicable(row, c));
  if (cols.length === 0) return "na";
  let on = 0;
  for (const c of cols) {
    if (isMatrixCellChecked(perms, row, c)) on += 1;
  }
  if (on === 0) return "none";
  if (on === cols.length) return "all";
  return "some";
}

export function applyRowToggle(perms: Set<string>, row: MatrixRowDef, on: boolean): Set<string> {
  let next = new Set(perms);
  for (const c of COLS) {
    if (!isMatrixColumnApplicable(row, c)) continue;
    next = setMatrixCell(next, row, c, on);
  }
  return next;
}
