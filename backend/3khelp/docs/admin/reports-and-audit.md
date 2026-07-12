---
sidebar_position: 6
---

# Reports & audit

**Access:** Admin only (`is_admin = true`)

Admin reports give visibility into AI costs, document processing volumes, and file activity for compliance.

## Job cost report

Route: `/reports/job-cost` (default when visiting `/reports`)

![Job cost report](/img/docs/reports-01-job-cost.png)

Breaks down **AI extraction costs** per job:

| Column | Description |
|--------|-------------|
| Customer | Client the job belongs to |
| Document | Uploaded filename |
| Model | Vision / structure model used |
| Tokens | Input and output token counts |
| Cost (USD) | Calculated from `AiPricingEntity` rates |

**Use cases:** Monthly billing reconciliation · Cost-per-client analysis · Model cost comparison

**Filters:** Customer · Date range · Export CSV

## Customer documents report

Route: `/reports/customer-documents`

![Customer documents](/img/docs/reports-02-customer-docs.png)

Aggregates per-customer statistics:

- Total files uploaded
- Total pages processed
- Completed vs failed job counts
- Date of last activity

**Use cases:** Capacity planning · Identifying high-volume clients

## File activity report

Route: `/reports/file-activity`  
Detail view: `/reports/file-activity/:documentId`

![File activity](/img/docs/reports-03-file-activity.png)

Full **audit trail** of file events:

- Uploads, downloads, extraction triggers, deletions
- Acting staff member and timestamp
- Customer and file reference

**Use cases:** Compliance auditing · Debugging missing documents · Staff activity review

## Redirects

| Legacy route | Redirects to |
|--------------|--------------|
| `/reports` | `/reports/job-cost` |
| `/reports/token-burn` | `/reports/job-cost` |
| `/reports/by-page` | `/reports/job-cost?view=by-page` |

## Verification

Export job cost CSV and spot-check figures against a known completed job. See [monthly health check](../qa/checklists#monthly-health-check).

See also the [Staff reports guide](../staff/reports) for staff-facing usage.
