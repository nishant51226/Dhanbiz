---
sidebar_position: 3
---

# Roles & access control

Route: `/settings/roles`  
**Access:** Superadmin only

## Purpose

Create and maintain **dynamic roles** — named permission bundles assigned to staff and portal users. The role editor loads the live permission catalogue from the API and saves changes immediately to the database.

![Roles and permissions](/img/docs/settings-03-roles.png)

## Role list (left panel)

| Control | What it does |
|---------|--------------|
| **Type filter** | Show all roles, **Staff only**, or **Portal only** |
| **Search** | Filter roles by name |
| **Role row** | Shows name, type badge (`staff` / `portal`), **system** badge, and user count |
| **New role** | Create a custom role (see below) |

Select a role to edit its permissions in the main panel.

## System vs custom roles

| | System roles | Custom roles |
|---|-------------|--------------|
| **Examples** | `manager`, `accountant`, `customer_admin`, `customer_user` | `bookkeeper`, `portal_readonly`, etc. |
| **Rename** | Not allowed | Allowed |
| **Delete** | Not allowed | Allowed when **0 users assigned** |
| **Edit permissions** | Yes | Yes |

System roles reflect the product’s default access model. Adjust their permissions if your firm’s policy differs, but keep names unchanged so documentation and support stay aligned.

## Creating a custom role

1. At the bottom of the left panel, choose **Type**:
   - **Staff (practice)** — for Settings → Users assignments
   - **Portal (customer login)** — for customer workspace → Portal users
2. Enter a **name** (lowercase, 2–63 chars, starts with a letter)
3. Optional **description** (shown to other admins)
4. Click **Add**
5. Select the new role and configure permissions, then **Save**

If the name already exists, the API returns a conflict error — pick a unique name.

## Editing permissions

### CRUD matrix

The matrix lists modules (Customers, Files & drive, Jobs, Dashboard, etc.) with **Create**, **Read**, **Update**, and **Delete** columns where applicable.

- **Row checkbox** — toggle all applicable columns for that module
- **Column checkbox** — toggle that action across all modules
- **Cell checkbox** — toggle one permission key
- **ⓘ icon** — tooltip with the exact API key (e.g. `job:read`)

Some modules bundle write access: toggling Create may also enable Update and Delete when they share one `*_write` key (e.g. `customer:write`).

### Other permissions

Below the matrix, permissions grouped by **Administration**, **Configuration**, **Customers**, **Customer portal**, and so on. Use the search box to filter long lists.

Keys already controlled by the matrix are hidden here to avoid duplicate toggles.

### Save and discard

- **Save** — writes name, description, and permission set to `PATCH /api/admin/roles/:id`
- Changes apply on the user’s **next request** (permission cache is invalidated server-side)
- System role **names** are read-only; permissions and descriptions are editable

## Assigning roles

Roles do nothing until assigned:

| Role type | Assign here |
|-----------|-------------|
| **Staff** | **Settings → Users** — one or more staff roles per account |
| **Portal** | **Customer workspace → Portal users** — one or more portal roles per login |

A user with multiple roles receives the **union** of all permission keys from every assigned role.

## Default system role reference

Current seeded permissions (adjustable in the editor):

### Manager (`staff`)

```
customer:read, customer:write, document:assign,
file:read, file:write, file:delete,
job:read, job:create, job:update
```

### Accountant (`staff`)

```
file:read, job:read
```

### Customer admin (`portal`)

```
portal:file:read, portal:file:write,
portal:settings:read, portal:settings:write,
portal:user:read, portal:user:write
```

Portal users **cannot delete** drive files — deletion is reserved for practice managers (`file:delete` on staff roles).

### Customer user (`portal`)

```
portal:file:read, portal:file:write
```

## Permission namespaces

### Staff keys

Used when a user signs in with a practice email. Common keys:

| Key | Grants |
|-----|--------|
| `dashboard:read` | Admin dashboard |
| `customer:read` / `customer:write` | Customers list and workspace |
| `file:read` / `file:write` / `file:delete` | Global files + customer drive |
| `job:read` / `job:create` / `job:update` | Jobs pipeline |
| `document:assign` | Assign staff to library documents |
| `settings:read` / `settings:write` | Firm settings (non-admin tabs) |
| `subscription_plan:read` / `subscription_plan:write` | Plan catalogue |
| `config:read` | Extraction defaults |
| `admin_role:read` / `admin_role:write` | Role API (UI still superadmin-only) |

### Portal keys (`portal:*`)

Used when a customer contact signs in:

| Key | Grants |
|-----|--------|
| `portal:dashboard:read` | Portal home |
| `portal:customer:read` / `portal:customer:write` | Dashboard, details, profile |
| `portal:file:read` / `portal:file:write` | Customer drive |
| `portal:job:read` / `portal:job:create` / `portal:job:update` | Customer jobs |
| `portal:user:read` / `portal:user:write` | Portal user management |
| `portal:settings:read` / `portal:settings:write` | Portal settings |
| `portal:subscription_plan:read` / `portal:subscription_plan:write` | View or change assigned plan |
| `portal:invoice:read` / `portal:invoice:write` | Invoice library |
| `portal:statement:read` / `portal:statement:write` | Statement library |

## Admin-only routes

These routes require superadmin regardless of role keys:

- `/reports/customer-documents`, `/reports/file-activity`
- `/settings/users`, `/settings/roles`, `/settings/notifications`

## Multi-tenancy

Tenant isolation is enforced in **Postgres RLS**. The backend sets `app.customer_id` per request. Staff see only their tenant’s data; portal users are scoped to one customer. Non-superadmin staff may further be limited to **assigned customers**.

## Verification

After changing roles:

1. Run the [permissions spot-check](../qa/checklists#permissions-spot-check) with a non-admin test account
2. Confirm expected modules appear in the nav and forbidden actions return errors or hidden controls
3. For portal roles, sign in as a portal user and confirm tabs match the assigned keys

See also the [full roles reference](../roles-permissions).
