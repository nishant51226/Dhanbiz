---
sidebar_position: 2
---

# User management

Route: `/settings/users`  
**Access:** Superadmin or staff with `settings:read` / `settings:write`

## Purpose

Create and maintain **staff accounts** — the people in your practice who sign in with a staff email (not portal users).

![User management](/img/docs/settings-02-users.png)

## Creating a staff user

1. Open **Settings → Users**
2. Click **Add user** (or equivalent action button)
3. Enter:
   - **Full name** — displayed in audit trails and job metadata
   - **Email** — used as login username
   - **Password** — initial password (user should change after first login)
4. Assign **one or more roles** — only **staff-type** roles appear here (`manager`, `accountant`, or custom staff roles you created under **Settings → Roles**)
5. Save

Portal logins are **not** created on this screen. Add them from **Customer workspace → Portal users** and assign **portal-type** roles there.

## Superadmin flag

Users marked as **superadmin** bypass `PermissionsGuard` entirely. They can:

- Access all customers regardless of assignment
- Open admin-only reports (`/reports/customer-documents`, `/reports/file-activity`)
- Manage roles and all settings tabs

Reserve superadmin for owners and IT leads.

## Customer assignment

Non-superadmin staff may be scoped to specific customers. When a user lacks global access, they only see assigned clients in the **Customers** list and can only open those workspaces.

## Portal users vs staff users

| Type | Created in | Login lands on |
|------|------------|----------------|
| Staff | Settings → Users | `/dashboard` or first permitted module |
| Portal | Customer workspace → Users | `/customers/:id/dashboard` |

Portal users are covered in the [Customer portal guide](../customer-portal/overview).

## Common tasks

| Task | Steps |
|------|-------|
| Reset access | Edit user → set new password or disable account |
| Promote to admin | Enable superadmin flag (use with care) |
| Restrict module access | Remove a role, assign a tighter custom role, or edit permissions under **Settings → Roles** |
| Audit who uploaded a file | Reports → File activity, filter by user |

## Permissions reference

| Action | Permission key |
|--------|----------------|
| View users list | `settings:read` |
| Create/edit users | `settings:write` |
| Assign roles | `admin_role:write` (when enforced) |

## Verification

Use the [Admin smoke checklist](../qa/checklists#admin-smoke-checklist) to confirm user management works after changes.
