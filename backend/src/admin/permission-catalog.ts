/** Curated permissions for the admin role editor. Keys may be stored on `roles.permissions`; routes may not check every key yet—see each group. */
export type PermissionCatalogEntry = {
  id: string;
  label: string;
  group: string;
};

export const PERMISSION_CATALOG: PermissionCatalogEntry[] = [
  { id: "admin_role:read", label: "View role definitions & permission catalog (API). Settings → Roles is superadmin-only today.", group: "Administration" },
  { id: "admin_role:write", label: "Create, edit, delete roles & assignments (API). Settings → Roles is superadmin-only today.", group: "Administration" },
  { id: "config:read", label: "Read extraction defaults (models, prompts, providers). Reserved — not enforced in UI yet.", group: "Configuration" },
  { id: "customer:read", label: "Customers: list all statuses (draft/active/inactive/proposed), workspace, forms, portal users", group: "Customers" },
  { id: "customer:write", label: "Customers: create, update, delete (when enforced on routes)", group: "Customers" },
  {
    id: "document:assign",
    label: "Library: assign staff to portal documents / jobs queue",
    group: "Files & drive",
  },
  {
    id: "document:assignee",
    label: "Library: can be assigned to portal documents / file tasks",
    group: "Files & drive",
  },
  { id: "dashboard:read", label: "Staff dashboard (aggregates & summary widgets)", group: "Dashboard" },
  { id: "report:read", label: "Reports: job cost, customer documents, and file activity", group: "Reports" },
  { id: "file:delete", label: "Files: delete folders/files (when enforced on routes)", group: "Files & drive" },
  { id: "file:read", label: "Files: list, metadata, stream/download (when enforced on routes)", group: "Files & drive" },
  { id: "file:write", label: "Files: upload, create folders, enqueue jobs from drive (when enforced)", group: "Files & drive" },
  { id: "invoice:read", label: "Invoices: list & detail (admin & customer financial routes)", group: "Financials" },
  { id: "job:create", label: "File tasks: actions implemented as POST (e.g. cancel, requeue)", group: "File tasks" },
  { id: "job:read", label: "File tasks: list, view, counts, jobs-by-file, documents/drive listing", group: "File tasks" },
  { id: "job:update", label: "File tasks: PATCH config, extraction HITL, other updates", group: "File tasks" },
  { id: "portal:file:read", label: "Portal: browse & download customer files library", group: "Customer portal" },
  { id: "portal:file:write", label: "Portal: upload & modify files in customer library", group: "Customer portal" },
  {
    id: "portal:file:delete",
    label: "Portal: delete files or folders (deprecated — drive delete is manager/admin only)",
    group: "Customer portal",
  },
  { id: "portal:invoice:read", label: "Portal: invoice library (browse)", group: "Customer portal" },
  { id: "portal:invoice:write", label: "Portal: invoice uploads & changes", group: "Customer portal" },
  { id: "portal:settings:read", label: "Portal: read account / portal settings", group: "Customer portal" },
  { id: "portal:settings:write", label: "Portal: change account / portal settings", group: "Customer portal" },
  { id: "portal:statement:read", label: "Portal: statement library (browse)", group: "Customer portal" },
  { id: "portal:statement:write", label: "Portal: statement uploads & changes", group: "Customer portal" },
  { id: "portal:user:read", label: "Portal: list customer-portal users", group: "Customer portal" },
  { id: "portal:user:write", label: "Portal: invite, edit, disable customer-portal users", group: "Customer portal" },
  { id: "portal:dashboard:read", label: "Portal: dashboard / organisation home", group: "Customer portal" },
  { id: "portal:customer:read", label: "Portal: customers read (dashboard, details, settings)", group: "Customer portal" },
  { id: "portal:customer:write", label: "Portal: customers write (settings/profile updates)", group: "Customer portal" },
  { id: "portal:subscription_plan:read", label: "Portal: read customer subscription assignment", group: "Customer portal" },
  { id: "portal:subscription_plan:write", label: "Portal: update customer subscription assignment", group: "Customer portal" },
  { id: "settings:read", label: "Staff settings: read profile, preferences, non-subscription settings", group: "Settings (staff)" },
  { id: "settings:write", label: "Staff settings: update profile & preferences", group: "Settings (staff)" },
  { id: "statement:read", label: "Statements: list & detail", group: "Financials" },
  { id: "subscription_plan:read", label: "Subscription plans: read", group: "Subscriptions" },
  { id: "subscription_plan:write", label: "Subscription plans: create, edit, delete", group: "Subscriptions" },
].sort((a, b) => a.id.localeCompare(b.id));
