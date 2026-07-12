# Permissions Sync Guide (Web ⇄ Mobile)

This document is the contract for keeping **role-based access control (RBAC)** consistent
between the web app and the mobile app. Both clients consume the **same backend** and the
**same permission keys**, so if mobile follows the rules below, gating will match the web UI
exactly.

> **Golden rule:** The backend is the source of truth. Client-side permission checks only
> decide what to **show/hide/enable**. Every protected API already enforces permissions and
> Row-Level Security server-side, so a client can never bypass access by "showing" a button.

---

## 1. How a session resolves permissions

```
POST /api/auth/login      ->  { token, refreshToken }      (access JWT + opaque refresh)
GET  /api/auth/me         ->  { isAdmin, permissions[], roles[], customerId, ... }
POST /api/auth/refresh    ->  rotate tokens when access JWT expires
```

1. Log in, store the access token + refresh token.
2. Call **`GET /api/auth/me`** with `Authorization: Bearer <token>`.
3. Cache the returned `permissions[]`, `isAdmin`, `customerId`, `roles[]`.
4. Drive all UI gating off that cached set (see §5 for the exact check function).
5. On `401`, call `/api/auth/refresh`; if that fails, log out.

### `GET /api/auth/me` response shape

```jsonc
{
  "userId": "uuid",
  "customerId": "uuid | null",   // null = practice staff/admin; uuid = portal (customer) user
  "customer_name": "string",     // org name for portal users; "" for staff/admin
  "isAdmin": false,              // true = SUPERADMIN (full access, see §3)
  "permissions": ["customer:read", "job:read"],  // effective union of all assigned roles
  "roles": ["manager"],          // role names, for display only — DO NOT gate on these
  // Portal users also include:
  "customer_account_status": "active | ...",
  "customer_created_at": "ISO-8601 | null"
}
```

Key points for mobile:

- **`permissions[]` is the union of every assigned role.** Staff users can have multiple
  roles; the array is already merged for you.
- **Gate on `permissions`, never on `roles`.** Role names are labels only. A custom role
  named `field_agent` must work identically to a system role.
- **`isAdmin: true` returns an empty `permissions[]`** — treat empty + admin as "allow
  everything" (see §3).

---

## 2. Two user surfaces

| Surface | Identified by | Permission keys it uses |
|---------|---------------|--------------------------|
| **Practice staff / admin** | `customerId == null` | Unprefixed keys: `customer:*`, `job:*`, `file:*`, `invoice:read`, `statement:read`, `dashboard:read`, `report:read`, `settings:*`, `subscription_plan:*`, `config:read`, `admin_role:*`, `document:assign` |
| **Customer portal user** | `customerId != null` | `portal:*` keys (plus some legacy unprefixed keys still accepted — see §4 aliases) |

A user is **exactly one** of these per login. Mobile should branch its whole navigation on
`customerId == null ? staffShell : portalShell`.

---

## 3. Superadmin bypass

```
if (me.isAdmin === true) -> grant EVERYTHING, ignore the permissions array
```

Superadmin is a flag on the user (`users.is_admin`), not a role. The backend bypasses all
permission guards for admins, so mobile must do the same: when `isAdmin` is true, show every
feature regardless of `permissions[]` (which will be empty).

---

## 4. The permission check function (replicate this exactly)

Web uses this logic for a single check; mobile must match it 1:1, **including the portal
alias expansion**, or portal screens will differ between platforms.

```ts
// Legacy aliases: a portal user holding a portal:* key also satisfies the
// equivalent unprefixed key used by shared screens. Keep this table identical to the backend.
const PORTAL_PERMISSION_ALIASES: Record<string, string[]> = {
  "customer:read":            ["portal:customer:read", "portal:settings:read", "portal:settings:write"],
  "customer:write":           ["portal:customer:write", "portal:settings:write"],
  "file:read":                ["portal:file:read", "portal:file:write"],
  "file:write":               ["portal:file:write"],
  "subscription_plan:read":   ["portal:subscription_plan:read"],
  "subscription_plan:write":  ["portal:subscription_plan:write"],
  "portal:user:read":         ["portal:settings:read", "portal:settings:write"],
  "portal:user:write":        ["portal:settings:write"],
};

function hasPermission(me, permission) {
  if (me.isAdmin) return true;                       // superadmin bypass
  if (me.permissions.includes(permission)) return true;
  const aliases = PORTAL_PERMISSION_ALIASES[permission] ?? [];
  return aliases.some(a => me.permissions.includes(a));
}

function hasAnyPermission(me, keys) {
  return keys.some(k => hasPermission(me, k));
}
```

> The alias table only matters for **portal users**. For staff, `permissions` already
> contains the unprefixed keys directly. Including the aliases for everyone is harmless
> because staff roles never hold `portal:*` keys.

---

## 5. Full permission catalog

This is the complete set of keys. (Source of truth in code:
`backend/src/admin/permission-catalog.ts`; descriptions in
`docs/permissions-reference.md`.) Mobile should hard-code the same keys.

### Staff / admin keys

| Key | What it unlocks |
|-----|------------------|
| `dashboard:read` | Staff dashboard with aggregate widgets |
| `report:read` | Reports module (job cost / token burn analytics) |
| `customer:read` | Customers list, customer workspace, details, forms, portal users, company lookup |
| `customer:write` | Create / update / delete customers; edit profile fields |
| `invoice:read` | Invoice list & detail |
| `statement:read` | Statement list & detail |
| `file:read` | Files / drive browse, metadata, download |
| `file:write` | Upload, create folders, enqueue jobs from drive |
| `file:delete` | Delete files / folders |
| `job:read` | Files & Jobs modules; jobs list/detail, documents listing |
| `job:create` | Create job actions (POST) e.g. requeue, cancel |
| `job:update` | Update / reconfigure jobs, extraction HITL |
| `document:assign` | Assign staff (accountants) to library documents / jobs queue |
| `settings:read` | Read staff settings pages |
| `settings:write` | Update staff settings |
| `subscription_plan:read` | Read subscription catalog & assignments |
| `subscription_plan:write` | Create / edit / delete plans, change assignments |
| `config:read` | Read extraction config defaults (models, prompts, providers) |
| `admin_role:read` | View role definitions & permission catalog (API) |
| `admin_role:write` | Create / edit / delete roles & assignments (API) |

> Note: Role management screens (Settings → Roles, Settings → Users) are **superadmin-only**
> in the current product (gated by `isAdmin`, not by `admin_role:*`). Mobile should only show
> role management if `isAdmin`.

### Customer portal keys (`portal:*`)

| Key | What it unlocks |
|-----|------------------|
| `portal:dashboard:read` | Portal dashboard / organisation home |
| `portal:customer:read` | Portal customer read (dashboard, details, settings base views) |
| `portal:customer:write` | Portal customer write (settings / profile updates) |
| `portal:file:read` | Browse & download files library |
| `portal:file:write` | Upload & modify files |
| `portal:file:delete` | Delete files/folders (deprecated; drive delete is staff/admin only) |
| `portal:invoice:read` | Browse invoice library |
| `portal:invoice:write` | Invoice uploads & changes |
| `portal:statement:read` | Browse statement library |
| `portal:statement:write` | Statement uploads & changes |
| `portal:user:read` | List customer-portal users |
| `portal:user:write` | Invite / edit / disable customer-portal users |
| `portal:settings:read` | Read account / portal settings |
| `portal:settings:write` | Change account / portal settings |
| `portal:subscription_plan:read` | Read customer subscription assignment |
| `portal:subscription_plan:write` | Update customer subscription assignment |

---

## 6. Component-level gating map

Each row tells the mobile team **which permission to require for which screen/component**.
"Show with" = `hasAnyPermission([...])`. These mirror the web app exactly.

### 6a. Staff app

| Component / screen | Show / enable when |
|--------------------|--------------------|
| Dashboard tab | `dashboard:read` |
| Reports tab | `report:read` |
| Jobs tab, Job list/detail | `job:read` |
| Job actions: requeue/cancel (POST) | `job:create` |
| Job edit / reconfigure / HITL | `job:update` |
| Customers tab, Customer list | `customer:read` |
| Open customer workspace / details | `customer:read` |
| Create customer / edit profile / delete | `customer:write` |
| Invoices (staff financial view) | `invoice:read` |
| Statements (staff financial view) | `statement:read` |
| Files / Drive browse + download | `file:read` |
| Upload / new folder / enqueue from drive | `file:write` |
| Delete file/folder | `file:delete` |
| Assign accountant to library doc | `document:assign` (+ `job:read` to view queue) |
| Settings shell (any tab) | any of `settings:read`, `settings:write`, `subscription_plan:read`, `subscription_plan:write` |
| Settings → Basic info | `settings:read` or `settings:write` |
| Settings → Subscription | `subscription_plan:read` or `subscription_plan:write` |
| Settings → Users / Roles / Notifications | `isAdmin` only (superadmin) |
| Extraction config defaults | `config:read` |

**Staff landing / first screen after login** (pick the first the user can access):

```
dashboard:read -> Dashboard
else job:read  -> Jobs
else report:read -> Reports
else customer:read -> Customers
else (settings access) -> Settings
else isAdmin -> Dashboard
```

### 6b. Customer portal app

| Component / screen | Show / enable when (any of) |
|--------------------|------------------------------|
| Portal Dashboard tab | `portal:dashboard:read`, `customer:read`, `invoice:read`, `statement:read`, `portal:invoice:read/write`, `portal:statement:read/write`, `portal:file:read/write/delete`, `file:read/write/delete` |
| Invoices tab | `portal:invoice:read`, `portal:invoice:write`, `invoice:read` |
| Statements tab | `portal:statement:read`, `portal:statement:write`, `statement:read` |
| Files tab | `portal:file:read`, `portal:file:write`, `portal:file:delete`, `file:read`, `file:write`, `file:delete` |
| "New upload" button | `portal:file:write`, `portal:invoice:write`, `portal:statement:write`, `file:write` |
| Profile (GET customer) | `customer:read` (alias-expands to `portal:customer:read`) |
| Portal Settings | `portal:settings:read` / `portal:settings:write` |
| Manage portal users | `portal:user:read` (view), `portal:user:write` (invite/edit/disable) |
| Subscription view/change | `portal:subscription_plan:read` / `:write` |

**Portal landing / first screen after login:** the Dashboard if visible, otherwise the first
visible tab from the list above. If nothing is visible, the user has no portal access.

---

## 7. Resource → CRUD mapping (for a matrix-style permission UI)

If mobile ever builds a role editor, use the same resource→action mapping the web matrix
uses (`frontend/src/utils/rolesMatrix.ts`). Some resources bundle write actions into one key.

| Resource | Create | Read | Update | Delete | Notes |
|----------|--------|------|--------|--------|-------|
| Customers | `customer:write` | `customer:read` | `customer:write` | `customer:write` | C/U/D share one write key |
| Invoices | — | `invoice:read` | — | — | read-only |
| Statements | — | `statement:read` | — | — | read-only |
| Files & drive | `file:write` | `file:read` | `file:write` | `file:delete` | C+U share `file:write` |
| Jobs | `job:create` | `job:read` | `job:update` | — | |
| Assign library docs | — | `job:read` | `document:assign` | — | |
| Subscription plans | `subscription_plan:write` | `subscription_plan:read` | `subscription_plan:write` | `subscription_plan:write` | C/U/D share write |
| Dashboard | — | `dashboard:read` | — | — | |
| Reports | — | `report:read` | — | — | read-only |
| Settings (staff) | — | `settings:read` | `settings:write` | — | |
| Configuration | — | `config:read` | — | — | |
| Administration | `admin_role:write` | `admin_role:read` | `admin_role:write` | `admin_role:write` | C/U/D share write |
| Portal — Dashboard | — | `portal:dashboard:read` | — | — | |
| Portal — Customers | `portal:customer:write` | `portal:customer:read` | `portal:customer:write` | `portal:customer:write` | |
| Portal — Subscription plans | `portal:subscription_plan:write` | `portal:subscription_plan:read` | `portal:subscription_plan:write` | `portal:subscription_plan:write` | |
| Portal — Files | `portal:file:write` | `portal:file:read` | `portal:file:write` | `portal:file:delete` | C+U share write |
| Portal — Invoices | `portal:invoice:write` | `portal:invoice:read` | `portal:invoice:write` | `portal:invoice:write` | |
| Portal — Statements | `portal:statement:write` | `portal:statement:read` | `portal:statement:write` | `portal:statement:write` | |
| Portal — User management | `portal:user:write` | `portal:user:read` | `portal:user:write` | `portal:user:write` | |
| Portal — Settings | — | `portal:settings:read` | `portal:settings:write` | — | |

---

## 8. Roles model (background)

- **Staff users:** can hold **multiple roles**; effective permissions = union.
- **Portal users:** hold **exactly one** role.
- **System roles** (`manager`, `accountant`, `customer_admin`, `customer_user`): cannot be
  renamed or deleted, but their permissions are editable.
- **Custom roles:** fully supported. Mobile must NOT special-case any role name — only check
  the `permissions[]` array.
- Roles are created/edited in **web → Settings → Roles** (superadmin only). Whatever
  permissions an admin assigns there flow through `/auth/me` to both clients automatically.

---

## 9. Mobile implementation checklist

- [ ] Store access token + refresh token after login; attach `Authorization: Bearer`.
- [ ] Fetch and cache `/auth/me`; refetch after login and after token refresh.
- [ ] Branch the app shell on `customerId == null` (staff) vs `!= null` (portal).
- [ ] Implement `hasPermission` / `hasAnyPermission` **including the alias table** (§4).
- [ ] Treat `isAdmin === true` as full access (ignore empty `permissions`).
- [ ] Gate every screen/button using the tables in §6 (copy them verbatim).
- [ ] Never gate on `roles[]` names — only on `permissions[]`.
- [ ] Compute the landing screen with the §6 ordering so empty-permission users don't hit a
      blank tab.
- [ ] Expect `403` from the API even if a button slips through; handle gracefully (the server
      is the real gate).
- [ ] When new permission keys are added on the backend, mirror them here and in the mobile
      constant list.

---

## 10. Keeping web & mobile in sync over time

When the backend adds or renames a permission key:

1. It is added to `backend/src/admin/permission-catalog.ts` (appears automatically in the web
   Roles editor).
2. Update `docs/permissions-reference.md` (description) **and this file** (§5/§6).
3. Mobile updates its constant list + any new screen gates.

Because both clients only read `permissions[]` from `/auth/me`, **no client release is
required** for an admin to grant/revoke access to existing keys — they just edit the role in
web Settings and both apps reflect it on next `/auth/me`.
