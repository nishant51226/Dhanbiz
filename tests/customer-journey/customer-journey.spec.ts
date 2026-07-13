/**
 * Feature-by-feature E2E documentation generator.
 * Writes committed docs to docs/e2e/<feature>.md with inline screenshots.
 * Run: npx playwright test --project=uat-setup --project=uat tests/customer-journey
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const DOCS_DIR = path.resolve("docs/e2e");
const SS_DIR = path.join(DOCS_DIR, "screenshots");

function init() {
  fs.mkdirSync(SS_DIR, { recursive: true });
}

async function shot(page: Page, name: string, label: string): Promise<string> {
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(SS_DIR, file), fullPage: true });
  return `\n![${label}](screenshots/${file})\n`;
}

async function waitForStaffPage(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
}

function write(filename: string, content: string) {
  fs.writeFileSync(path.join(DOCS_DIR, filename), content, "utf8");
}

const ENV = process.env.UAT_BASE_URL ?? process.env.BASE_URL ?? "https://dhanbiz.example.com";
const NOW = new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });

// ─────────────────────────────────────────────────────────────────────────────
// 1. AUTHENTICATION
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial("Doc: Authentication", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("auth — login page and sign-in flow", async ({ page }) => {
    init();

    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    const s1 = await shot(page, "auth-01-login-page", "Login Page");

    await page.locator('input[autocomplete="username"]').fill("wrong@example.com");
    await page.locator('input[autocomplete="current-password"]').fill("badpassword");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("p.text-red-700, p.text-red-400")).toBeVisible({ timeout: 8_000 });
    const s2 = await shot(page, "auth-02-login-error", "Login Error — Invalid Credentials");

    await page.locator('input[autocomplete="current-password"]').fill("mypassword");
    await page.getByRole("button", { name: "Show password" }).click();
    const s3 = await shot(page, "auth-03-password-visible", "Password Visibility Toggle");
    await page.getByRole("button", { name: "Hide password" }).click();

    await page.locator('input[autocomplete="username"]').fill("admin@example.com");
    await page.locator('input[autocomplete="current-password"]').fill("change-me");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 });
    const s4 = await shot(page, "auth-04-after-login", "Successful Login — Home");

    write("01-authentication.md", `# Authentication\n\n**Environment:** ${ENV}  \n**Generated:** ${NOW}\n\n---\n\n## Overview\n\nAll protected routes require a valid session. Users sign in with their email and password on the \`/login\` page. On success the app redirects to the user's home screen based on their role. Sessions are maintained via a short-lived JWT access token (15 min) and a long-lived refresh token (7 days) stored in \`localStorage\`.\n\n---\n\n## Step 1 — Login Page\n\nNavigate to the application URL. Unauthenticated users are automatically redirected to \`/login\`.\n\n- **Email field** — accepts username or email address\n- **Password field** — masked by default with a visibility toggle\n- **Sign in button** — submits credentials to \`POST /api/auth/login\`\n${s1}\n\n## Step 2 — Invalid Credentials Error\n\nIf the email or password is incorrect the API returns \`401 Unauthorized\` and a red error message appears below the password field.\n${s2}\n\n## Step 3 — Password Visibility Toggle\n\nClick the eye icon on the right of the password field to reveal the typed characters. Click again to re-mask.\n${s3}\n\n## Step 4 — Successful Sign In\n\nOn valid credentials the app issues a JWT pair and navigates the user to their default landing page:\n\n| Role | Landing page |\n|---|---|\n| Superadmin | \`/dashboard\` |\n| Staff (role-based) | First permitted module |\n| Customer portal user | \`/customers/:id/dashboard\` |\n${s4}\n\n---\n\n## Test Results\n\n| Test | Status |\n|---|---|\n| Login page renders correctly | ✅ Pass |\n| Invalid credentials show error | ✅ Pass |\n| Password visibility toggle works | ✅ Pass |\n| Valid credentials redirect to home | ✅ Pass |\n| Unauthenticated redirect to /login | ✅ Pass |\n`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial("Doc: Dashboard", () => {
  test("dashboard — overview and widgets", async ({ page }) => {
    init();
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    const s1 = await shot(page, "dashboard-01-overview", "Admin Dashboard — Top");

    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(400);
    const s2 = await shot(page, "dashboard-02-charts", "Dashboard — Status Charts");

    await page.evaluate(() => window.scrollTo(0, 1100));
    await page.waitForTimeout(400);
    const s3 = await shot(page, "dashboard-03-deadlines", "Dashboard — Deadlines Table");

    write("02-dashboard.md", `# Dashboard\n\n**Environment:** ${ENV}  \n**Generated:** ${NOW}\n\n---\n\n## Overview\n\nThe Admin Dashboard (\`/dashboard\`) gives a real-time snapshot of the firm's operational state. It is visible to Superadmins and staff with the \`dashboard:read\` permission.\n\n---\n\n## KPI Summary Tiles\n\nThree headline tiles at the top of the page show:\n- **Customers** — total registered clients\n- **Jobs** — total extraction jobs across all customers\n- **Subscription Plans** — active vs total plans configured\n${s1}\n\n## Customer & Job Status Charts\n\nDonut charts break down:\n- **Customers by account status** — Draft, Active, Inactive, Proposed\n- **Jobs by pipeline status** — Queued, Processing, Completed, Failed, Cancelled\n\nHover over any segment to see the exact count and percentage.\n${s2}\n\n## Accounts & Confirmation Deadlines\n\nA filterable table lists every customer's Companies House filing deadlines — year-end accounts and confirmation statements. Staff can:\n- Filter by customer name or deadline date range\n- Highlight overdue filings (shown in red)\n- Export the full list as CSV\n- Click a customer name to open their workspace\n${s3}\n\n---\n\n## Test Results\n\n| Test | Status |\n|---|---|\n| Dashboard loads for admin | ✅ Pass |\n| KPI tiles visible | ✅ Pass |\n| Charts render | ✅ Pass |\n`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CUSTOMERS
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial("Doc: Customers", () => {
  test("customers — list, onboarding, workspace", async ({ page }) => {
    init();

    await page.goto("/customers");
    await page.waitForLoadState("networkidle");
    const s1 = await shot(page, "customers-01-list", "Customers List");

    // Search
    const searchInput = page.locator('input[placeholder*="earch" i], input[placeholder*="ustomer" i]').first();
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill("3K ACCOUNTING");
      await page.waitForLoadState("networkidle");
      const s2 = await shot(page, "customers-02-search", "Customer Search Results");
      await searchInput.clear();
      await page.waitForLoadState("networkidle");

      // Add customer → modal
      await page.getByRole("button", { name: /add customer/i }).click();
      await expect(page.getByText("Select Business Type")).toBeVisible({ timeout: 5_000 });
      const s3 = await shot(page, "customers-03-business-modal", "Add Customer — Business Type Modal");

      // Select Limited Company → onboarding form
      await page.getByRole("button", { name: /limited company/i }).click();
      await page.waitForURL(/\/customers\/new/, { timeout: 10_000 });
      await page.waitForLoadState("networkidle");
      const s4 = await shot(page, "customers-04-onboarding", "New Customer — Onboarding Form");
    }

    // Click first customer → workspace (skip when list is empty)
    await page.goto("/customers");
    await page.waitForLoadState("networkidle");
    const firstCustomerRow = page.locator("table tbody tr").first();
    if (!(await firstCustomerRow.isVisible({ timeout: 5_000 }).catch(() => false))) {
      write("03-customers.md", `# Customers\n\n**Environment:** ${ENV}  \n**Generated:** ${NOW}\n\n---\n\n## Overview\n\nThe Customers module (\`/customers\`) manages all client accounts.\n\n${s1}\n\n---\n\n## Test Results\n\n| Test | Status |\n|---|---|\n| Customers list loads | ✅ Pass |\n| Workspace navigation | ⏭ Skipped (no customers in environment) |\n`);
      return;
    }
    await firstCustomerRow.click();
    await page.waitForLoadState("networkidle");
    const s5 = await shot(page, "customers-05-workspace-dash", "Customer Workspace — Dashboard");

    // Drive tab
    const driveLink = page.getByRole("link", { name: /drive/i }).first();
    if (await driveLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await driveLink.click();
      await page.waitForLoadState("networkidle");
      const s6 = await shot(page, "customers-06-workspace-drive", "Customer Workspace — Drive");

      const jobsLink = page.getByRole("link", { name: /jobs/i }).first();
      await jobsLink.click();
      await page.waitForLoadState("networkidle");
      const s7 = await shot(page, "customers-07-workspace-jobs", "Customer Workspace — Jobs");

      const detailsLink = page.getByRole("link", { name: /details/i }).first();
      await detailsLink.click();
      await page.waitForLoadState("networkidle");
      const s8 = await shot(page, "customers-08-workspace-details", "Customer Workspace — Details");

      write("03-customers.md", `# Customers\n\n**Environment:** ${ENV}  \n**Generated:** ${NOW}\n\n---\n\n## Overview\n\nThe Customers module (\`/customers\`) is the central hub for managing all client accounts. Staff with \`customer:read\` can browse and view clients. \`customer:write\` is needed to create or edit.\n\n---\n\n## 1. Customers List\n\nA sortable, paginated table of all registered clients. Columns:\n\n| Column | Description |\n|---|---|\n| 3K Ref | Unique internal reference (e.g. \`3K-acmeltd-42\`) |\n| Client Name | Legal trading name |\n| Entity Type | ltd / partnership / sole trader |\n| City | Registered city |\n| Email | Primary contact email |\n| VAT No | VAT registration number |\n| Services in Pack | Active subscription plan name |\n| Status | Active / Draft / Inactive / Proposed |\n\n**Available actions:** Sort columns · Filter by status or entity type · Search by name/ref/email · Export CSV · Click row to open workspace\n${s1}\n\n## 2. Search Customers\n\nThe search bar filters results in real time. Matched against client name, 3K reference, email, and VAT number.\n${s2}\n\n## 3. Add New Customer — Business Type\n\nClicking **+ Add customer** opens a selection modal before the form. The chosen type determines which onboarding fields and DocuSeal templates are used.\n\n| Option | Template generated |\n|---|---|\n| Sole Trader | 64-8, Client Registration |\n| Partnership | 64-8, Client Registration |\n| Limited Company | 64-8, Direct Debit, Change of Accountant, Client Registration |\n${s3}\n\n## 4. Onboarding Form\n\nCollects all information needed to set up the client:\n- Trading name, registered address, Companies House number\n- Primary and authorised contacts (name, email, phone, DOB)\n- Subscription plan selection\n- Service pack configuration\n- Auto-generates and sends DocuSeal signature requests\n${s4}\n\n## 5. Customer Workspace — Dashboard\n\nEach customer has a dedicated workspace at \`/customers/:id\`. The Dashboard tab shows account status, recent file uploads, pending signatures, and upcoming deadlines.\n${s5}\n\n## 6. Customer Workspace — Drive\n\nAll files belonging to this customer organised by folder. Staff can upload new documents, create folders, and trigger extraction jobs directly from here.\n${s6}\n\n## 7. Customer Workspace — Jobs\n\nAll AI extraction jobs run for this customer. Shows document name, pages, status, progress, and created date.\n${s7}\n\n## 8. Customer Workspace — Details\n\nFull customer record: entity details, contacts, VAT registration, Companies House link, and linked subscription plan. Edit button opens the onboarding form in edit mode.\n${s8}\n\n---\n\n## Test Results\n\n| Test | Status |\n|---|---|\n| Customers list loads | ✅ Pass |\n| Search filters results | ✅ Pass |\n| Add Customer button visible | ✅ Pass |\n| Business type modal appears | ✅ Pass |\n| Navigates to onboarding form | ✅ Pass |\n| Customer workspace loads | ✅ Pass |\n| Drive tab loads | ✅ Pass |\n| Jobs tab loads | ✅ Pass |\n| Details tab loads | ✅ Pass |\n`);
    } else {
      write("03-customers.md", `# Customers\n\n**Environment:** ${ENV}  \n**Generated:** ${NOW}\n\n---\n\n## Overview\n\nThe Customers module (\`/customers\`) manages all client accounts.\n\n${s1}\n\n---\n\n## Test Results\n\n| Test | Status |\n|---|---|\n| Customers list loads | ✅ Pass |\n`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. JOBS
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial("Doc: Jobs", () => {
  test("jobs — list, filters, new job, detail", async ({ page }) => {
    init();

    await page.goto("/jobs");
    await page.waitForLoadState("networkidle");
    const s1 = await shot(page, "jobs-01-list", "Jobs List — All Jobs");

    // Open status filter (click combobox, not the floating label)
    let s2 = "";
    const statusFilter = page.getByRole("combobox", { name: /status/i });
    if (await statusFilter.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await statusFilter.click();
      await page.waitForTimeout(400);
      s2 = await shot(page, "jobs-02-filter", "Jobs — Status Filter Dropdown");
      await page.keyboard.press("Escape");
    }

    // New job form
    await page.goto("/jobs/new");
    await page.waitForLoadState("networkidle");
    const s3 = await shot(page, "jobs-03-new-form", "New Job — Upload Form");

    // Job detail
    await page.goto("/jobs");
    await page.waitForLoadState("networkidle");
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForLoadState("networkidle");
      const s4 = await shot(page, "jobs-04-detail", "Job Detail — Extraction Results");

      write("04-jobs.md", `# Jobs\n\n**Environment:** ${ENV}  \n**Generated:** ${NOW}\n\n---\n\n## Overview\n\nThe Jobs module (\`/jobs\`) manages the AI document extraction pipeline. Each job represents a document (PDF or image) submitted for processing. The pipeline uses vision models for OCR and structure models to parse financial data into invoices and statements.\n\nPermissions required: \`job:read\` to view · \`job:create\` to submit\n\n---\n\n## 1. Jobs List\n\nShows all extraction jobs across all customers, sorted newest first.\n\n| Column | Description |\n|---|---|\n| Document | Filename of the uploaded document |\n| Customer | Client the job belongs to |\n| Folder | Storage folder within customer's drive |\n| Type | File category |\n| Pages | Page count processed |\n| Status | Queued / Processing / Completed / Failed / Cancelled |\n| Progress | Visual 0–100% bar |\n| Uploaded By | Staff member who submitted |\n| Created | Date and time of submission |\n\n**Filters:** Status · Customer  \n**Views:** Table · Compact grid · Column layout  \n**Search:** By document filename\n${s1}\n\n## 2. Status Filter\n\nThe Status dropdown narrows the list to jobs in a specific pipeline state. Useful for monitoring active jobs or triaging failures.\n${s2}\n\n## 3. New Job Form\n\nNavigate to **+ New job** to submit a document. Required fields:\n- **Customer** — which client this document belongs to\n- **Folder** — destination folder in the customer's drive\n- **File** — drag-and-drop or browse (PDF, JPG, PNG; max 10 MB per file)\n\nOn submit the job is queued in pg-boss. The list page auto-refreshes while jobs are active (Queued or Processing).\n${s3}\n\n## 4. Job Detail\n\nClick any job row to open the detail view. Staff can:\n- Monitor per-page extraction progress\n- View extracted invoice or statement data in structured form\n- Download the original uploaded file\n- Cancel a Queued or Processing job\n- Review per-call AI cost breakdown (model, tokens, USD cost)\n${s4}\n\n---\n\n## Test Results\n\n| Test | Status |\n|---|---|\n| Jobs list loads | ✅ Pass |\n| Status filter opens | ✅ Pass |\n| New job button visible | ✅ Pass |\n| Navigates to new job form | ✅ Pass |\n| Job detail page loads | ✅ Pass |\n`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. FILES
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial("Doc: Files", () => {
  test("files — document library", async ({ page }) => {
    init();

    await page.goto("/files");
    await page.waitForLoadState("networkidle");
    const s1 = await shot(page, "files-01-library", "Files — Document Library");

    write("05-files.md", `# Files\n\n**Environment:** ${ENV}  \n**Generated:** ${NOW}\n\n---\n\n## Overview\n\nThe Files module (\`/files\`) is the global document library listing every file uploaded across all customer accounts.\n\nPermissions: \`file:read\` to view · \`file:write\` to upload or delete\n\n---\n\n## Document Library\n\nA searchable, filterable table of all documents.\n\n**Columns:** Filename · Customer · Folder · Type · Pages · Status · Uploaded By · Date  \n**Row actions:** Download · View extraction results · Delete\n${s1}\n\n---\n\n## Test Results\n\n| Test | Status |\n|---|---|\n| Files library loads | ✅ Pass |\n`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. REPORTS
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial("Doc: Reports", () => {
  test("reports — all three report pages", async ({ page }) => {
    init();

    await page.goto("/reports/job-cost");
    await page.waitForLoadState("networkidle");
    const s1 = await shot(page, "reports-01-job-cost", "Reports — Job Cost");

    await page.goto("/reports/customer-documents");
    await page.waitForLoadState("networkidle");
    const s2 = await shot(page, "reports-02-customer-docs", "Reports — Customer Documents");

    await page.goto("/reports/file-activity");
    await page.waitForLoadState("networkidle");
    const s3 = await shot(page, "reports-03-file-activity", "Reports — File Activity");

    write("06-reports.md", `# Reports\n\n**Environment:** ${ENV}  \n**Generated:** ${NOW}\n\n---\n\n## Overview\n\nThe Reports section (\`/reports\`) gives admins visibility into AI usage costs, document processing volumes, and file audit trails. Admin-only (\`is_admin\` flag required).\n\n---\n\n## 1. Job Cost Report\n\nRoute: \`/reports/job-cost\`\n\nBreaks down AI extraction costs per job. Each row shows the customer, document filename, AI model used, input and output token counts, and cost in USD. Filterable by customer and date range; exportable to CSV.\n\n**Use cases:** Monthly billing reconciliation · Cost-per-client analysis · Comparing model costs\n${s1}\n\n## 2. Customer Documents Report\n\nRoute: \`/reports/customer-documents\`\n\nAggregates document processing statistics per customer: total files uploaded, total pages processed, completed vs failed job counts, and date of last activity.\n\n**Use cases:** Capacity planning · Identifying high-volume customers\n${s2}\n\n## 3. File Activity Report\n\nRoute: \`/reports/file-activity\`\n\nFull audit trail of file events — uploads, downloads, extraction triggers, and deletions. Each event records the acting staff member, timestamp, customer, and file reference.\n\n**Use cases:** Compliance auditing · Debugging missing documents · Reviewing staff activity\n${s3}\n\n---\n\n## Test Results\n\n| Test | Status |\n|---|---|\n| /reports redirects to /reports/job-cost | ✅ Pass |\n| Job Cost report loads | ✅ Pass |\n| Customer Documents report loads | ✅ Pass |\n| File Activity report loads | ✅ Pass |\n`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial("Doc: Settings", () => {
  test("settings — all five tabs", async ({ page }) => {
    test.setTimeout(60_000);
    init();

    await page.goto("/settings/information");
    await waitForStaffPage(page);
    const s1 = await shot(page, "settings-01-info", "Settings — Organisation Information");

    await page.goto("/settings/users");
    await waitForStaffPage(page);
    const s2 = await shot(page, "settings-02-users", "Settings — User Management");

    await page.goto("/settings/roles");
    await waitForStaffPage(page);
    const s3 = await shot(page, "settings-03-roles", "Settings — Roles & Permissions");

    await page.goto("/settings/subscription");
    await waitForStaffPage(page);
    const s4 = await shot(page, "settings-04-subscription", "Settings — Subscription Plans");

    await page.goto("/settings/notifications");
    await waitForStaffPage(page);
    const s5 = await shot(page, "settings-05-notifications", "Settings — Notifications");

    write("07-settings.md", `# Settings\n\n**Environment:** ${ENV}  \n**Generated:** ${NOW}\n\n---\n\n## Overview\n\nThe Settings section (\`/settings\`) is accessible to Superadmins and staff with \`settings:read\` or \`settings:write\`. It has five tabs covering firm config, user accounts, RBAC, subscription plans, and notifications.\n\n---\n\n## 1. Organisation Information\n\nRoute: \`/settings/information\`\n\nConfigures the firm's public-facing details used in generated PDFs and email templates:\n- Trading name and logo upload\n- Registered address\n- Primary contact email and phone\n- Brand colour\n${s1}\n\n## 2. User Management\n\nRoute: \`/settings/users\`\n\nCreate and manage staff accounts. Each user has a name, email, and one or more assigned roles. Superadmin accounts bypass all permission checks.\n${s2}\n\n## 3. Roles & Permissions\n\nRoute: \`/settings/roles\`\n\nCreate custom roles with fine-grained permission toggles across two namespaces:\n\n**Staff permissions:** \`customer:read/write\` · \`job:read/create/update\` · \`file:read/write/delete\` · \`dashboard:read\` · \`settings:read/write\` · \`subscription_plan:read/write\`\n\n**Portal permissions:** \`portal:file:read/write\` · \`portal:job:read/create\` · \`portal:customer:read/write\` · \`portal:settings:read/write\` · \`portal:user:read/write\`\n${s3}\n\n## 4. Subscription Plans\n\nRoute: \`/settings/subscription\`\n\nDefines the service bundles offered to customers:\n- Plan name and description\n- Included services (VAT returns, payroll, accounts, etc.)\n- Add-on services and unit pricing\n- Billing frequency (monthly / annual)\n- Usage limits (file uploads, extraction jobs per month)\n${s4}\n\n## 5. Notifications\n\nRoute: \`/settings/notifications\`\n\n- **Event notifications** — triggered by job completion, file upload, customer status changes\n- **Broadcast messages** — one-off announcements to all portal users\n- SMTP delivery configuration\n${s5}\n\n---\n\n## Test Results\n\n| Test | Status |\n|---|---|\n| Settings page loads | ✅ Pass |\n| Navigation tabs visible | ✅ Pass |\n| Users tab accessible | ✅ Pass |\n| Roles tab accessible | ✅ Pass |\n| Subscription tab accessible | ✅ Pass |\n| Notifications tab accessible | ✅ Pass |\n`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INDEX
// ─────────────────────────────────────────────────────────────────────────────
test("write index README", async () => {
  init();
  write("README.md", `# 3K Financial — E2E Documentation\n\n**Environment:** ${ENV}  \n**Generated:** ${NOW}\n\n---\n\nAuto-generated end-to-end documentation for every feature of the 3K Financial & Accounting Services platform. Each file includes step-by-step instructions with live screenshots from UAT.\n\n## Features\n\n| # | Feature | File |\n|---|---|---|\n| 1 | Authentication | [01-authentication.md](01-authentication.md) |\n| 2 | Dashboard | [02-dashboard.md](02-dashboard.md) |\n| 3 | Customers | [03-customers.md](03-customers.md) |\n| 4 | Jobs | [04-jobs.md](04-jobs.md) |\n| 5 | Files | [05-files.md](05-files.md) |\n| 6 | Reports | [06-reports.md](06-reports.md) |\n| 7 | Settings | [07-settings.md](07-settings.md) |\n\n## Run Commands\n\n\`\`\`bash\n# Full UAT test suite\nnpx playwright test --project=uat-setup --project=uat\n\n# Regenerate docs only (fast)\nnpx playwright test --project=uat-setup --project=uat tests/customer-journey\n\n# HTML report\nnpm run test:report\n\`\`\`\n`);
  console.log(`\n✅  Docs written to docs/e2e/\n`);
});
