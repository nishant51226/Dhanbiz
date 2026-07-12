# Permissions Reference

This document explains what each permission is used for in the current app.

## Naming Convention

- `portal:*` permissions are for customer-scoped users (portal/customer login).
- Non-portal permissions (for example `customer:*`, `job:*`) are for staff/admin roles.
- Superadmin bypasses permission checks.

## Staff/Admin Permissions

- `dashboard:read`
  - Shows staff dashboard (`/dashboard`).

- `report:read`
  - Shows staff Reports module (`/reports`) and `GET /api/reports/*` (e.g. job cost / token burn).

- `customer:read`
  - Opens customers list and customer read views.
  - Enables customer dashboard/details/settings shell.

- `customer:write`
  - Allows customer mutations (create/update/delete where enforced).
  - In customer settings, enables editing profile fields.

- `invoice:read`
  - Allows invoice listing/detail endpoints.

- `statement:read`
  - Allows statement listing/detail endpoints.

- `file:read`
  - File/drive browsing and metadata/download (when route enforces file permissions).

- `file:write`
  - Upload/create folder/enqueue from drive (where enforced).

- `file:delete`
  - Delete files/folders (where enforced).

- `job:read`
  - Shows Files and Jobs modules for staff.
  - Enables customer Files and Jobs sections.
  - Allows jobs list/detail and document/job listing APIs.

- `job:create`
  - Create job-type actions that map to POST operations (where enforced).

- `job:update`
  - Update/cancel/reconfigure jobs (where enforced).

- `settings:read`
  - Access staff settings read pages.

- `settings:write`
  - Update staff settings values.

- `subscription_plan:read`
  - Read subscription catalog/assignments.
  - Needed to view customer subscription page data.

- `subscription_plan:write`
  - Create/edit/delete plans and change assignments where allowed.

- `config:read`
  - Read extraction configuration defaults.

- `admin_role:read`
  - View role definitions and permission catalog APIs.

- `admin_role:write`
  - Create/update/delete roles and assignments.

## Customer Portal Permissions (`portal:*`)

### Customer Views (same UI as staff customer view)

- `portal:customer:read`
  - Customer read access for customer login:
  - Dashboard, Details, Settings base views.

- `portal:customer:write`
  - Customer write actions:
  - Editing customer settings/profile fields.

- `portal:subscription_plan:read`
  - Read customer subscription data.

- `portal:subscription_plan:write`
  - Change customer subscription assignment (where enforced).

### Portal Library/Legacy Portal APIs

- `portal:dashboard:read`
  - Portal organisation dashboard (`/customers/:id/dashboard`): home overview and section shortcuts.

- `portal:file:read`
  - Browse/download customer portal files library.

- `portal:file:write`
  - Upload/update in customer portal files library.

- `portal:file:delete`
  - Delete from customer portal files library.

- `portal:invoice:read`
  - Browse portal invoice library.

- `portal:invoice:write`
  - Upload/modify portal invoices.

- `portal:statement:read`
  - Browse portal statement library.

- `portal:statement:write`
  - Upload/modify portal statements.

- `portal:user:read`
  - Read customer portal users.

- `portal:user:write`
  - Create/update/disable customer portal users.

- `portal:settings:read`
  - Read portal settings/account endpoints.

- `portal:settings:write`
  - Write portal settings/account endpoints.

## Current Customer Section Mapping

For customer pages (`/customers/:customerId/*`):

- Dashboard: `customer:read` or `portal:customer:read`
- Details: `customer:read` or `portal:customer:read`
- Files: staff `file:read` / `file:write` / `file:delete`, or portal `portal:file:*`
- Jobs: staff `job:read` only (file-tasks queue — separate from the drive library)
- Settings: `customer:read` or `portal:customer:read` or `portal:settings:read`
- Subscription:
  - `portal:subscription_plan:read` / `portal:subscription_plan:write`
  - or staff `subscription_plan:read` / `subscription_plan:write`

## Recommended Role Bundles

### Customer Read-Only (portal)

- `portal:file:read`
- `portal:subscription_plan:read` (optional)

### Customer Editor (portal)

- `portal:file:read`
- `portal:file:write`
- `portal:settings:read` / `portal:settings:write` (optional)
- `portal:subscription_plan:read`
- `portal:subscription_plan:write` (optional)

## Notes

- Staff and portal naming is intentionally separated for clarity.
- For customer-scoped users, backend/frontend support portal aliases for customer-scope checks.
- Some labels in code say "when enforced" because a few endpoints still rely on broader guards.
