---
sidebar_position: 4
---

# Subscription management

Route: `/settings/subscription`  
**Access:** `subscription_plan:read` to view · `subscription_plan:write` to edit

## Purpose

Define the **service bundles** offered to clients — included services, add-ons, pricing, billing frequency, and usage limits. Plans are selected during customer onboarding and shown on the customer workspace **Subscription** tab.

![Subscription plans](/img/docs/settings-04-subscription.png)

## Plan structure

Each subscription plan includes:

| Field | Description |
|-------|-------------|
| **Name** | Display name (e.g. "Standard VAT + Accounts") |
| **Description** | Internal or client-facing summary |
| **Included services** | Core services in the pack (VAT, payroll, accounts, etc.) |
| **Add-on services** | Optional extras with unit pricing |
| **Billing frequency** | Monthly or annual |
| **Usage limits** | Caps on file uploads, extraction jobs per month |

## Creating a plan

1. **Settings → Subscription** → **Add plan** (`/settings/subscription/new`)
2. Configure services from the seeded catalogue
3. Set pricing matrix and limits
4. Save — plan becomes selectable in onboarding

## Editing a plan

Navigate to `/settings/subscription/edit/:planId`. Changes affect **new** assignments; existing customer subscriptions retain their assignment until updated in the customer workspace.

## Customer assignment

Per customer:

1. Open **Customer workspace → Subscription**
2. View current plan and service pack
3. Change assignment (requires `subscription_plan:write` or portal equivalent)

## Catalogue data

Plan services and rules are seeded from JSON catalogues in the repository `docs/` folder and applied via database migrations. Administrators configure **which** plans are active and how they are priced in the UI.

## Verification

After creating or editing a plan, confirm it appears in the [customer onboarding checklist](../qa/checklists#customer-onboarding-checklist).
