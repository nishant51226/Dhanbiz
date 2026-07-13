---
sidebar_position: 6
---

# Settings

Settings (`/settings`) covers firm configuration, staff accounts, RBAC, subscription plans, and notifications.

**Permissions:** `settings:read` to view · `settings:write` to change values

## Organisation information

Route: `/settings/information`

Configure trading name, logo, registered address, contact details, and brand colour used in PDFs and emails.

![Organisation information](/img/docs/settings-01-info.png)

## User management

Route: `/settings/users`

Create staff accounts and assign roles. Superadmin accounts bypass all permission checks.

![User management](/img/docs/settings-02-users.png)

## Roles & permissions

Route: `/settings/roles`  
**Access:** Superadmin only

Create **custom staff and portal roles**, or adjust the four built-in **system** roles (`manager`, `accountant`, `customer_admin`, `customer_user`). The editor uses a CRUD permission matrix plus an searchable catalogue of all keys.

- **Staff roles** → assign under **Settings → Users**
- **Portal roles** → assign under each customer’s **Portal users** tab

![Roles and permissions](/img/docs/settings-03-roles.png)

See [Roles & access control](../admin/roles-and-access) for the full walkthrough.

## Subscription plans

Route: `/settings/subscription`

Manage service bundles: included services, add-ons, pricing, billing frequency, and usage limits. Plans are selectable during customer onboarding.

![Subscription plans](/img/docs/settings-04-subscription.png)

## Notifications

Route: `/settings/notifications`

Configure event-driven notifications (job completion, uploads, status changes), broadcast messages to portal users, and SMTP delivery settings.

![Notifications](/img/docs/settings-05-notifications.png)
