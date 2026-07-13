---
sidebar_position: 2
---

# Customers

The Customers module (`/customers`) is the central hub for managing client accounts.

**Permissions:** `customer:read` to browse · `customer:write` to create or edit

## Customers list

A sortable, paginated table of all clients. Columns include Client reference, client name, entity type, contact email, subscription plan, and status.

![Customers list](/img/docs/customers-01-list.png)

**Actions:** search · filter by status · export CSV · click a row to open the customer workspace

## Add a new customer

1. Click **+ Add customer**
2. Choose the **business type** (sole trader, partnership, or limited company)
3. Complete the onboarding form

The business type determines which DocuSeal signature documents are generated (64-8, client registration, direct debit, change of accountant, etc.).

![New customer form](/img/docs/customers-04-onboarding.png)

## Customer workspace

Each customer has a dedicated workspace at `/customers/:id` with tabs:

| Tab | Purpose |
|-----|---------|
| **Dashboard** | Account status, recent uploads, pending signatures, deadlines |
| **Drive** | Folders and files; upload documents and trigger extraction |
| **Jobs** | Extraction jobs for this customer |
| **Details** | Entity profile, contacts, VAT, Companies House link |
| **Subscription** | Active plan and service pack |
| **Users** | Portal users linked to this customer |
| **Settings** | Customer-specific configuration |

Open any customer from the list to manage their account end to end.
