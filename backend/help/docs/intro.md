---
sidebar_position: 1
slug: /
---

# Welcome to Dhanbiz

This help site documents how to use the **Dhanbiz** platform — the web application for practice staff and customer portal users.

## Who this is for

| Audience | What you can do |
|----------|-----------------|
| **Administrators** | Manage users, roles, subscription plans, notifications, reports, and firm settings — see [Administrator guide](./admin/overview) |
| **Practice staff** | Manage customers, upload documents, run AI extraction jobs, view reports |
| **Customer portal users** | Access your company's workspace — dashboard, drive, jobs, and settings |

After setup or upgrades, use the [Quality assurance](./qa/overview) checklists to verify everything works.

## Main areas of the app

- **Dashboard** — firm-wide KPIs, status charts, and Companies House deadlines
- **Customers** — client list, onboarding, and per-customer workspace
- **Jobs** — document extraction pipeline (upload → AI processing → structured results)
- **Files** — global document library across all customers
- **Reports** — AI cost, document volumes, and file activity audit (admin)
- **Settings** — organisation profile, users, roles, plans, and notifications

## Sessions and security

Sign in with your email and password. The app stores a short-lived access token and refresh token in your browser. Protected routes redirect unauthenticated users to `/login`.

For a detailed breakdown of who can access what, see [Roles & permissions](./roles-permissions).
