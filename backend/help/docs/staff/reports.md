---
sidebar_position: 5
---

# Reports

The Reports section (`/reports`) provides admin visibility into AI usage, document volumes, and file audit trails. Access requires the superadmin flag or appropriate admin permissions.

Visiting `/reports` redirects to **Job cost** by default.

## Job cost report

Route: `/reports/job-cost`

Breaks down AI extraction costs per job — customer, document, model used, token counts, and USD cost. Filter by customer and date range; export to CSV.

![Job cost report](/img/docs/reports-01-job-cost.png)

**Use cases:** monthly billing reconciliation · cost-per-client analysis

## Customer documents report

Route: `/reports/customer-documents`

Aggregates processing statistics per customer: files uploaded, pages processed, completed vs failed jobs, and last activity date.

![Customer documents report](/img/docs/reports-02-customer-docs.png)

## File activity report

Route: `/reports/file-activity`

Full audit trail of uploads, downloads, extraction triggers, and deletions with staff member, timestamp, customer, and file reference.

![File activity report](/img/docs/reports-03-file-activity.png)
