# Workstream E: Rebrand (3kltd → Dhanbiz) + UK Removal — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the platform from 3kltd/3K Ltd to Dhanbiz and remove all UK-specific compliance features (Companies House, HMRC 64-8, BACS Direct Debit, UK deadline fields, GBP), replacing onboarding capture with India equivalents (GSTIN, PAN, business constitution).

**Architecture:** Purely subtractive plus mechanical renames, except two additive units: a GSTIN validation utility (frontend, Vitest-tested) and India capture fields in the onboarding wizard. The onboarding wizard shrinks from 5 steps to 3 (Registration → Change of Accountant → Review & Sign). Deadline campaigns go dormant (empty watchable-field catalog, timezone flipped to Asia/Kolkata) until workstream D repoints them to GST due dates.

**Tech Stack:** NestJS 10 + TypeORM (backend), React 19 + Vite 6 + MUI/Tailwind (frontend), Vitest (new, frontend-only in this workstream).

**Spec:** `docs/superpowers/specs/2026-07-12-india-gst-conversion-design.md` (Workstream E + decided open items: placeholder brand assets; delete mobile app-association files; remove Direct Debit step).

**Conventions for the executor:**
- Windows host. Shell commands below are Git Bash syntax (the Bash tool); `npm` runs fine in either shell.
- Neither project had tests before this plan; verification is `npm run build` (backend: Nest build; frontend: `tsc --noEmit && vite build`) plus the new Vitest suite and grep sweeps.
- Backend imports use `.js` extensions on relative paths intentionally — do not "fix" them.
- Frontend tsconfig has `noUnusedLocals`/`noUnusedParameters` — deleting a usage means deleting the import too, or the build fails. Let the compiler drive the ripple: after each deletion task, run the relevant `npm run build` and fix every error it reports before committing.
- Do NOT delete or modify TypeORM migration files — they are history. UK-related seed data migrations stay; only *runtime* code is removed.
- Work on branch `feature/workstream-e-rebrand-uk-removal` (created in Task 1). Commit after every task.

---

## Chunk 1: Rebrand sweep

### Task 1: Branch + placeholder brand assets + app shell branding

**Files:**
- Create: `frontend/public/brand-logo.svg` (placeholder Dhanbiz logo)
- Create: `frontend/public/favicon.svg`
- Modify: `frontend/index.html` (title + favicon link)
- Delete: `frontend/public/brand-logo.png` (replaced by SVG; update all referencing code found via grep)

- [ ] **Step 1: Create branch**

```bash
git checkout -b feature/workstream-e-rebrand-uk-removal
```

- [ ] **Step 2: Create placeholder logo**

Write `frontend/public/brand-logo.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 64" role="img" aria-label="Dhanbiz">
  <rect width="64" height="64" rx="12" fill="#1a56db"/>
  <text x="32" y="44" font-family="Segoe UI, Arial, sans-serif" font-size="36" font-weight="700" fill="#ffffff" text-anchor="middle">D</text>
  <text x="80" y="44" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="600" fill="#1a56db">Dhanbiz</text>
</svg>
```

Write `frontend/public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1a56db"/><text x="32" y="44" font-family="Segoe UI, Arial, sans-serif" font-size="36" font-weight="700" fill="#fff" text-anchor="middle">D</text></svg>
```

- [ ] **Step 3: Update `frontend/index.html`** — set `<title>Dhanbiz</title>` and add/replace favicon link with `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`.

- [ ] **Step 4: Repoint `brand-logo.png` references**

```bash
grep -rn "brand-logo" frontend/src backend/src
```

Change each hit to `brand-logo.svg` (including the onboarding HTML templates' `<img>` src and its `alt="3K Financial & Accounting Services Ltd"` → `alt="Dhanbiz"`), then `git rm frontend/public/brand-logo.png`. If any consumer embeds the logo as base64/PNG bytes (check `backend/src/customers/onboarding-templates/onboarding-template-image-src.ts`), keep that consumer working by embedding the new SVG the same way.

- [ ] **Step 5: Verify** — `cd frontend && npm run build` → exit 0. Load `npm run dev`, confirm tab title "Dhanbiz" + blue "D" favicon.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "rebrand: Dhanbiz app shell, placeholder logo/favicon"`

### Task 2: Delete mobile app-association files

**Files:**
- Delete: `frontend/public/.well-known/assetlinks.json`, `frontend/public/.well-known/apple-app-site-association`, `frontend/public/apple-app-site-association`

- [ ] **Step 1:** `git rm frontend/public/.well-known/assetlinks.json frontend/public/.well-known/apple-app-site-association frontend/public/apple-app-site-association` (remove the `.well-known` dir if empty).
- [ ] **Step 2:** `grep -rn "well-known\|assetlinks\|app-site-association" frontend docker docs --include="*" -r | grep -v node_modules` — remove any nginx serving rules or docs that reference them (check `docker/nginx/`).
- [ ] **Step 3: Commit** — `git commit -am "rebrand: remove 3kltd mobile app-association files"`

### Task 3: Package names + help-site directory rename

**Files:**
- Modify: `package.json` (root), `backend/package.json`, `frontend/package.json`
- Rename: `backend/3khelp/` → `backend/help/`
- Modify: `.dockerignore`, `docker/nginx/Dockerfile`, `frontend/vite.config.ts`, `frontend/.env.example`, `frontend/.env.development`, `backend/help/docusaurus.config.js`, `backend/help/package.json`, `backend/help/README.md`

- [ ] **Step 1:** Rename packages: `docp-backend` → `dhanbiz-backend`, `docp-frontend` → `dhanbiz-frontend`, `3-khelp` → `dhanbiz-help`.
- [ ] **Step 2:** `git mv backend/3khelp backend/help`, then update every `3khelp` path reference:

```bash
grep -rln "3khelp" --exclude-dir=node_modules --exclude-dir=.git .
```

Expected hits to fix: root `package.json` (`help:dev` script), `.dockerignore` (4 lines), `docker/nginx/Dockerfile` (2 COPY lines), `frontend/vite.config.ts` comment, `frontend/.env.example`, `frontend/.env.development`, `backend/help/README.md`, `backend/help/docusaurus.config.js` (`projectName: '3khelp'` → `'dhanbiz-help'`).

- [ ] **Step 3:** Rebrand Docusaurus content: in `backend/help/`, `grep -rin "3k" docs/ src/ docusaurus.config.js --include="*.md" --include="*.js" --include="*.tsx"` and replace brand strings with Dhanbiz (titles, navbar, footer).
- [ ] **Step 4: Verify** — `grep -rin "3khelp" --exclude-dir=node_modules --exclude-dir=.git . | grep -v superpowers` → no hits. `cd backend/help && npm install && npm run build` (Docusaurus build) → exit 0. If the Docusaurus build fails for pre-existing reasons unrelated to the rename, note it and move on — fixing the help site is not in scope.
- [ ] **Step 5: Commit** — `git commit -am "rebrand: dhanbiz package names, help site rename"`

### Task 4: UI + template brand strings (frontend and backend)

**Files (authoritative list comes from the grep below):**
- Modify: `frontend/src/constants.ts`, `frontend/src/types/customerOnboarding.ts`, `frontend/src/pages/CustomersPage.tsx`, `frontend/src/pages/CustomerDetailsPage.tsx`, `frontend/src/pages/StaffSettingsBasicPage.tsx`, `frontend/src/utils/onboardingHtmlTemplate.ts`, `frontend/src/utils/changeAccountantHtmlTemplate.ts`, `backend/src/customers/onboarding-templates/onboardingHtmlTemplate.ts`, `backend/src/customers/onboarding-templates/customerOnboarding.ts`

- [ ] **Step 1: Enumerate every brand string**

```bash
grep -rn -i "3kltd\|3k ltd\|3KFinancialAcco\|3K Financial\|3K ref\|3K-" frontend/src backend/src --include="*.ts" --include="*.tsx"
```

- [ ] **Step 2: Apply replacements** (leave `directDebitHtmlTemplate.ts`, `DirectDebitForm.tsx`, and both `hmrc*` file sets alone — they are deleted whole in Chunk 3/Task 10):

| Old | New |
|---|---|
| `PRACTICE_LEGAL_NAME = "3K Financial & Accounting Services Ltd"` | `PRACTICE_LEGAL_NAME = "Dhanbiz Accounting Services Pvt Ltd"` |
| `name: "3K Financial & Accounting Services Ltd"` (customerOnboarding.ts practice block, both frontend and backend copies) | `name: "Dhanbiz Accounting Services Pvt Ltd"` |
| `"3K reference"` label / `"3K Ref"` column header | `"Client reference"` / `"Client Ref"` |
| `For 3K Ltd - Office Use Only` (both onboardingHtmlTemplate copies) | `For Dhanbiz - Office Use Only` |
| `terms and conditions of 3K Ltd` | `terms and conditions of Dhanbiz` |
| `At 3K Ltd, we value` | `At Dhanbiz, we value` |
| `moved accountants to 3K` (changeAccountantHtmlTemplate) | `moved accountants to Dhanbiz` |
| `3K Financial &amp; Accounting Services Ltd` (StaffSettingsBasicPage, template alt text) | `Dhanbiz Accounting Services Pvt Ltd` |

- [ ] **Step 3: Client reference pattern** — in `frontend/src/types/customerOnboarding.ts`: generator emits `DHB-{slug}-{seq}`; the recognition pattern must keep accepting legacy refs:

```ts
const AUTO_CLIENT_REF_PATTERN = /^(?:3K|DHB)-[a-z0-9]+-\d+$/i;
```

Update the generator function (`` return `3K-${slug}-${seq}` ``) to `` return `DHB-${slug}-${seq}` `` and its parse regex to `/^(?:3K|DHB)-[a-z0-9]+-(\d+)$/i`. Check `backend/src/customers/onboarding-templates/customerOnboarding.ts` for mirrored logic and apply the same change.

- [ ] **Step 4: Verify** — re-run the Step 1 grep: remaining hits must be only in files scheduled for deletion (`directDebitHtmlTemplate.ts`, `DirectDebitForm.tsx`) plus the legacy-accepting regexes. `cd frontend && npm run build` and `cd backend && npm run build` → exit 0.
- [ ] **Step 5: Commit** — `git commit -am "rebrand: Dhanbiz brand strings, DHB client reference prefix"`

### Task 5: Regenerate client-registration PDF template

**Files:**
- Regenerate: `frontend/public/client-registration-template.pdf` (and `client-registration-templates.pdf` if the script produces it)

> **Note:** this is an *interim* regeneration so the rebrand ships coherently; Task 14 modifies the same template again (India fields) and re-runs this script as its own step. If the script fails for pre-existing reasons unrelated to the rebrand (e.g. it needs a running dev server), note it and defer regeneration to Task 14.

- [ ] **Step 1:** `cd frontend && npm run generate:pdf-template` (regenerates the PDF from the now-rebranded onboarding HTML template).
- [ ] **Step 2:** Open the produced PDF; confirm header shows Dhanbiz, "Office Use" block says Dhanbiz, no 3K strings remain. Update `client-registration-template.README.txt` if it references 3K.
- [ ] **Step 3: Commit** — `git commit -am "rebrand: regenerate client registration PDF template"`

### Task 6: Docs + e2e environment strings

**Files:**
- Modify: `docs/e2e/README.md`, `docs/e2e/01-authentication.md`, `docs/e2e/02-dashboard.md`, `docs/e2e/03-customers.md`, `docs/e2e/05-files.md`, `docs/e2e/06-reports.md`, `docs/e2e/07-settings.md`, `tests/customer-journey/customer-journey.spec.ts`, `docs/docuseal-onboarding-templates.md`, `docs/limited-company-step1-client-registration-docuseal-template.md`, `CLAUDE.md`

- [ ] **Step 1:** Replace `https://fs3kltd.infurotech.com` with `https://dhanbiz.example.com` (placeholder; real UAT URL unknown) in the seven e2e docs and the `ENV` fallback in `tests/customer-journey/customer-journey.spec.ts`.
- [ ] **Step 2:** In the two docuseal docs, replace `For 3K Ltd - Office Use Only` / `FOR 3K LTD` with the Dhanbiz wording from Task 4.
- [ ] **Step 3:** `grep -rn -i "3kltd\|3k ltd\|fs3k" docs tests CLAUDE.md | grep -v superpowers` → zero hits.
- [ ] **Step 4: Commit** — `git commit -am "rebrand: docs and e2e environment strings"`

---

## Chunk 2: Backend UK removal

### Task 7: Deadline campaigns slice one — empty catalog + IST timezone

**Files:**
- Modify: `backend/src/notification/deadline-campaign-date-fields.ts`
- Modify: `backend/src/notification/deadline-campaign.service.ts` (rename call sites)
- Verify (no hardcoded frontend mirror expected): `frontend/src/pages/notifications/DeadlineCampaignsPanel.tsx` fetches the catalog from `GET /api/admin/deadline-campaigns/date-fields`, so emptying the backend array empties the panel automatically

- [ ] **Step 1:** In `deadline-campaign-date-fields.ts` replace the nine-entry `DEADLINE_DATE_FIELDS` array with an empty catalog and flip the timezone:

```ts
/**
 * Catalog of onboarding date fields deadline campaigns can watch.
 * Emptied during the India conversion (UK statutory fields removed).
 * Workstream D repopulates this with GST due-date fields (GSTR-1/3B by
 * registration filing frequency) once gst_registrations exists.
 */
export const DEADLINE_DATE_FIELDS: readonly DeadlineDateFieldDef[] = [] as const;
```

```ts
export const DEADLINE_CAMPAIGN_TIMEZONE = "Asia/Kolkata";

/** Calendar date key `YYYY-MM-DD` in the campaign timezone. */
export function campaignDateKey(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: DEADLINE_CAMPAIGN_TIMEZONE });
}
```

Delete `londonDateKey`; keep `DeadlineDateFieldDef`, `getDeadlineDateField`, `readDeadlineDateFromOnboarding`, `normaliseDeadlineDateKey`, `calendarDaysBetween`, `evaluateDeadlinePhase` unchanged (workstream D reuses them).

- [ ] **Step 2:** `grep -rn "londonDateKey" backend/src` → update every call site (expected: `deadline-campaign.service.ts`) to `campaignDateKey`.
- [ ] **Step 3:** The panel is API-driven (see Files note) — no frontend list to edit. Verify `DeadlineCampaignsPanel.tsx` renders an acceptable state when the catalog is empty; if the field `<select>` renders blank/broken with zero options, add a short muted "No deadline fields available" message in that case.
- [ ] **Step 4:** With an empty catalog, existing campaign rows referencing UK field ids resolve no dates (`getDeadlineDateField` returns `undefined` → `readDeadlineDateFromOnboarding` returns null) and send nothing. Read the service's evaluation loop to confirm a null date is skipped without throwing — no code change expected; note in the commit message that existing campaigns go dormant and their rows are preserved.
- [ ] **Step 5: Verify** — `cd backend && npm run build` and `cd frontend && npm run build` → exit 0.
- [ ] **Step 6: Commit** — `git commit -am "uk-removal: empty deadline field catalog, Asia/Kolkata timezone (campaigns dormant until GST fields land)"`

### Task 8: Remove Companies House refresh job from the queue

**Files:**
- Modify: `backend/src/queue/queue.service.ts` (import at line ~40, constructor injection at ~141, job registration, handler + helpers around lines 1500–1650: `companyNumberFromOnboardingData`, `companiesHouseSnapshotFromOnboarding`, `companiesHouseForDiffCompare`, `diffCompaniesHouseSnapshotKeys`, the CH-snapshot job handler)
- Modify: `backend/src/queue/queue.module.ts` (drop `CompaniesHouseModule`/service import)

- [ ] **Step 1:** `grep -n -i "companieshouse\|companies_house\|companyNumber" backend/src/queue/queue.service.ts` — delete the CH snapshot-refresh job end to end: its pg-boss registration (`work(...)`/schedule call and job-name constant), the handler method, the four helper functions, the `CompaniesHouseService` constructor param and import.
- [ ] **Step 2:** Remove the corresponding module wiring in `queue.module.ts`.
- [ ] **Step 3: Verify** — `cd backend && npm run build`; fix residual references the compiler reports *within the queue module only* (Task 9 handles the rest).
- [ ] **Step 4: Commit** — `git commit -am "uk-removal: drop Companies House snapshot refresh job"`

### Task 9: Delete the Companies House module + lookup controller + dashboard aggregates

**Files:**
- Delete: `backend/src/companies-house/` (module + service), `backend/src/customers/company-lookup.controller.ts`
- Modify: `backend/src/customers/customers.module.ts` (drop controller + CH imports), `backend/src/app.module.ts` (drop `CompaniesHouseModule`)
- Modify: `backend/src/customers/customers-page.service.ts` (delete `getCompaniesHouseDashboardAggregates` at ~line 667–800 and the `CompaniesHouse*Dto` types at lines 56–69), `backend/src/customers/customers-page.controller.ts` (delete its route)

- [ ] **Step 1:** `git rm -r backend/src/companies-house backend/src/customers/company-lookup.controller.ts`
- [ ] **Step 2:** Remove module wiring (`customers.module.ts`, `app.module.ts`) and the dashboard aggregates method, DTOs, and controller route.
- [ ] **Step 3:** `grep -rn -i "companieshouse\|companies-house" backend/src` — remaining hits should only be in onboarding-template files (handled in Task 10) and inert string keys inside onboarding JSON readers. Delete any other dead code the compiler or grep surfaces.
- [ ] **Step 4:** Env cleanup: `grep -rn -i "COMPANIES_HOUSE" backend .env.compose.example docker-compose*.yml` → remove the API-key env var entries.
- [ ] **Step 5: Verify** — `cd backend && npm run build` → exit 0.
- [ ] **Step 6: Commit** — `git commit -am "uk-removal: delete Companies House module, lookup endpoint, dashboard aggregates"`

### Task 10: Backend onboarding — remove HMRC 64-8 + Direct Debit, add India fields

**Files:**
- Delete: `backend/src/customers/onboarding-templates/hmrc648HtmlTemplate.ts`, `backend/src/customers/onboarding-templates/assets/hmrc-logo.svg`
- Modify: `backend/src/customers/onboarding-templates/customerOnboarding.ts` (form model: drop HMRC/DD/CH sections; add India fields), `onboardingExportSections.ts`, `onboardingExportFormModel.ts`, `onboardingHtmlTemplate.ts` (drop 64-8/DD render sections; add India fields to the company section), `onboarding-template-image-src.ts` (drop HMRC logo), `pdf-constants.ts` (if it carries 64-8/DD page constants)
- Modify: `backend/src/docuseal/docuseal-prefill-from-onboarding.ts`, `docuseal-remote-signature.service.ts`, `docuseal-signature-field-names.ts`, `docuseal-webhook.service.ts` (strip 64-8 and Direct Debit document types from the signing flow)

- [ ] **Step 1:** Delete `hmrc648HtmlTemplate.ts` + `assets/hmrc-logo.svg`; remove their imports/usages (`grep -rn -i "hmrc" backend/src`).
- [ ] **Step 2:** In the form model (`customerOnboarding.ts`), remove the HMRC 64-8 and Direct Debit sections and any `companies_house` capture fields; add to the company/registration section (match the file's existing field-declaration style — it is a display/form model over onboarding JSON, not an entity; no migration needed):

```ts
/** GSTIN (15 chars) — validated client-side; state derived from first two digits. */
gstin?: string;
/** PAN (10 chars, AAAAA9999A). */
pan?: string;
/** Business constitution. */
constitution?: "proprietorship" | "partnership" | "llp" | "private_limited" | "public_limited" | "other";
```

- [ ] **Step 3:** Mirror the section changes in `onboardingExportSections.ts` / `onboardingExportFormModel.ts` / `onboardingHtmlTemplate.ts`: delete 64-8 + DD export sections; add rows for GSTIN / PAN / Constitution in the company details section; the onboarding export now contains 2 signable documents (Registration, Change of Accountant).
- [ ] **Step 4:** DocuSeal: `grep -rn -i "648\|64-8\|hmrc\|direct.?debit" backend/src/docuseal` — remove those document types from prefill building, signature field names, remote-signature submission assembly, and webhook document handling. The flow must build/submit only Registration + Change of Accountant.
- [ ] **Step 5: Verify** — `cd backend && npm run build` → exit 0. `grep -rn -i "hmrc" backend/src` → zero hits.
- [ ] **Step 6: Commit** — `git commit -am "uk-removal: backend onboarding drops 64-8/direct debit, adds GSTIN/PAN/constitution"`

### Task 11: Backend currency strings GBP → INR

**Files:**
- Modify: `backend/src/customers/onboarding-templates/onboardingExportSections.ts` (lines ~139–160), `backend/src/customers/onboarding-templates/customerOnboarding.ts` (comment ~line 137), `backend/src/entities/subscription-plan.entity.ts` (comment ~line 29)

- [ ] **Step 1:** `grep -rn "GBP\|£\|en-GB" backend/src` — replace: `£` → `₹`, `toLocaleString("en-GB")` → `toLocaleString("en-IN")`, `(GBP)` → `(INR)`, `inc. VAT` → `incl. GST` (display strings only — DB columns named `vat_*` are untouched per spec).
- [ ] **Step 2: Verify** — `cd backend && npm run build`; the Step 1 grep returns zero hits.
- [ ] **Step 3: Commit** — `git commit -am "uk-removal: backend INR/GST display strings"`

---

## Chunk 3: Frontend UK removal, currency, verification

### Task 12: GSTIN utility with Vitest (TDD)

**Files:**
- Create: `frontend/src/utils/gstin.ts`, `frontend/src/utils/gstin.test.ts`
- Modify: `frontend/package.json` (add `vitest` devDependency + `"test": "vitest run"` script)

- [ ] **Step 1:** `cd frontend && npm install -D vitest` and add `"test": "vitest run"` to scripts. No config file needed (pure TS unit tests, node environment). If `tsc --noEmit` later complains about test globals, tests import everything from `vitest` explicitly (as below), so no ambient types are required.
- [ ] **Step 2: Write the failing test** — `frontend/src/utils/gstin.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GSTIN_STATE_NAMES, gstinCheckDigit, gstinStateName, isValidGstin, normalizeGstin } from "./gstin";

describe("gstin", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeGstin("  27aapfu0939f1zv ")).toBe("27AAPFU0939F1ZV");
  });

  it("computes the known check digit for a published sample GSTIN", () => {
    // Known-answer vector — pins the algorithm (weights 1,2 alternating from
    // index 0; sum of quotient+remainder mod 36). Do NOT derive this fixture
    // from gstinCheckDigit itself.
    expect(gstinCheckDigit("27AAPFU0939F1Z")).toBe("V");
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
  });

  it("accepts a structurally valid GSTIN whose check digit matches the computed one", () => {
    const first14 = "29AABCT1332L1Z";
    const full = first14 + gstinCheckDigit(first14);
    expect(isValidGstin(full)).toBe(true);
  });

  it("rejects a GSTIN with any other check digit", () => {
    const first14 = "27AAPFU0939F1Z";
    const good = gstinCheckDigit(first14);
    for (const c of "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      if (c === good) continue;
      expect(isValidGstin(first14 + c)).toBe(false);
    }
  });

  it("rejects wrong length, bad structure, bad state code", () => {
    expect(isValidGstin("")).toBe(false);
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false); // 14 chars
    expect(isValidGstin("00AAPFU0939F1Z" + gstinCheckDigit("00AAPFU0939F1Z"))).toBe(false); // state 00
    expect(isValidGstin("27AAPF10939F1ZV")).toBe(false); // 15 chars, digit inside the 5-letter PAN block
  });

  it("derives state from the first two digits", () => {
    expect(gstinStateName("27AAPFU0939F1ZV")).toBe("Maharashtra");
    expect(gstinStateName("07AAPFU0939F1ZV")).toBe("Delhi");
    expect(GSTIN_STATE_NAMES["29"]).toBe("Karnataka");
  });
});
```

- [ ] **Step 3: Run to verify failure** — `npx vitest run src/utils/gstin.test.ts` → FAIL (cannot resolve `./gstin`).
- [ ] **Step 4: Implement** — `frontend/src/utils/gstin.ts`:

```ts
/** GSTIN validation: structure regex + mod-36 check digit + state derivation. */

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const B36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Codes 25 (Daman & Diu, merged into 26) and 28 (pre-bifurcation AP) are
// intentionally absent per the current GST state-code list.
export const GSTIN_STATE_NAMES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
  "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
  "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
  "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra",
  "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala",
  "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands",
  "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory",
};

export function normalizeGstin(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Mod-36 check digit over the first 14 characters (weights 1,2,1,2,…; sum of quotient+remainder). */
export function gstinCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < first14.length; i++) {
    const v = B36.indexOf(first14[i]);
    if (v < 0) return "";
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return B36[(36 - (sum % 36)) % 36];
}

export function isValidGstin(raw: string): boolean {
  const g = normalizeGstin(raw);
  if (!GSTIN_REGEX.test(g)) return false;
  if (!(g.slice(0, 2) in GSTIN_STATE_NAMES)) return false;
  return gstinCheckDigit(g.slice(0, 14)) === g[14];
}

/** State name from the GSTIN's two-digit state code, or null. */
export function gstinStateName(raw: string): string | null {
  const g = normalizeGstin(raw);
  return GSTIN_STATE_NAMES[g.slice(0, 2)] ?? null;
}
```

- [ ] **Step 5: Run to verify pass** — `npx vitest run src/utils/gstin.test.ts` → all PASS. Also verify one additional real-world GSTIN (different from the 27AAPFU0939F1ZV fixture) against `isValidGstin` and record the result in the commit message (if it fails, re-check the check-digit weights before proceeding).
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: GSTIN validator (structure, check digit, state derivation) with vitest"`

### Task 13: Wizard restructure — 5 steps → 3, delete 64-8 + Direct Debit

**Files:**
- Modify: `frontend/src/components/customer-onboarding/CustomerOnboardingWizard.tsx` (STEPS/STEP_COUNT at lines 15–23 and the per-step render blocks at ~183–260)
- Delete: `frontend/src/components/customer-onboarding/Hmrc648AuthorisationForm.tsx`, `hmrcFormFields.tsx`, `DirectDebitForm.tsx`, `frontend/src/utils/hmrc648HtmlTemplate.ts`, `hmrcLogoSrc.ts`, `directDebitHtmlTemplate.ts`
- Delete: `frontend/public/hmrc-logo.png`, `frontend/public/hmrc-logo.svg`, `frontend/public/direct-debit-logo.svg`, `frontend/public/test-gov.png` (verify unused first)
- Modify (compiler-driven ripple): `frontend/src/components/customer-onboarding/finalreviewandsignature.tsx`, `OnboardingSignatureBlock.tsx`, `frontend/src/utils/onboardingSigningGate.ts`, `onboardingSignatureFile.ts`, `syncAuthorizedSignatoryName.ts`, `onboardingExportPdf.ts`, `onboardingExportSections.ts`, `onboardingExportFormModel.ts`, `onboardingHtmlTemplate.ts`, `frontend/src/types/customerOnboarding.ts`, `frontend/src/types/api.ts`, `frontend/src/api/client.ts`

- [ ] **Step 1:** Update the wizard:

```ts
const STEP_COUNT = 3;

const STEPS = [
  { n: 1, label: "Registration", short: "Registration" },
  { n: 2, label: "Change of Accountant", short: "Accountant" },
  { n: 3, label: "Review & Sign", short: "Review" },
] as const;
```

Remove the `step === 2` (64-8) and `step === 4` (Direct Debit) render blocks; renumber so Change of Accountant renders at step 2 and Review & Sign at step 3 (including the "ready to create the customer on step 5" logic, now step 3).

- [ ] **Step 2:** `git rm` the six HMRC/DD component/util files and the four public assets (first `grep -rn "test-gov\|direct-debit-logo\|hmrc-logo" frontend/src backend/src` to confirm no live references outside deleted files).
- [ ] **Step 3:** Compiler-driven cleanup: `cd frontend && npm run build`, then remove every dangling import/usage it reports — review tabs for 64-8/DD in `finalreviewandsignature.tsx`, their signature slots (`onboardingSigningGate.ts` drops from 4 required signatures to 2), export-PDF assembly, form-model types, and any `client.ts`/`api.ts` types for the removed docs. Repeat build until clean.
- [ ] **Step 4:** Run `npx vitest run` (gstin suite still green).
- [ ] **Step 5: Manual verify** — run both dev servers, walk the wizard: 3 steps shown, Registration → Accountant → Review; review tab shows 2 documents; signature gate requires 2 signatures; autosave PATCH succeeds.
- [ ] **Step 6: Commit** — `git commit -am "uk-removal: onboarding wizard 3 steps; delete HMRC 64-8 and Direct Debit"`

### Task 14: Registration step — India capture, remove CH lookup

**Files:**
- Modify: `frontend/src/components/customer-onboarding/ClientRegistrationForm.tsx` (remove CH lookup UI; add GSTIN/PAN/constitution fields), `frontend/src/pages/NewCustomerPage.tsx` (remove company-lookup usage), `frontend/src/api/client.ts` (remove company-lookup endpoint wrapper), `frontend/src/types/customerOnboarding.ts` + `frontend/src/types/api.ts` (drop CH types; add India fields matching Task 10's backend model)

- [ ] **Step 1:** Remove the Companies House lookup flow: `grep -n -i "companieshouse\|companies-house\|company.?lookup" frontend/src/api/client.ts frontend/src/pages/NewCustomerPage.tsx frontend/src/components/customer-onboarding/ClientRegistrationForm.tsx` — delete the endpoint wrappers, the lookup button/autofill UI, and CH-sourced field population. Relabel the company-number field to "Registration number (CIN/LLPIN)" and keep it optional free text. Keep the duplicate-registration-number gate if present (it is registry-agnostic).
- [ ] **Step 2:** Add India fields to the Registration form using the form's existing field components/styles:
  - **GSTIN** — text input, `maxLength` 15, uppercased on change; validate on blur with `isValidGstin`; error text `"Invalid GSTIN"`; when valid, render derived state below the field via `gstinStateName(value)` (muted text, e.g. "State: Maharashtra"). Optional field (unregistered businesses exist).
  - **PAN** — text input, validate `/^[A-Z]{5}[0-9]{4}[A-Z]$/` on blur; error `"Invalid PAN"`. Optional.
  - **Constitution** — select with options Proprietorship / Partnership / LLP / Private Limited / Public Limited / Other mapping to the union values from Task 10.
  Wire all three into the onboarding form model + autosave payload like neighboring fields.
- [ ] **Step 3:** Frontend export/preview parity: GSTIN/PAN/constitution rows appear in the review step and exported HTML/PDF (frontend `onboardingExportSections.ts` / `onboardingHtmlTemplate.ts`, mirroring Task 10's backend edits).
- [ ] **Step 4: Regenerate the registration PDF** — `npm run generate:pdf-template`; open it and confirm the GSTIN/PAN/Constitution rows render and the CH/64-8/DD content is gone (final regeneration — supersedes Task 5's interim one).
- [ ] **Step 5: Verify** — `npm run build` → exit 0; `grep -rn -i "companies.?house" frontend/src` (pattern matches `companies-house`, `companiesHouse`, and `companies_house`) → hits only in files Task 15 deletes or inert legacy-JSON key reads. Manual: enter valid/invalid GSTINs, see state derivation + validation errors; save; reload; values persist.
- [ ] **Step 6: Commit** — `git commit -am "feat: India onboarding capture (GSTIN/PAN/constitution); remove CH lookup"`

### Task 15: Dashboard — remove CH charts and UK deadline table

**Files:**
- Delete: `frontend/src/components/StaffCompaniesHouseCharts.tsx`, `frontend/src/components/StaffAccountsDeadlinesTable.tsx`
- Modify: `frontend/src/pages/AdminDashboardPage.tsx` (remove both widgets), `frontend/src/pages/CustomerDetailsPage.tsx` (remove CH data panels/deadline chips), `frontend/src/api/client.ts` + `frontend/src/types/api.ts` (drop the CH dashboard endpoint/types — the backend route was deleted in Task 9), `frontend/src/dashboard/onboarding-card-templates/registry.ts` + `types.ts` (remove cards driven by `companies_house.*` paths — "Accounts Due Date", "Confirmation Statement", CH sort fields)

> **Note:** between Task 9 (backend CH route deleted) and this task, the admin dashboard 404s on the CH aggregates fetch at runtime even though builds pass — expected on this branch, not a regression.

- [ ] **Step 1:** `git rm` the two components; remove usages from `AdminDashboardPage.tsx`; compiler-drive the rest (`npm run build`).
- [ ] **Step 2:** In `CustomerDetailsPage.tsx`, remove Companies House info sections (filing dates, CH status) — `grep -n -i "companies\|deadline" frontend/src/pages/CustomerDetailsPage.tsx` and prune.
- [ ] **Step 3:** Remove the CH-driven dashboard card templates: `grep -rn "companies_house" frontend/src/dashboard` — delete those card definitions and CH sort-field ids from the registry (the compiler won't catch these; they're string paths that would silently render empty cards).
- [ ] **Step 4: Verify** — `npm run build` → exit 0; `grep -rn -i "companies.?house" frontend/src` → only inert legacy-JSON key reads remain (e.g. onboarding save payload/display-root readers kept for legacy data). Dashboard renders without the removed widgets in dev.
- [ ] **Step 5: Commit** — `git commit -am "uk-removal: drop CH dashboard charts, deadline table, CH card templates"`

### Task 16: Frontend currency sweep GBP → INR

**Files:**
- Modify: `frontend/src/utils/subscriptionPlanUi.ts`, `subscriptionPlanRecommend.ts`, `onboardingExportSections.ts`, `onboardingExportFormModel.ts`, `frontend/src/pages/SubscriptionManagementPage.tsx`, `frontend/src/components/subscription/AddSubscription.tsx`, `SubscriptionServicesTab.tsx`, `frontend/src/types/customerOnboarding.ts`, `frontend/src/types/api.ts`

- [ ] **Step 1:** `grep -rn "£\|GBP\|en-GB" frontend/src` — apply uniformly: `£` → `₹`, `en-GB` → `en-IN`, `(GBP)` → `(INR)`, `inc. VAT` → `incl. GST` (display strings only). Keep the ₹ symbol adjacent to `toLocaleString("en-IN")` so amounts render with lakh/crore grouping.
- [ ] **Step 2: Verify** — the grep returns zero hits; `npm run build` → exit 0; Subscription pages show ₹ with en-IN grouping in dev.
- [ ] **Step 3: Commit** — `git commit -am "uk-removal: frontend INR currency formatting"`

### Task 17: Final sweep + CLAUDE.md + env cleanup

**Files:**
- Modify: `CLAUDE.md` (remove `companies-house/` from the module list; note deadline campaigns dormant pending GST fields; note frontend Vitest for `src/utils/gstin.test.ts`; onboarding autosave note: signatures now 2, body limit unchanged)
- Modify: `.env.compose.example`, `backend/.env.example` (remove `COMPANIES_HOUSE_*` vars if not already done in Task 9)

- [ ] **Step 1:** Full sweeps — each must return zero hits outside these allowed exceptions: `docs/superpowers/` (spec/plan history), migration files, the legacy `(?:3K|DHB)` client-ref regexes, and **inert `companies_house` JSON key strings retained for legacy onboarding data** (backend duplicate-registration SQL in `customers-page.service.ts`, frontend `onboardingSavePayload.ts` / `customerOnboardingDisplayRoot.ts` readers — same allowance as Task 9 Step 3):

```bash
grep -rn -i "3kltd\|3k ltd\|3KFinancial\|fs3k" --exclude-dir=node_modules --exclude-dir=.git .
grep -rn -i "hmrc\|companies.?house\|64-8" backend/src frontend/src
grep -rn "£\|en-GB" backend/src frontend/src
```

- [ ] **Step 2:** Update CLAUDE.md per the Files note.
- [ ] **Step 3: Full verification** — `cd backend && npm run build` → exit 0; `cd frontend && npm run build` → exit 0; `cd frontend && npx vitest run` → PASS; boot both dev servers and walk: login → dashboard (no CH widgets) → new customer onboarding (3 steps, India fields, 2 signatures) → customer details (no CH panels) → subscriptions (₹) → notification settings (deadline panel empty-state).
- [ ] **Step 4: Commit** — `git commit -am "uk-removal: final sweep, CLAUDE.md and env cleanup"`
