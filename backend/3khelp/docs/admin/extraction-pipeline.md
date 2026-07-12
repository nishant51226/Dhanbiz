---
sidebar_position: 7
---

# Extraction pipeline

Routes: `/jobs`, `/jobs/new`, `/files`, customer drive  
**Permissions:** `job:read`, `job:create`, `file:read`, `file:write`

## Overview

The extraction pipeline turns uploaded **PDFs and images** into structured financial data (invoices, statements) using a two-stage AI process:

1. **Vision model** — OCR each page to text/layout
2. **Structure model** — Parse into `InvoiceEntity` / `StatementEntity` with line items

Jobs are queued in **pg-boss** (Postgres-backed) and processed asynchronously.

## Jobs module

Route: `/jobs`

![Jobs list](/img/docs/jobs-01-list.png)

| Column | Description |
|--------|-------------|
| Document | Filename |
| Customer | Owning client |
| Folder | Drive folder path |
| Pages | Page count |
| Status | Queued · Processing · Completed · Failed · Cancelled |
| Progress | 0–100% bar |
| Uploaded by | Staff member |
| Created | Submission timestamp |

### Submit a new job

Route: `/jobs/new`

![New job form](/img/docs/jobs-03-new-form.png)

1. Select **customer** and **destination folder**
2. Upload file (PDF, JPG, PNG — max 10 MB per file)
3. Submit — job enters **Queued** state
4. List auto-refreshes while jobs are active

### Job detail

Click any row to open detail view:

- Per-page extraction progress
- Structured invoice/statement results
- Download original file
- Cancel Queued/Processing jobs
- Per-call AI cost breakdown

### Status filter

Use the **Status** combobox to filter by pipeline state — useful for triaging failures.

## Files module

Route: `/files`

![Files library](/img/docs/files-01-library.png)

Global document library across **all customers**. Search, filter, download, view extraction results, delete (with `file:delete`).

## Customer drive

Per-customer file storage at `/customers/:id/drive`:

- Folder hierarchy
- Upload documents
- Trigger extraction without leaving the workspace

## Configuration knobs (deployment)

| Variable | Purpose |
|----------|---------|
| `AI_PROVIDER_DEFAULT` | bedrock, ollama, openai, etc. |
| `EXTRACTION_PDF_VISION_CONCURRENCY` | Parallel page OCR |
| `EXTRACTION_LLM_CONCURRENCY` | Parallel structure calls |
| `PDF_MAX_PAGES` | Page limit per document |

## Verification

Complete the [extraction pipeline checklist](../qa/checklists#extraction-pipeline-checklist) with a test PDF after any AI or deployment change.

See [Staff jobs guide](../staff/jobs) and [Staff files guide](../staff/files).
