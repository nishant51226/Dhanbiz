# Design: UK → India compliance conversion (GST, Tally, ledger reports, AI provider migration, rebrand)

**Date:** 2026-07-12
**Status:** Approved in brainstorming; pending implementation plans
**Repo:** Dhanbiz monorepo (NestJS backend + React frontend)

## Goal

Re-purpose the platform (built for a UK client) for an Indian client: GST return preparation and export, Tally import/export, Indian accounting reports from a new ledger core, migration of AI document parsing off Ollama, and a full rebrand from 3kltd to Dhanbiz. India-only fork — UK-specific modules are removed, not abstracted.

## Decision log

| Decision | Choice |
|---|---|
| Jurisdiction strategy | India-only fork; UK modules removed |
| GSTR scope (first release) | GSTR-1, GSTR-3B, GSTR-2A/2B reconciliation, HSN/SAC summary; GSTR-9 last |
| GSTIN model | Multi-GSTIN per customer (`gst_registrations` table) from day one |
| Filing cadence | Monthly and QRMP, per registration |
| Tally target | TallyPrime XML (masters + vouchers); backward-compatible with ERP 9 |
| Ledger input formats | Tally XML, Excel (.xlsx) template, CSV template |
| Source of truth | Posted vouchers. AI-extracted invoices convert to *draft* vouchers only |
| Ledger architecture | Full double-entry voucher core mirroring Tally's model |
| AI providers | OpenAI, Bedrock, Hugging Face. Default/fallback order: Bedrock → OpenAI → HF; fail fast when none configured |
| User surfaces | Staff app and customer portal both at launch |
| Report format | Tally-style grouped P&L/Balance Sheet; INR lakh/crore grouping; FY April–March |
| GST filing workflow | Phase 1 manual (export file, user uploads to portal); Phase 2 GSP API behind the same `GstFilingChannel` interface |
| Onboarding flow | Kept; CH/HMRC replaced with India capture (GSTIN validation, PAN, constitution) |
| Deadline campaigns | Kept; UK date fields replaced with GST due dates (per-registration frequency) + custom dates |
| Filed-period policy | Filed returns lock their vouchers; reopen-to-draft gated by `gst:file`; amendments out of scope Phase 1 |

## Workstreams and build order

```
E. Rebrand + UK removal      — independent; first (touches everything superficially)
A. AI provider migration     — independent; subtractive
B. Ledger core + Tally I/O   — foundation
C. Accounting reports        — reads B
D. GST returns engine        — reads B; consumes AI pipeline via draft vouchers
```

Each workstream gets its own implementation plan and is built/verified separately. All follow existing repo conventions: new `*Module`s wired into `AppModule`, entities registered in the `entities:` array and `TypeOrmModule.forFeature`, migrations hand-registered in `typeorm-migrations.registry.ts`, RLS enabled + policies **in the same migration** as each new table, permission keys seeded by migration, frontend endpoints added to `src/api/client.ts`, staff/portal pages gated by `<Can />`.

New backend domains: `ledger/` (accounts, vouchers, import/export, reports) and `gst/` (registrations, return builders, exports, reconciliation).

---

## Workstream B — Ledger core

### Data model

All per-tenant tables carry `customer_id` with RLS policies per the existing pattern. Monetary columns are `numeric(15,2)` — never floating point.

- **`account_groups`** — global seed of Tally's 28 standard groups (Capital Account, Loans (Liability), Current Liabilities, Fixed Assets, Sundry Debtors, Sundry Creditors, Sales Accounts, Purchase Accounts, …) with `nature` (asset | liability | income | expense) and `affects_gross_profit` (drives the Trading vs P&L split). Tenants may add sub-groups referencing a parent group.
- **`gst_registrations`** — per customer: GSTIN, state code, trade name, filing frequency (`monthly | qrmp`), active flag. Vouchers and returns are scoped to one registration.
- **`ledger_accounts`** — per customer: name, group ref, opening balance + as-of date (opening balances apply at whole-customer scope; registration-scoped reports cover period movements only), and GST attributes: party GSTIN, party state code (drives CGST+SGST vs IGST), **party registration type** (`regular | composition | unregistered | uin_holder | sez | overseas` — needed for GSTR-3B table 3.2 and B2B classification; not derivable from GSTIN alone), default HSN/SAC, default tax rate, `gst_ledger_role` (`none | output_tax | input_tax | cess | party | expense_income`). The role tag is what makes return generation deterministic (same mechanism as Tally's "GST applicability" on ledger masters). Tally imports carry it in the XML; Excel/CSV imports set it in the mapping step.
- **`vouchers`** — per customer: registration ref (**nullable** — books without a GSTIN participate in accounting reports but not GST returns), type (`sales | purchase | payment | receipt | journal | contra | credit_note | debit_note`), voucher number, date, party ledger ref, narration, `source` (`tally_import | manual | ai_extraction | excel_import | csv_import`), `status` (`draft | posted`), `is_reverse_charge` flag (drives GSTR-3B 3.1(d)), `supply_type` (`domestic | export_with_payment | export_without_payment | sez_with_payment | sez_without_payment | deemed_export` — drives GSTR-1 exports section; defaults to `domestic`), optional `financial_document_id` link for AI-sourced vouchers. Draft vouchers are excluded from all reports and returns. Posting a registration-less voucher with GST-tagged lines emits a warning (those lines can never reach a return). Posted vouchers in a period whose return is `filed` are **locked** (see return lifecycle).
- **`voucher_lines`** — ledger ref, signed `amount` (positive = debit, negative = credit), and for GST-relevant lines: taxable value, HSN/SAC, rate, CGST/SGST/IGST/cess amounts, item description/qty/unit (needed for the GSTR-1 HSN summary and Tally round-trip). Service-level check + DB constraint enforce Σ debits = Σ credits on posted vouchers.

### Import pipeline

One flow, three format adapters, one normalized intermediate:

```
upload → FormatAdapter (tally-xml | xlsx | csv) → ParsedBatch (masters + vouchers)
      → validation report (unbalanced vouchers, unknown ledgers, invalid GSTINs,
        duplicate voucher numbers)
      → user review screen (create missing ledgers, map columns, fix or skip rows)
      → commit: upsert ledger_accounts, insert vouchers as posted
```

- **Tally XML adapter** parses TallyPrime `ENVELOPE/TALLYMESSAGE` Masters and Vouchers exports (ledger masters: group, opening balance, GSTIN, GST role; vouchers: `ALLLEDGERENTRIES.LIST`). Runs as a pg-boss queue job (large files), like the extraction pipeline.
- **Excel/CSV adapters** share one tabular-mapping layer over a published Dhanbiz template (one sheet for ledger masters, one for voucher lines), with a column-mapping step in the review UI for near-miss files.
- Imports are idempotent on `(registration, voucher_type, voucher_number, date)` — re-importing the same export updates rather than duplicates. If a matched voucher was manually edited since its last import (`source` changed or updated-at newer than import), the re-import does **not** silently overwrite it — it's flagged in the validation report for a per-voucher keep/replace choice.
- Imports never partially commit: validation report first, explicit user commit after.

### Export

`TallyXmlExporter` renders masters + vouchers back to TallyPrime import XML — the reverse mapping of the import adapter. Verified by a round-trip test: import → export → re-import yields identical vouchers.

### AI bridge

A "Convert to voucher" action on extracted invoices maps `InvoiceEntity` → draft sales/purchase voucher: party ledger matched by GSTIN then name, tax split (CGST+SGST vs IGST) computed from party state vs registration state. Always lands as `draft` — extraction output never posts books directly.

---

## Workstream C — Accounting reports

Pure reads over posted vouchers, scoped to a registration (or whole customer) and date range. Backend returns JSON; frontend renders; export to XLSX (reusing `reports/document-report-xlsx.builder.ts` patterns) and PDF.

Reports: Trial Balance · Profit & Loss (Trading account + P&L split via `affects_gross_profit`) · Balance Sheet (Tally-style grouped) · Cash Book and Bank Book (per cash/bank ledger with running balance) · Day Book (chronological vouchers) · Ledger statement (opening → transactions → closing per account). Registration-scoped runs of balance-carrying reports show period movements only (opening balances apply at whole-customer scope — see workstream B).

Formatting: INR with lakh/crore digit grouping (`en-IN`), FY April–March, "as at"/"for the period" headers.

---

## Workstream D — GST returns engine

Three layers, designed so Phase 2 (direct portal API via a GSP) plugs in without touching builders or lifecycle.

1. **Return builders** — one class per form implementing `ReturnBuilder`: input `(registration, period)`, output a canonical typed JSON payload matching the form's table structure.
   - `Gstr1Builder`: B2B, B2CL, B2CS, CDNR/CDNUR, exports, HSN summary, document series — from posted sales/credit-note vouchers.
   - `Gstr3bBuilder`: tables 3.1 (outward, incl. 3.1(d) inward supplies liable to reverse charge — from purchase vouchers flagged reverse-charge), 3.2 (inter-state supplies to unregistered/composition/UIN, derived from party state + registration type on the same vouchers), 4 (ITC), 5 — summed from `output_tax`/`input_tax` ledger tags.
   - `Gstr9Builder` (built last): annual roll-up over the FY's stored return payloads.
   - HSN/SAC summary also exposed as a standalone report.
   - Builders emit blocking issues (unbalanced voucher in period, B2B invoice missing party GSTIN) vs warnings (missing HSN below turnover threshold).
2. **Return lifecycle** — `gst_returns` table: registration, form type, period, status (`draft → reviewed → exported → filed`), payload JSON, generated-at, user-entered filing reference. Regeneration diffs against the prior payload so reviewers see what changed.
   - **Period locking:** once a return is `filed`, posted vouchers in that (registration, period) are locked against edit/delete, and new vouchers dated into the period are accepted but flagged as "post-filing" (they surface in the next period's builder warnings). Unlocking requires reopening the return to `draft` (gated by `gst:file`), which records who/when.
   - **QRMP semantics:** for QRMP registrations, GSTR-1 and GSTR-3B periods are quarters; monthly IFF (invoice furnishing facility) is **out of scope Phase 1** — QRMP users file B2B invoices monthly on the portal directly if they choose, and the quarterly GSTR-1 payload includes all quarter invoices not already furnished (Phase 1 keeps it simple: full quarter, no IFF dedup).
   - **Amendments:** GSTR-1 amendment tables (B2BA, CDNRA, B2CSA) are out of scope Phase 1; corrections to filed periods are handled the manual way (amend on the portal directly).
   - **Deadline integration:** workstream D's plan also delivers E.3 slice two — GSTR-1/GSTR-3B due-date fields (derived from each registration's filing frequency) plus free-form custom deadlines in the deadline-campaign subsystem.
3. **Export + filing channel** — exporters render stored payloads to GST-portal offline-tool JSON (GSTR-1) and XLSX (3B worksheet, HSN). `GstFilingChannel` interface; Phase 1 ships `ManualDownloadChannel` (produce file → user uploads to portal → marks filed). Phase 2 adds `GspApiChannel` against a GSP/ASP API implementing the same interface.

**GSTR-2A/2B reconciliation:** user uploads the portal-downloaded GSTR-2B JSON (or Excel); matcher joins against purchase vouchers on (supplier GSTIN, normalized invoice number, date tolerance, amount tolerance — tolerances configurable per run) and buckets: matched, amount mismatch, missing in books, missing in 2B. Invoice-number normalization: uppercase, trim, strip separators (`-`, `/`, spaces) and leading zeros before comparing. Results persist per period with an exportable worksheet; drives ITC review for 3B.

---

## Workstream A — AI provider migration (remove Ollama)

The provider layer is already pluggable (`ExtractPipelineDeps` with `visionChat`/`structureChat`, factory in `ai/providers/factory.ts`); this is removal plus a fallback-policy change.

- Delete `ai/providers/ollama.provider.ts` and `src/ollama.ts`; move the provider-neutral `ChatMessage` type into `ai/types.ts`.
- Narrow `AiProviderId` to `"openai" | "bedrock" | "huggingface"` — the compiler surfaces every remaining reference (factory, `queue.service.ts`, `legacy-extract.controller.ts`, `extractPipeline.ts`, extraction modules, frontend job pages).
- Fallback order: **bedrock → openai → huggingface**. With none configured: `listEnabledProviders()` returns empty, job submission is rejected with an explicit "no AI provider configured" error, frontend job pages render that state instead of a provider picker. No silent degradation.
- Migration NULLs `jobs.ai_provider = 'ollama'` rows (they then resolve to the server default). Note for the plan: the factory's current hard-coded fallback default is `"ollama"` (`normalizeDefault`, `pickFirstEnabled`); the NULL-resolution path must be re-verified after `AiProviderId` is narrowed.
- Infra: remove the `ollama` service and `docker/ollama/`; delete `docker-compose.ollama.yml`; promote the without-Ollama compose variant to the single canonical `docker-compose.yml`. Strip `OLLAMA_*` from `.env.example` and `.env.compose.example`. Update docs and CLAUDE.md.

---

## Workstream E — Rebrand (3kltd → Dhanbiz) + UK removal

**Rebrand:** sweep all `3kltd` variants (case/spacing/domain forms — the plan re-greps for the authoritative list) across `package.json` names, `vite.config.ts`, nginx Dockerfile, onboarding HTML templates, e2e docs, `.dockerignore`, tests, and the `backend/3khelp/` Docusaurus help site. Replace logo/favicon assets.

**UK removal** — three coupled subsystems, each with a decided disposition:

1. **Companies House:** delete the `companies-house/` module and `company-lookup.controller.ts`, plus its ripple: the CH-snapshot refresh job in `queue/queue.service.ts`, CH references in `customers-page.service.ts` / `customers-page.controller.ts`, and CH fields in the four onboarding-template files. The compiler surfaces the rest after module deletion.
2. **Onboarding — replaced with India equivalents:** the guided onboarding flow survives, but CH lookup and HMRC 64-8 authorization are removed and replaced with India capture: GSTIN (checksum/format validation, state auto-derived from the first two digits), PAN, business constitution (proprietorship/partnership/LLP/company). Files removed on both sides: backend `customers/onboarding-templates/hmrc648HtmlTemplate.ts` + HMRC logo asset; frontend `utils/hmrc648HtmlTemplate.ts`, `components/customer-onboarding/hmrcFormFields.tsx`, `utils/hmrcLogoSrc.ts`, `public/hmrc-logo.{png,svg}`.
3. **Deadline campaigns — repointed to GST due dates, in two slices:** the notification subsystem (8 files, 3 entities, 3 migrations) is kept. **E's plan covers slice one only**: remove the UK date fields from `notification/deadline-campaign-date-fields.ts` (CH accounts due, confirmation statement, VAT return due) and flip the campaign timezone constant from `Europe/London` to `Asia/Kolkata` (`DEADLINE_CAMPAIGN_TIMEZONE`, `londonDateKey()`), leaving campaigns dormant (no watchable fields). Slice two — adding GSTR-1/GSTR-3B due-date fields derived from each registration's filing frequency plus free-form custom deadlines — is sequenced **after workstream B** (needs `gst_registrations`) and belongs to workstream D's plan.

Currency defaults flip GBP → INR. VAT columns and the subscription module stay structurally (jurisdiction-neutral); the seeded UK plan catalog needs an India replacement (open item — business input).

---

## Cross-cutting

**Permissions** (seeded by migration; `docs/permissions-reference.md` updated):
- Staff: `ledger:read`, `ledger:write`, `ledger:import`, `gst:read`, `gst:write`, `gst:file`
- Portal: `portal:ledger:read`, `portal:ledger:import`, `portal:gst:read`, `portal:gst:export`

**RLS:** every new table gets `ENABLE ROW LEVEL SECURITY` + policies in the same migration that creates it, matching existing `*RlsWritePolicies` patterns. `account_groups` global rows are read-only reference data.

**Testing (targeted improvement):** add Vitest to the backend scoped to the new pure-logic units only — format adapters, return builders, report calculators — driven by fixture files (real Tally XML exports, golden GSTR JSON outputs) plus the Tally round-trip test. No e2e framework; no retrofitting tests onto existing code. Everything else verifies per existing convention (`npm run build`, manual dev-server flows).

## Open items (do not block implementation planning)

1. Dhanbiz brand assets (logo, favicon, colors) — supplied or generated placeholders?
2. `frontend/public/.well-known/assetlinks.json` and `apple-app-site-association` reference a mobile app package ID — new Dhanbiz app IDs, or delete if no mobile app ships?
3. India subscription plan catalog and INR pricing (business input).
4. GSTR-2B JSON schema version to pin fixtures against (verify current portal format at build time).

## Out of scope (Phase 1)

- Direct GST portal API filing (Phase 2, via `GspApiChannel`)
- E-invoicing (IRN generation) and e-way bills
- Composition scheme (GSTR-4 / CMP-08)
- GSTR-1 amendment tables (B2BA / CDNRA / B2CSA) — filed-period corrections happen on the portal
- QRMP monthly IFF (invoice furnishing facility) — quarterly payloads carry the full quarter
- TDS/TCS returns (GSTR-7/8)
- Schedule III statutory P&L/Balance Sheet presentation
- Inventory/stock-item accounting (voucher lines carry item description/qty only for HSN summary and Tally fidelity)
