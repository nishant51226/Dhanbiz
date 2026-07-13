---
sidebar_position: 1
---

# Administrator overview

This section is for **superadmins** and practice owners who configure the firm, manage staff access, monitor AI costs, and maintain subscription catalogues.

## Administrator responsibilities

| Area | What you manage | Route |
|------|-----------------|-------|
| **Firm profile** | Trading name, logo, address, brand colour for PDFs/emails | `/settings/information` |
| **Staff accounts** | Create users, assign roles, reset access | `/settings/users` |
| **Roles & RBAC** | Permission bundles for staff and portal users | `/settings/roles` |
| **Subscription plans** | Service packs, add-ons, limits, pricing | `/settings/subscription` |
| **Notifications** | Event emails, broadcasts, SMTP | `/settings/notifications` |
| **Reports** | AI cost, document volumes, file audit trail | `/reports/*` |
| **Customers** | Onboarding, workspace assignment, portal users | `/customers` |
| **Extraction pipeline** | Jobs, files, drive uploads | `/jobs`, `/files` |

## Superadmin vs role-based staff

- **Superadmin** (`is_admin = true`) bypasses all permission checks and sees every module including admin-only reports.
- **Role-based staff** see only modules granted by their assigned role keys (`customer:read`, `job:read`, etc.). Users can hold multiple roles; permissions combine.
- **Custom roles** — create under **Settings → Roles** for specialised access (e.g. read-only auditor, bookkeeper with jobs only).
- Use superadmin sparingly — prefer custom staff roles for day-to-day access.

## Typical admin workflows

### Onboard a new client

1. **Customers** → **+ Add customer** → choose business type
2. Complete onboarding form (entity details, contacts, subscription plan)
3. DocuSeal sends signature requests automatically
4. Assign portal users under **Customer workspace → Users**

### Add a staff member

1. **Settings → Users** → create account with email
2. Assign one or more roles (Manager, Accountant, custom)
3. Optionally scope customer access (non-superadmin)

### Monitor AI extraction costs

1. **Reports → Job cost** — filter by customer and date range
2. Export CSV for monthly reconciliation
3. Review failed jobs under **Jobs** with status filter

### Publish a portal announcement

1. **Settings → Notifications** → **Broadcast** tab
2. Compose message for all portal users
3. Confirm SMTP settings are configured

## Related guides

- [User management](./user-management) — staff accounts
- [Roles & access control](./roles-and-access) — permission design
- [Subscription management](./subscription-management) — plan catalogue
- [Notifications](./notifications) — email and events
- [Reports & audit](./reports-and-audit) — cost and compliance
- [Extraction pipeline](./extraction-pipeline) — jobs and files
