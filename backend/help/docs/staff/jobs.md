---
sidebar_position: 3
---

# Jobs

The Jobs module (`/jobs`) manages the AI document extraction pipeline.

**Permissions:** `job:read` to view · `job:create` to submit new jobs · `job:update` to cancel or reconfigure

## Jobs list

All extraction jobs across customers, newest first. Columns include document name, customer, folder, page count, status, progress, and upload date.

![Jobs list](/img/docs/jobs-01-list.png)

**Filters:** status · customer  
**Views:** table · compact grid · column layout  
**Search:** by document filename

## Create a new job

1. Click **+ New job** or go to `/jobs/new`
2. Select the **customer** and destination **folder**
3. Upload a PDF or image (max 10 MB per file)
4. Submit — the job is queued and processed automatically

![New job form](/img/docs/jobs-03-new-form.png)

## Job statuses

| Status | Meaning |
|--------|---------|
| Queued | Waiting to start |
| Processing | Vision + structure models running |
| Completed | Structured data saved (invoices / statements) |
| Failed | Error during extraction — open detail for logs |
| Cancelled | Stopped by staff |

## Job detail

Click any row to open the detail view. You can monitor per-page progress, review extracted invoice or statement data, download the original file, cancel active jobs, and see per-call AI cost breakdown.

Jobs can also be created from a customer's **Drive** tab when uploading documents.
