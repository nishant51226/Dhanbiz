---
sidebar_position: 10
---

# Roles & permissions

Access in Dhanbiz is controlled by **roles** and **permission keys**. Each user can hold one or more roles; effective access is the **union** of all permissions from those roles.

**Superadmin** is a separate flag (`is_admin = true`) that bypasses every permission check.

## Two role types

Every role is either **staff** or **portal**. You choose the type when creating a role; it controls where the role can be assigned.

| Type | Assigned in | Used by | Permission namespace |
|------|-------------|---------|-------------------|
| **Staff** | Settings → Users | Practice employees | `customer:*`, `job:*`, `file:*`, `settings:*`, etc. |
| **Portal** | Customer workspace → Portal users | Customer contacts | `portal:*` |

Staff roles must not be given to portal logins, and portal roles must not be given to practice staff accounts.

## System roles (built-in)

Four **system** roles ship with the product. You can change their permissions in **Settings → Roles**, but you cannot rename or delete them.

### Manager (`staff`)

Full customer ownership and file operations for assigned clients:

| Permission | Purpose |
|------------|---------|
| `customer:read` / `customer:write` | Customers list and workspace (create, edit, onboarding) |
| `document:assign` | Assign accountants to library documents / job queue |
| `file:read` / `file:write` / `file:delete` | Global files module and customer drive (including delete) |
| `job:read` / `job:create` / `job:update` | Jobs list, submit, cancel, reconfigure |

### Accountant (`staff`)

Read-only execution on files and jobs for assigned customers:

| Permission | Purpose |
|------------|---------|
| `file:read` | Browse and download files |
| `job:read` | View extraction jobs and status |

Accountants cannot create customers, upload files, delete files, or submit jobs unless you extend the role or assign an additional custom role.

### Customer admin (`portal`)

Organisation administrator for a single customer:

| Permission | Purpose |
|------------|---------|
| `portal:file:read` / `portal:file:write` | Customer drive (upload and browse; **no delete** — contact practice to remove files) |
| `portal:settings:read` / `portal:settings:write` | Portal account settings |
| `portal:user:read` / `portal:user:write` | Invite and manage portal colleagues |

### Customer user (`portal`)

Standard portal access for uploading and viewing documents:

| Permission | Purpose |
|------------|---------|
| `portal:file:read` / `portal:file:write` | Customer drive (upload and browse; no delete) |

## Custom (dynamic) roles

Superadmins can create **custom roles** under **Settings → Roles**:

1. Choose **Staff** or **Portal** type
2. Enter a role name (lowercase, 2–63 characters, starts with a letter — e.g. `bookkeeper`, `portal_readonly`)
3. Optional description for other administrators
4. Toggle permissions in the **CRUD matrix** and **Other permissions** list
5. Save, then assign the role under **Settings → Users** (staff) or **Portal users** (portal)

Custom roles can be **deleted** only when no users are still assigned. System roles can never be deleted.

### Permission matrix

The matrix maps familiar actions (Create, Read, Update, Delete) to API permission keys:

| Row | Typical staff keys | Typical portal keys |
|-----|-------------------|---------------------|
| Customers | `customer:read`, `customer:write` | `portal:customer:read`, `portal:customer:write` |
| Files & drive | `file:read`, `file:write`, `file:delete` | `portal:file:read`, `portal:file:write` |
| Jobs | `job:read`, `job:create`, `job:update` | `portal:job:read`, `portal:job:create`, `portal:job:update` |
| Dashboard | `dashboard:read` | `portal:dashboard:read` |
| Settings | `settings:read`, `settings:write` | `portal:settings:read`, `portal:settings:write` |
| Subscription plans | `subscription_plan:read`, `subscription_plan:write` | `portal:subscription_plan:read`, `portal:subscription_plan:write` |
| Invoices / Statements | `invoice:read`, `statement:read` | `portal:invoice:*`, `portal:statement:*` |
| Portal users | — | `portal:user:read`, `portal:user:write` |
| Administration | `admin_role:read`, `admin_role:write` | — |
| Configuration | `config:read` | — |
| Assign library documents | `document:assign` | — |

Some columns are bundled (e.g. Create/Update/Delete may share a single `*_write` key). Use the **ⓘ** tooltips on each cell for the exact key.

### Other permissions

Keys not shown in the matrix appear under **Other permissions**, grouped by area (Administration, Configuration, Customers, etc.). Search to find a specific key quickly.

## Full permission catalogue

| Group | Permission keys |
|-------|-----------------|
| **Administration** | `admin_role:read`, `admin_role:write` |
| **Configuration** | `config:read` |
| **Customers** | `customer:read`, `customer:write` |
| **Dashboard** | `dashboard:read` |
| **Files & drive** | `file:read`, `file:write`, `file:delete`, `document:assign` |
| **File tasks** | `job:read`, `job:create`, `job:update` |
| **Financials** | `invoice:read`, `statement:read` |
| **Settings (staff)** | `settings:read`, `settings:write` |
| **Subscriptions** | `subscription_plan:read`, `subscription_plan:write` |
| **Customer portal** | `portal:dashboard:read`, `portal:customer:read`, `portal:customer:write`, `portal:file:read`, `portal:file:write`, `portal:file:delete` (deprecated for portal roles), `portal:job:read`, `portal:job:create`, `portal:job:update`, `portal:invoice:read`, `portal:invoice:write`, `portal:statement:read`, `portal:statement:write`, `portal:settings:read`, `portal:settings:write`, `portal:user:read`, `portal:user:write`, `portal:subscription_plan:read`, `portal:subscription_plan:write` |

Not every key is enforced on every route yet — the catalogue lists keys available in the role editor; the app hides UI and the API returns `403` when a route checks a key you lack.

## Superadmin

Users with the superadmin flag bypass `PermissionsGuard` and see all modules, including:

- Admin-only reports (`/reports/customer-documents`, `/reports/file-activity`)
- **Settings → Users**, **Roles**, and **Notifications**
- All customers regardless of assignment

Use superadmin sparingly — prefer custom staff roles for day-to-day access.

## Admin-only UI routes

These screens require superadmin regardless of role keys:

| Route | Screen |
|-------|--------|
| `/settings/users` | Staff user management |
| `/settings/roles` | Role & permission editor |
| `/settings/notifications` | Notification and SMTP settings |
| `/reports/customer-documents` | Customer documents report |
| `/reports/file-activity` | File activity audit |

## Managing access

| Task | Where |
|------|-------|
| Create staff account + assign staff roles | **Settings → Users** |
| Create portal login + assign portal roles | **Customer workspace → Portal users** |
| Create or edit role permission bundles | **Settings → Roles** (superadmin) |
| Verify access after changes | [Permissions spot-check](./qa/checklists#permissions-spot-check) |

## Multi-tenancy

Tenant isolation is enforced in **Postgres RLS**, not in the UI alone. Staff see data for their tenant; portal users are scoped to a single customer organisation. Non-superadmin staff may also be limited to **assigned customers** only.

## Related guides

- [Roles & access control (admin)](./admin/roles-and-access) — step-by-step role editor
- [User management](./admin/user-management) — staff accounts
- [Customer portal overview](./customer-portal/overview) — portal permissions in practice
