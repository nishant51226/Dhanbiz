---
sidebar_position: 1
---

# Dashboard

The admin dashboard (`/dashboard`) gives a real-time snapshot of firm operations. It is available to superadmins and staff with the `dashboard:read` permission.

## KPI summary

Three headline tiles show:

- **Customers** — total registered clients
- **Jobs** — extraction jobs across all customers
- **Subscription plans** — active vs configured plans

![Dashboard overview](/img/docs/dashboard-01-overview.png)

## Status charts

Donut charts break down:

- **Customers by account status** — Draft, Active, Inactive, Proposed
- **Jobs by pipeline status** — Queued, Processing, Completed, Failed, Cancelled

Hover a segment to see exact counts and percentages.

![Dashboard charts](/img/docs/dashboard-02-charts.png)

## Accounts & confirmation deadlines

A filterable table lists Companies House filing deadlines — year-end accounts and confirmation statements. You can:

- Filter by customer name or date range
- Spot overdue filings (highlighted in red)
- Export the list as CSV
- Click a customer name to open their workspace

![Deadlines table](/img/docs/dashboard-03-deadlines.png)
