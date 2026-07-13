---
sidebar_position: 2
---

# Feature checklists

Work through these checklists in order. Mark each item **Pass** or **Fail** and record notes for any failure.

## Admin smoke checklist

Run after deployments or configuration changes.

### Sign-in

- [ ] Open the application URL — login page loads without errors
- [ ] Sign in with admin credentials — redirected to dashboard or home
- [ ] Sign out — returned to login page
- [ ] Wrong password shows a clear error message (not a blank screen)

### Navigation

- [ ] **Dashboard** loads and shows KPI tiles
- [ ] **Customers** list loads with search and filters
- [ ] **Jobs** list loads; **+ New job** opens the upload form
- [ ] **Files** library loads
- [ ] **Reports → Job cost** loads
- [ ] **Reports → Customer documents** loads (admin only)
- [ ] **Reports → File activity** loads (admin only)
- [ ] **Settings → Information** loads
- [ ] **Settings → Users** loads (admin only)
- [ ] **Settings → Roles** loads (admin only)
- [ ] **Settings → Subscription** loads
- [ ] **Settings → Notifications** loads (admin only)

### Permissions spot-check

- [ ] Log in as a non-admin staff user (e.g. Accountant)
- [ ] Confirm they **cannot** access admin-only reports or **Settings → Roles**
- [ ] Confirm they **can** access modules granted by their role (Accountant: Files and Jobs read-only)
- [ ] Log in as a portal **customer_user** — Drive upload works; **Users** tab hidden
- [ ] Log in as a portal **customer_admin** — **Users** tab visible; can invite a colleague
- [ ] After editing a custom role in **Settings → Roles**, re-test the affected user within one minute (permissions refresh on next request)

### Dynamic roles (optional)

- [ ] Create a test **staff** role with only `dashboard:read` — assign to a test user — confirm limited nav
- [ ] Delete the test role after removing the user assignment

---

## Customer onboarding checklist

Complete when adding a new client.

- [ ] **+ Add customer** → business type modal appears
- [ ] Select entity type → onboarding form opens
- [ ] Required fields validate (empty submit shows errors)
- [ ] Subscription plan is selectable
- [ ] Save creates the customer and appears in the list
- [ ] Customer workspace **Dashboard** tab loads
- [ ] **Drive** tab — can create folder and upload a test PDF
- [ ] **Jobs** tab — uploaded file appears or job can be submitted
- [ ] **Details** tab — entity information is correct
- [ ] **Users** tab — portal user can be invited (if applicable)
- [ ] DocuSeal signature request received by contact (if configured)

---

## Extraction pipeline checklist

Verify document processing end to end.

- [ ] Submit a small test PDF (1–2 pages) via **Jobs → New job**
- [ ] Job appears in list with status **Queued** or **Processing**
- [ ] Progress bar advances (refresh if needed)
- [ ] Job reaches **Completed** (allow several minutes)
- [ ] Open job detail — structured data visible (invoice or statement)
- [ ] Original file can be downloaded from job detail
- [ ] Job cost appears in **Reports → Job cost**
- [ ] Upload event appears in **Reports → File activity**

If job stays **Failed**, note the error in job detail and see [Troubleshooting](./troubleshooting).

---

## Portal user checklist

For customer contacts with portal access.

- [ ] Portal user receives login credentials or reset link
- [ ] Sign in lands on **customer workspace dashboard** (not staff dashboard)
- [ ] **Drive** — can browse and upload (if `portal:file:write` granted)
- [ ] **Jobs** — can view extraction jobs for their organisation
- [ ] **Details** and **Settings** — visible per role
- [ ] Portal user **cannot** see other customers or staff modules

---

## Monthly health check

- [ ] Dashboard deadlines table — review overdue filings
- [ ] Export job cost CSV for the month
- [ ] Review failed jobs — re-submit or escalate
- [ ] Check notification delivery (test event or broadcast)
- [ ] Confirm active staff accounts still required (disable leavers)
